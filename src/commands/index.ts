import * as path from 'node:path';
import * as vscode from 'vscode';
import { ChezmoiCli } from '../chezmoi/cli';
import { ChezmoiContext } from '../chezmoi/context';
import { parseSourcePath } from '../chezmoi/paths';
import { CommandQueue } from '../chezmoi/queue';
import { StatusService } from '../services/statusService';
import { openDiff } from '../features/diff/open';
import { PreviewProvider } from '../features/preview/provider';
import { WriteTerminal } from '../features/writeTerminal';
import { TREE_VIEW_ID } from '../features/tree/provider';

const INSTALL_URL = 'https://www.chezmoi.io/install/';

/**
 * Extract a target-relative path from a command argument. Both tree FileNodes
 * and StatusEntry objects expose `targetRelPath`, so this covers context-menu
 * invocations (which pass the node) and click commands alike.
 */
export function toTargetRel(arg: unknown): string | undefined {
  if (!arg || typeof arg !== 'object') {
    return undefined;
  }
  const candidate = arg as { targetRelPath?: unknown };
  return typeof candidate.targetRelPath === 'string' ? candidate.targetRelPath : undefined;
}

export interface CommandDeps {
  cli: ChezmoiCli;
  context: ChezmoiContext;
  queue: CommandQueue;
  statusService: StatusService;
  previewProvider: PreviewProvider;
  writeTerminal: WriteTerminal;
}

