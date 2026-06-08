import * as vscode from 'vscode';
import { ChezmoiCli } from './chezmoi/cli';
import { ChezmoiContext } from './chezmoi/context';
import { CommandQueue } from './chezmoi/queue';
import { StatusService } from './services/statusService';
import { GitSyncService } from './services/gitSyncService';
import { Logger } from './util/log';
import { PreviewProvider } from './features/preview/provider';
import { registerPreview } from './features/preview/commands';
import { StatusBar } from './features/statusBar/item';
import { registerWatcher } from './features/watcher';
import {
  CHANGES_VIEW_ID,
  ChangesTreeProvider,
  MANAGED_VIEW_ID,
  ManagedTreeProvider,
} from './features/tree/provider';
import { ChezmoiDecorationProvider } from './features/tree/decorations';
import { WriteTerminal } from './features/writeTerminal';
import { registerCommands } from './commands';

const INSTALL_URL = 'https://www.chezmoi.io/install/';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const log = new Logger();
  context.subscriptions.push(log);

  const binaryProvider = (): string =>
    vscode.workspace.getConfiguration('chezmoi').get<string>('executable', 'chezmoi') || 'chezmoi';
  const cli = new ChezmoiCli(binaryProvider, ({ args, result }) => log.command(args, result));
  const queue = new CommandQueue();

  const writeTerminal = new WriteTerminal(binaryProvider);
  context.subscriptions.push(writeTerminal);

  const chezmoi = new ChezmoiContext(cli);
  context.subscriptions.push(chezmoi);

  // Mirror the resolved state into a context key so the views' welcome content
  // (install / initialize / empty) can branch on it. `initialize()` fires
  // onDidChange, so the subscription keeps this in sync; seed it once up front
  // for the brief window before the first resolution completes.
  const syncStateContext = (): void => {
    void vscode.commands.executeCommand('setContext', 'chezmoiState', chezmoi.state);
  };
  context.subscriptions.push(chezmoi.onDidChange(syncStateContext));
  syncStateContext();

  const statusService = new StatusService(cli, chezmoi, queue, log);
  context.subscriptions.push(statusService);

  const gitSyncService = new GitSyncService(cli, chezmoi, queue);
  context.subscriptions.push(gitSyncService);

  const previewProvider = new PreviewProvider(cli, chezmoi, queue);
  context.subscriptions.push(previewProvider, ...registerPreview(chezmoi, previewProvider));

  const statusBar = new StatusBar(chezmoi, statusService);
  context.subscriptions.push(statusBar);

  // F2 toast reminder: notify only when pending count grows (new changes),
  // never on initial load or after an apply reduces the count.
  let lastPendingCount = -1;
  context.subscriptions.push(
    statusService.onDidChange((entries) => {
      const count = entries.length;
      const mode = vscode.workspace
        .getConfiguration('chezmoi')
        .get<string>('notifications.applyReminder', 'statusBarOnly');
      if (mode === 'toast' && lastPendingCount >= 0 && count > lastPendingCount) {
        void vscode.window
          .showInformationMessage(`chezmoi: ${count} pending change${count === 1 ? '' : 's'}.`, 'Apply')
          .then((choice) => {
            if (choice === 'Apply') {
              void vscode.commands.executeCommand('chezmoi-vsc.apply');
            }
          });
      }
      lastPendingCount = count;
    }),
  );

  const changesProvider = new ChangesTreeProvider(chezmoi, statusService);
  const managedProvider = new ManagedTreeProvider(chezmoi, statusService);
  const changesView = vscode.window.createTreeView(CHANGES_VIEW_ID, {
    treeDataProvider: changesProvider,
  });
  const managedView = vscode.window.createTreeView(MANAGED_VIEW_ID, {
    treeDataProvider: managedProvider,
  });
  context.subscriptions.push(changesProvider, managedProvider, changesView, managedView);

  // Activity-bar-style badge with the pending count on the Changes view.
  const updateChangesBadge = (): void => {
    const count = statusService.pendingCount;
    changesView.badge =
      count > 0
        ? { value: count, tooltip: `${count} pending chezmoi change${count === 1 ? '' : 's'}` }
        : undefined;
  };
  context.subscriptions.push(statusService.onDidChange(updateChangesBadge));
  updateChangesBadge();

  const decorationProvider = new ChezmoiDecorationProvider(chezmoi, statusService);
  context.subscriptions.push(decorationProvider, vscode.window.registerFileDecorationProvider(decorationProvider));

  context.subscriptions.push(
    ...registerCommands({
      cli,
      context: chezmoi,
      queue,
      statusService,
      gitSyncService,
      previewProvider,
      writeTerminal,
    }),
  );

  // Mutating commands run in the write terminal; refresh status once each
  // finishes (shell integration provides the completion signal). `chezmoi init`
  // is the one write that can change source-dir resolution, and it's the only
  // command that runs while not yet ok — so re-resolve the context in that case
  // to pick up a freshly created source directory before refreshing status.
  context.subscriptions.push(
    vscode.window.onDidEndTerminalShellExecution(async (event) => {
      if (writeTerminal.owns(event.terminal)) {
        if (chezmoi.state !== 'ok') {
          await chezmoi.initialize();
        }
        void statusService.refresh();
        void gitSyncService.refresh();
      }
    }),
  );

  // The watcher binds to a concrete source dir, so (re)create it whenever the
  // resolved context changes.
  let watcherDisposables: vscode.Disposable[] = [];
  const rebuildWatcher = (): void => {
    watcherDisposables.forEach((d) => d.dispose());
    watcherDisposables = registerWatcher(chezmoi, statusService);
  };
  context.subscriptions.push(chezmoi.onDidChange(rebuildWatcher), {
    dispose: () => watcherDisposables.forEach((d) => d.dispose()),
  });

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (event) => {
      if (event.affectsConfiguration('chezmoi.executable') || event.affectsConfiguration('chezmoi.sourceDir')) {
        await chezmoi.initialize();
        await statusService.refresh();
        void gitSyncService.refresh();
      }
      if (event.affectsConfiguration('chezmoi.git.aheadBehind')) {
        void gitSyncService.refresh();
      }
      if (event.affectsConfiguration('chezmoi.statusBar.enabled')) {
        statusBar.refresh();
      }
    }),
  );

  await chezmoi.initialize();
  if (chezmoi.state === 'notInstalled') {
    void vscode.window
      .showWarningMessage('chezmoi binary not found. Install chezmoi to use this extension.', 'Install chezmoi')
      .then((choice) => {
        if (choice) {
          void vscode.env.openExternal(vscode.Uri.parse(INSTALL_URL));
        }
      });
  }
  await statusService.refresh();
  void gitSyncService.refresh();
}

export function deactivate(): void {}
