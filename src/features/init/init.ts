import * as vscode from 'vscode';
import type { ChezmoiContext } from '../../chezmoi/context';
import type { WriteTerminal } from '../writeTerminal';

const INSTALL_URL = 'https://www.chezmoi.io/install/';

/**
 * Assemble the `chezmoi init` argument list. Kept pure (no VS Code API) so the
 * branching — optional repo, optional `--apply` — is unit-testable without
 * driving the interactive prompts.
 */
export function buildInitArgs(repo: string | undefined, apply: boolean): string[] {
  const args = ['init'];
  if (repo && repo.length > 0) {
    args.push(repo);
  }
  if (apply) {
    args.push('--apply');
  }
  return args;
}

export interface InitDeps {
  context: ChezmoiContext;
  writeTerminal: WriteTerminal;
}

interface ApplyChoice extends vscode.QuickPickItem {
  apply: boolean;
}

/**
 * Guided `chezmoi init` onboarding. Asks for a dotfiles repository (empty =
 * start a fresh source dir) and, when cloning a repo, whether to apply straight
 * away or review pending changes first. The command itself runs in the write
 * terminal because `chezmoi init` can be interactive (a repo's
 * `.chezmoi.toml.tmpl` may prompt for template variables, and `--apply` may ask
 * before overwriting files in $HOME).
 */
export async function runInit({ context, writeTerminal }: InitDeps): Promise<void> {
  if (context.state === 'notInstalled') {
    const choice = await vscode.window.showWarningMessage(
      'chezmoi binary not found. Install chezmoi before initializing.',
      'Install chezmoi',
    );
    if (choice) {
      void vscode.env.openExternal(vscode.Uri.parse(INSTALL_URL));
    }
    return;
  }

  const repo = await vscode.window.showInputBox({
    title: 'chezmoi init',
    prompt: 'Dotfiles repository to clone — a GitHub user, "user/repo", or a full git URL. Leave empty to start a fresh source directory.',
    placeHolder: 'e.g. octocat   or   https://github.com/octocat/dotfiles.git',
    ignoreFocusOut: true,
  });
  if (repo === undefined) {
    return; // cancelled
  }
  const repoArg = repo.trim();

  let apply = false;
  if (repoArg.length > 0) {
    const choices: ApplyChoice[] = [
      {
        label: '$(eye) Initialize and review',
        detail: 'Clone the source repo, then review pending changes before applying them to $HOME.',
        apply: false,
      },
      {
        label: '$(check-all) Initialize and apply now',
        detail: 'Clone and immediately apply every change to $HOME. Existing files may be overwritten.',
        apply: true,
      },
    ];
    const picked = await vscode.window.showQuickPick(choices, {
      title: 'chezmoi init',
      placeHolder: 'How should chezmoi initialize from the repository?',
    });
    if (!picked) {
      return; // cancelled
    }
    apply = picked.apply;
  }

  writeTerminal.run(buildInitArgs(repoArg.length > 0 ? repoArg : undefined, apply));
}
