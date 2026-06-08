import * as vscode from 'vscode';
import type { ChezmoiContext } from '../../chezmoi/context';

// Minimal slice of the built-in Git extension API (vscode.git). The real API is
// large and unpublished as @types; we declare only the members we use so the
// bundle stays lean and type-checking stays honest.
interface GitExtension {
  getAPI(version: 1): GitAPI;
}

interface GitAPI {
  openRepository(root: vscode.Uri): Promise<Repository | null>;
}

interface Repository {
  readonly rootUri: vscode.Uri;
}

/** Resolve the built-in Git extension's API, activating it first. */
async function getGitApi(): Promise<GitAPI | undefined> {
  const ext = vscode.extensions.getExtension<GitExtension>('vscode.git');
  if (!ext) {
    return undefined;
  }
  try {
    const exports = ext.isActive ? ext.exports : await ext.activate();
    return exports.getAPI(1);
  } catch {
    return undefined;
  }
}

/**
 * Register the chezmoi source repo into the built-in Source Control view of the
 * current window (no workspace-folder change), then reveal the SCM view — so
 * the user gets native staging/diff/commit/push without leaving their
 * workspace. Falls back to opening the source dir in a new window when the Git
 * extension is unavailable or the source dir isn't a git repo.
 */
export async function openInSourceControl(context: ChezmoiContext): Promise<void> {
  const sourceDir = context.sourceDir;
  if (!sourceDir) {
    void vscode.window.showWarningMessage('chezmoi: source directory not resolved.');
    return;
  }

  const fallback = (reason: string): Thenable<unknown> => {
    void vscode.window.showInformationMessage(`chezmoi: ${reason} Opened the source directory in a new window instead.`);
    return vscode.commands.executeCommand('chezmoi-vsc.openSourceDirectory');
  };

  const api = await getGitApi();
  if (!api) {
    await fallback('Git extension unavailable.');
    return;
  }

  let repo: Repository | null;
  try {
    repo = await api.openRepository(vscode.Uri.file(sourceDir));
  } catch {
    repo = null;
  }
  if (!repo) {
    await fallback('The source directory is not a git repository.');
    return;
  }

  await vscode.commands.executeCommand('workbench.view.scm');
}
