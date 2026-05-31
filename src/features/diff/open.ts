import * as path from 'node:path';
import * as vscode from 'vscode';
import { ChezmoiContext } from '../../chezmoi/context';
import { PreviewProvider, targetPreviewUri } from '../preview/provider';

/**
 * Open a side-by-side diff for a target path:
 *   left  = computed target state (`chezmoi cat <target>`)
 *   right = actual file in `$HOME`
 */
export async function openDiff(
  context: ChezmoiContext,
  provider: PreviewProvider,
  targetRelPath: string,
): Promise<void> {
  const left = targetPreviewUri(targetRelPath);
  provider.refresh(left); // ensure freshly rendered
  const right = vscode.Uri.file(path.join(context.homeDir, targetRelPath));
  const name = path.basename(targetRelPath);

  await vscode.commands.executeCommand('vscode.diff', left, right, `${name} (chezmoi ↔ home)`);
}