export function registerCommands(deps: CommandDeps): vscode.Disposable[] {
  const { cli, context, queue, statusService, previewProvider, writeTerminal } = deps;

  const requireReady = (): boolean => {
    if (context.available) {
      return true;
    }
    const message =
      context.state === 'notInstalled'
        ? 'chezmoi binary not found. Install chezmoi to use this command.'
        : 'chezmoi source directory not found. Run `chezmoi init` first.';
    void vscode.window.showWarningMessage(message);
    return false;
  };

  // chezmoi resolves target arguments against cwd, but status/managed report
  // paths relative to $HOME — so always hand chezmoi an absolute target path.
  const targetAbs = (relPath: string): string => path.join(context.homeDir, relPath);

  // Mutating commands run in a terminal so chezmoi's interactive prompts
  // (overwrite confirmation, decryption, scripts) get a real TTY. Status is
  // refreshed by the terminal's shell-execution-end event (see extension.ts).
  const runWrite = (args: string[]): void => {
    if (!requireReady()) {
      return;
    }
    writeTerminal.run(args);
  };

  // Resolve the file/folder paths to add from any entry point: explorer
  // multi-select (uri, uris[]), a single resource (tab / single explorer item),
  // or the active editor (command palette).
  const resolveAddTargets = (arg: unknown, args: unknown): string[] => {
    if (Array.isArray(args)) {
      const uris = args.filter((u): u is vscode.Uri => u instanceof vscode.Uri && u.scheme === 'file');
      if (uris.length > 0) {
        return uris.map((u) => u.fsPath);
      }
    }
    if (arg instanceof vscode.Uri && arg.scheme === 'file') {
      return [arg.fsPath];
    }
    const active = vscode.window.activeTextEditor?.document.uri;
    if (active && active.scheme === 'file') {
      return [active.fsPath];
    }
    return [];
  };

  // Toggle encryption on a managed file: forget --force the current source,
  // then re-add from $HOME with (or without) --encrypt. Template-ness is
  // preserved by inspecting the existing source filename first — `chezmoi add`
  // detects file mode but not `.tmpl`, so we must opt in explicitly.
  const reAddWithEncryption = async (rel: string, encrypt: boolean): Promise<void> => {
    if (!requireReady()) {
      return;
    }
    const abs = targetAbs(rel);

    // Resolve current source path before forgetting, so we can read attributes.
    const srcResult = await queue.runRead(() =>
      cli.exec(['source-path', abs], { cwd: context.sourceDir, timeout: 5000 }),
    );
    const srcAbs = srcResult.stdout.trim();
    if (srcResult.code !== 0 || srcAbs.length === 0) {
      void vscode.window.showErrorMessage(`chezmoi: cannot resolve source path for ${rel}.`);
      return;
    }

    let isTemplate = false;
    if (context.sourceDir) {
      const srcRel = path.relative(context.sourceDir, srcAbs).split(path.sep).join('/');
      isTemplate = parseSourcePath(srcRel).isTemplate;
    }

    const addFlags: string[] = [];
    if (encrypt) {
      addFlags.push('--encrypt');
    }
    if (isTemplate) {
      addFlags.push('--template');
    }
    writeTerminal.runChained([
      ['forget', '--force', abs],
      ['add', ...addFlags, abs],
    ]);
  };

  const addPaths = (fsPaths: string[]): void => {
    if (!requireReady()) {
      return;
    }
    if (fsPaths.length === 0) {
      void vscode.window.showWarningMessage('chezmoi: no file to add.');
      return;
    }
    const addable = fsPaths.filter((p) => !context.isInsideSource(p));
    const skipped = fsPaths.length - addable.length;
    if (addable.length === 0) {
      void vscode.window.showWarningMessage('chezmoi: selected file(s) are already in the source directory.');
      return;
    }
    if (skipped > 0) {
      void vscode.window.showInformationMessage(`chezmoi: skipped ${skipped} item(s) already in the source directory.`);
    }
    runWrite(['add', ...addable]);
  };

  const register = vscode.commands.registerCommand;
  const disposables: vscode.Disposable[] = [];

  disposables.push(
    register('chezmoi-vsc.apply', () => {
      runWrite(['apply']);
    }),

    register('chezmoi-vsc.applyFile', (arg?: unknown) => {
      const rel = toTargetRel(arg);
      if (!rel) {
        return;
      }
      runWrite(['apply', targetAbs(rel)]);
    }),

    register('chezmoi-vsc.reAdd', (arg?: unknown) => {
      const rel = toTargetRel(arg);
      if (!rel) {
        return;
      }
      runWrite(['re-add', targetAbs(rel)]);
    }),

    register('chezmoi-vsc.forget', async (arg?: unknown) => {
      const rel = toTargetRel(arg);
      if (!rel) {
        return;
      }
      const confirm = await vscode.window.showWarningMessage(
        `Forget "${rel}"? chezmoi will stop managing it (the file in $HOME is kept).`,
        { modal: true },
        'Forget',
      );
      if (confirm !== 'Forget') {
        return;
      }
      runWrite(['forget', targetAbs(rel)]);
    }),

    register('chezmoi-vsc.encrypt', async (arg?: unknown) => {
      const rel = toTargetRel(arg);
      if (!rel) {
        return;
      }
      const choice = await vscode.window.showWarningMessage(
        `Encrypt "${rel}"? chezmoi will forget the source and re-add it with encryption. Make sure encryption is configured in your chezmoi config.`,
        { modal: true },
        'Encrypt',
      );
      if (choice !== 'Encrypt') {
        return;
      }
      await reAddWithEncryption(rel, true);
    }),

    register('chezmoi-vsc.decrypt', async (arg?: unknown) => {
      const rel = toTargetRel(arg);
      if (!rel) {
        return;
      }
      const choice = await vscode.window.showWarningMessage(
        `Decrypt "${rel}"? The source will be rewritten as plaintext — anyone with access to your source directory can read it.`,
        { modal: true },
        'Decrypt',
      );
      if (choice !== 'Decrypt') {
        return;
      }
      await reAddWithEncryption(rel, false);
    }),

    register('chezmoi-vsc.addCurrentFile', () => {
      addPaths(resolveAddTargets(undefined, undefined));
    }),

    register('chezmoi-vsc.addFile', (arg?: unknown, args?: unknown) => {
      addPaths(resolveAddTargets(arg, args));
    }),

    register('chezmoi-vsc.refresh', async () => {
      await context.initialize();
      await statusService.refresh();
    }),

    register('chezmoi-vsc.showStatus', async () => {
      await statusService.refresh();
      await vscode.commands.executeCommand(`${TREE_VIEW_ID}.focus`);
    }),

    register('chezmoi-vsc.openDiff', async (arg?: unknown) => {
      const rel = toTargetRel(arg);
      if (!rel || !requireReady()) {
        return;
      }
      await openDiff(context, previewProvider, rel);
    }),

    register('chezmoi-vsc.openEntry', async (arg?: unknown) => {
      const rel = toTargetRel(arg);
      if (!rel || !requireReady()) {
        return;
      }
      const action = vscode.workspace.getConfiguration('chezmoi').get<string>('tree.clickAction', 'diff');
      if (action === 'source') {
        await vscode.commands.executeCommand('chezmoi-vsc.openSource', arg);
      } else if (action === 'target') {
        await vscode.commands.executeCommand('chezmoi-vsc.openTarget', arg);
      } else {
        await openDiff(context, previewProvider, rel);
      }
    }),

    register('chezmoi-vsc.showDiff', async () => {
      if (!requireReady()) {
        return;
      }
      const result = await queue.runRead(() => cli.exec(['diff'], { cwd: context.sourceDir, timeout: 30000 }));
      if (result.stdout.trim().length === 0) {
        void vscode.window.showInformationMessage('chezmoi: no remaining differences.');
        return;
      }
      const doc = await vscode.workspace.openTextDocument({
        content: result.stdout,
        language: 'diff',
      });
      await vscode.window.showTextDocument(doc, { preview: true });
    }),

    register('chezmoi-vsc.openSource', async (arg?: unknown) => {
      const rel = toTargetRel(arg);
      if (!rel || !requireReady()) {
        return;
      }
      // Encrypted source files are unreadable ciphertext on disk — route
      // through `chezmoi edit`, which decrypts to a temp file, opens it
      // in $EDITOR, and re-encrypts on close. Forcing EDITOR=code --wait
      // gives the user a normal VS Code tab to edit in.
      if (statusService.encrypted.has(rel)) {
        writeTerminal.run(['edit', targetAbs(rel)], {
          env: { EDITOR: 'code --wait' },
        });
        return;
      }
      const result = await queue.runRead(() =>
        cli.exec(['source-path', targetAbs(rel)], {
          cwd: context.sourceDir,
          timeout: 5000,
        }),
      );
      const sourcePath = result.stdout.trim();
      if (result.code !== 0 || sourcePath.length === 0) {
        void vscode.window.showErrorMessage(`chezmoi: cannot resolve source path for ${rel}`);
        return;
      }
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(sourcePath));
      await vscode.window.showTextDocument(doc);
    }),

    register('chezmoi-vsc.openTarget', async (arg?: unknown) => {
      const rel = toTargetRel(arg);
      if (!rel) {
        return;
      }
      const target = vscode.Uri.file(targetAbs(rel));
      try {
        const doc = await vscode.workspace.openTextDocument(target);
        await vscode.window.showTextDocument(doc);
      } catch {
        void vscode.window.showWarningMessage(`chezmoi: target file does not exist yet: ${rel}`);
      }
    }),

    register('chezmoi-vsc.copyTargetPath', async (arg?: unknown) => {
      const rel = toTargetRel(arg);
      if (!rel) {
        return;
      }
      await vscode.env.clipboard.writeText(targetAbs(rel));
    }),

    register('chezmoi-vsc.editConfig', async () => {
      const configFile = await findConfigFile(context.homeDir);
      if (!configFile) {
        void vscode.window.showWarningMessage('chezmoi: no config file found under ~/.config/chezmoi/');
        return;
      }
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(configFile));
      await vscode.window.showTextDocument(doc);
    }),

    register('chezmoi-vsc.openSourceDirectory', async () => {
      if (!context.sourceDir) {
        void vscode.window.showWarningMessage('chezmoi: source directory not resolved.');
        return;
      }
      await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(context.sourceDir), true);
    }),

    register('chezmoi-vsc.statusBarMenu', async () => {
      await showStatusBarMenu(context, statusService);
    }),
  );

  return disposables;
}

