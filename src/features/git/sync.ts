import * as vscode from 'vscode';
import type { ChezmoiContext } from '../../chezmoi/context';
import type { WriteTerminal } from '../writeTerminal';

/**
 * Pull remote changes and apply them: `chezmoi update` runs
 * `git pull --autostash --rebase` in the source dir and then `chezmoi apply`.
 * The canonical multi-machine "sync down".
 */
export function buildUpdateArgs(): string[] {
  return ['update'];
}

/** Push local commits to the remote via `chezmoi git -- push`. */
export function buildPushArgs(): string[] {
  return ['git', '--', 'push'];
}

/**
 * Stage everything, commit with `message`, then push — as a single chained
 * shell line so a failed step short-circuits the rest. The message stays a
 * single argument; WriteTerminal handles shell quoting.
 */
export function buildCommitAndPushCommands(message: string): string[][] {
  return [
    ['git', '--', 'add', '--all'],
    ['git', '--', 'commit', '-m', message],
    ['git', '--', 'push'],
  ];
}

export interface AheadBehind {
  ahead: number;
  behind: number;
  /** False when there is no upstream tracking branch (or not a git repo). */
  hasUpstream: boolean;
}

/**
 * Parse `git rev-list --left-right --count @{upstream}...HEAD` output, which is
 * `<behind>\t<ahead>` (left = upstream-only commits = behind, right =
 * HEAD-only = ahead). Empty or non-numeric input means there's no upstream to
 * compare against.
 */
export function parseAheadBehind(stdout: string): AheadBehind {
  const parts = stdout.trim().split(/\s+/);
  if (parts.length !== 2) {
    return { ahead: 0, behind: 0, hasUpstream: false };
  }
  const behind = Number(parts[0]);
  const ahead = Number(parts[1]);
  if (!Number.isInteger(behind) || !Number.isInteger(ahead)) {
    return { ahead: 0, behind: 0, hasUpstream: false };
  }
  return { ahead, behind, hasUpstream: true };
}

export interface GitSyncDeps {
  context: ChezmoiContext;
  writeTerminal: WriteTerminal;
}

/** `chezmoi update` — pull & apply. Callers gate on requireReady() first. */
export function runUpdate({ writeTerminal }: GitSyncDeps): void {
  writeTerminal.run(buildUpdateArgs());
}

/** `chezmoi git -- push`. Callers gate on requireReady() first. */
export function runPush({ writeTerminal }: GitSyncDeps): void {
  writeTerminal.run(buildPushArgs());
}

/**
 * Prompt for a commit message, then stage-all / commit / push in one chained
 * line. Aborts silently if the message is empty or the input is cancelled.
 * Granular staging is delegated to native Source Control (openInSourceControl).
 */
export async function runCommitAndPush({ writeTerminal }: GitSyncDeps): Promise<void> {
  const message = await vscode.window.showInputBox({
    title: 'chezmoi: Commit All & Push',
    prompt: 'Commit message — stages all changes in the source repo, commits, and pushes.',
    placeHolder: 'e.g. update zsh and git config',
    ignoreFocusOut: true,
  });
  if (message === undefined || message.trim().length === 0) {
    return;
  }
  writeTerminal.runChained(buildCommitAndPushCommands(message.trim()));
}
