import * as path from 'node:path';
import * as vscode from 'vscode';
import { ChezmoiContext } from '../../chezmoi/context';
import type { StatusEntry } from '../../chezmoi/status';
import { StatusService } from '../../services/statusService';

function decorationFor(entry: StatusEntry): vscode.FileDecoration {
  const code = (entry.code1 + entry.code2).trim();
  let colorId = 'gitDecoration.modifiedResourceForeground';
  if (code.includes('A')) {
    colorId = 'gitDecoration.addedResourceForeground';
  } else if (code.includes('D')) {
    colorId = 'gitDecoration.deletedResourceForeground';
  }
  return new vscode.FileDecoration(code.slice(0, 2) || 'M', `chezmoi: ${code}`, new vscode.ThemeColor(colorId));
}

/**
 * Colors + badges files that have pending chezmoi changes, the way Git
 * decorates the Explorer. Keyed by the file's absolute `$HOME` path, so it
 * lights up the tree's file nodes (whose resourceUri is that path) and any
 * matching entry elsewhere in the workbench.
 */
export class ChezmoiDecorationProvider implements vscode.FileDecorationProvider {
  private readonly _onDidChange = new vscode.EventEmitter<vscode.Uri[]>();
  readonly onDidChangeFileDecorations = this._onDidChange.event;

  private byPath = new Map<string, StatusEntry>();
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly context: ChezmoiContext,
    private readonly statusService: StatusService,
  ) {
    this.disposables.push(this.statusService.onDidChange(() => this.rebuild()));
    this.rebuild();
  }

  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    if (uri.scheme !== 'file') {
      return undefined;
    }
    const entry = this.byPath.get(uri.fsPath);
    return entry ? decorationFor(entry) : undefined;
  }

  private rebuild(): void {
    const previous = [...this.byPath.keys()];
    const next = new Map<string, StatusEntry>();
    for (const entry of this.statusService.entries) {
      if (entry.isScript) {
        continue;
      }
      next.set(path.join(this.context.homeDir, entry.targetRelPath), entry);
    }
    this.byPath = next;

    const affected = new Set<string>([...previous, ...next.keys()]);
    this._onDidChange.fire([...affected].map((p) => vscode.Uri.file(p)));
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
    this._onDidChange.dispose();
  }
}
