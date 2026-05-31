import * as vscode from 'vscode';
import { ChezmoiContext } from '../../chezmoi/context';
import { StatusService } from '../../services/statusService';

/**
 * The always-resident chezmoi status bar entry. Pure view: it renders from
 * {@link ChezmoiContext} state plus {@link StatusService} pending counts, and a
 * local busy flag toggled by long-running write commands.
 */
export class StatusBar {
  private readonly item: vscode.StatusBarItem;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly context: ChezmoiContext,
    private readonly statusService: StatusService,
  ) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = 'chezmoi-vsc.statusBarMenu';

    this.disposables.push(
      this.item,
      this.context.onDidChange(() => this.render()),
      this.statusService.onDidChange(() => this.render()),
    );

    this.render();
  }

  refresh(): void {
    this.render();
  }

  private render(): void {
    const enabled = vscode.workspace.getConfiguration('chezmoi').get<boolean>('statusBar.enabled', true);
    if (!enabled) {
      this.item.hide();
      return;
    }

    if (this.context.state === 'notInstalled') {
      this.item.text = '$(warning) chezmoi: not found';
      this.item.tooltip = 'chezmoi binary not found — click for install help';
    } else if (this.context.state === 'notInitialized') {
      this.item.text = '$(warning) chezmoi: not initialized';
      this.item.tooltip = 'chezmoi source directory not found — run chezmoi init';
    } else {
      const count = this.statusService.pendingCount;
      if (count === 0) {
        this.item.text = '$(check) chezmoi';
        this.item.tooltip = 'No pending changes — click for actions';
      } else {
        this.item.text = `$(sync) chezmoi: ${count}`;
        this.item.tooltip = `${count} pending change${count === 1 ? '' : 's'} — click to apply`;
      }
    }

    this.item.show();
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
  }
}