interface MenuItem extends vscode.QuickPickItem {
  run: () => Thenable<unknown>;
}

async function showStatusBarMenu(context: ChezmoiContext, statusService: StatusService): Promise<void> {
  if (context.state === 'notInstalled') {
    const choice = await vscode.window.showWarningMessage('chezmoi binary not found.', 'Install chezmoi');
    if (choice) {
      void vscode.env.openExternal(vscode.Uri.parse(INSTALL_URL));
    }
    return;
  }

  const items: MenuItem[] = [];
  if (context.available && statusService.pendingCount > 0) {
    items.push(
      {
        label: '$(check-all) Apply All',
        run: () => vscode.commands.executeCommand('chezmoi-vsc.apply'),
      },
      {
        label: '$(diff) Show Diff',
        run: () => vscode.commands.executeCommand('chezmoi-vsc.showDiff'),
      },
      {
        label: '$(list-tree) Show Status',
        run: () => vscode.commands.executeCommand('chezmoi-vsc.showStatus'),
      },
    );
  }
  items.push(
    {
      label: '$(refresh) Refresh',
      run: () => vscode.commands.executeCommand('chezmoi-vsc.refresh'),
    },
    {
      label: '$(folder-opened) Open Source Directory',
      run: () => vscode.commands.executeCommand('chezmoi-vsc.openSourceDirectory'),
    },
    {
      label: '$(gear) Settings',
      run: () => vscode.commands.executeCommand('workbench.action.openSettings', 'chezmoi'),
    },
  );

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: 'chezmoi',
  });
  if (picked) {
    await picked.run();
  }
}

async function findConfigFile(homeDir: string): Promise<string | undefined> {
  const configHome =
    process.env.XDG_CONFIG_HOME && process.env.XDG_CONFIG_HOME.length > 0
      ? process.env.XDG_CONFIG_HOME
      : path.join(homeDir, '.config');
  const dir = path.join(configHome, 'chezmoi');
  const candidates = ['chezmoi.toml', 'chezmoi.yaml', 'chezmoi.yml', 'chezmoi.json', 'chezmoi.jsonc'];
  for (const name of candidates) {
    const candidate = path.join(dir, name);
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(candidate));
      return candidate;
    } catch {
      // not this one
    }
  }
  return undefined;
}
