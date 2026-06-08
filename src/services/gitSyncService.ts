import * as vscode from 'vscode';
import { ChezmoiCli } from '../chezmoi/cli';
import { ChezmoiContext } from '../chezmoi/context';
import { CommandQueue } from '../chezmoi/queue';
import { parseAheadBehind } from '../features/git/sync';
import type { AheadBehind } from '../features/git/sync';

/**
 * Tracks how far the source repo is ahead/behind its upstream, so the status
 * bar menu can surface "⇡N / ⇣N" and offer Push/Update. Read-only: runs a
 * single `git rev-list` through the command queue (deduped), mirroring how
 * {@link StatusService} sources its data. A missing upstream / non-git source
 * dir is a normal state, not an error.
 */
export class GitSyncService {
  private _state: AheadBehind | undefined;
  private readonly _onDidChange = new vscode.EventEmitter<AheadBehind | undefined>();
  readonly onDidChange = this._onDidChange.event;

  constructor(
    private readonly cli: ChezmoiCli,
    private readonly context: ChezmoiContext,
    private readonly queue: CommandQueue,
  ) {}

  get state(): AheadBehind | undefined {
    return this._state;
  }

  async refresh(): Promise<void> {
    if (!this.context.available) {
      if (this._state !== undefined) {
        this._state = undefined;
        this._onDidChange.fire(undefined);
      }
      return;
    }

    const enabled = vscode.workspace.getConfiguration('chezmoi').get<boolean>('git.aheadBehind', true);
    if (!enabled) {
      if (this._state !== undefined) {
        this._state = undefined;
        this._onDidChange.fire(undefined);
      }
      return;
    }

    const result = await this.queue.runReadDeduped('git-aheadbehind', () =>
      this.cli.exec(['git', '--', 'rev-list', '--left-right', '--count', '@{upstream}...HEAD'], {
        cwd: this.context.sourceDir,
        timeout: 5000,
      }),
    );

    // A non-zero exit is the expected "no upstream / detached / not a git repo"
    // case — record it as hasUpstream:false without logging an error.
    this._state =
      result.code === 0 ? parseAheadBehind(result.stdout) : { ahead: 0, behind: 0, hasUpstream: false };
    this._onDidChange.fire(this._state);
  }

  dispose(): void {
    this._onDidChange.dispose();
  }
}
