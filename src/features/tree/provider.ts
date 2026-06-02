import * as vscode from 'vscode';
import { ChezmoiContext } from '../../chezmoi/context';
import type { StatusEntry } from '../../chezmoi/status';
import { StatusService } from '../../services/statusService';
import type { DirNode, FileNode, TreeNode } from './item';
import { toTreeItem } from './item';

export const CHANGES_VIEW_ID = 'chezmoiChanges';
export const MANAGED_VIEW_ID = 'chezmoiManaged';

function basename(p: string): string {
  const parts = p.split('/');
  return parts[parts.length - 1] ?? p;
}

function buildStatusMap(entries: readonly StatusEntry[]): Map<string, StatusEntry> {
  const map = new Map<string, StatusEntry>();
  for (const entry of entries) {
    map.set(entry.targetRelPath, entry);
  }
  return map;
}

function makeFileNode(
  label: string,
  targetRelPath: string,
  statusByPath: Map<string, StatusEntry>,
  encrypted: ReadonlySet<string>,
  isScript = false,
): FileNode {
  return {
    kind: 'file',
    label,
    targetRelPath,
    entry: statusByPath.get(targetRelPath),
    isScript,
    isEncrypted: encrypted.has(targetRelPath),
  };
}

interface DirAcc {
  dirs: Map<string, DirAcc>;
  files: string[];
}

function buildTree(
  paths: string[],
  statusByPath: Map<string, StatusEntry>,
  encrypted: ReadonlySet<string>,
): TreeNode[] {
  const root: DirAcc = { dirs: new Map(), files: [] };
  for (const p of paths) {
    const parts = p.split('/');
    let cursor = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const segment = parts[i];
      if (segment === undefined) {
        continue;
      }
      let next = cursor.dirs.get(segment);
      if (!next) {
        next = { dirs: new Map(), files: [] };
        cursor.dirs.set(segment, next);
      }
      cursor = next;
    }
    cursor.files.push(p);
  }

  const toNodes = (acc: DirAcc): TreeNode[] => {
    const dirNodes: DirNode[] = [...acc.dirs.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, sub]) => ({ kind: 'dir', label: name, children: toNodes(sub) }));
    const fileNodes: FileNode[] = acc.files
      .sort((a, b) => a.localeCompare(b))
      .map((full) => makeFileNode(basename(full), full, statusByPath, encrypted));
    return [...dirNodes, ...fileNodes];
  };

  return toNodes(root);
}

abstract class BaseTreeProvider implements vscode.TreeDataProvider<TreeNode> {
  protected readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    protected readonly context: ChezmoiContext,
    protected readonly statusService: StatusService,
  ) {
    this.disposables.push(
      this.statusService.onDidChange(() => this._onDidChangeTreeData.fire()),
      this.context.onDidChange(() => this._onDidChangeTreeData.fire()),
    );
  }

  getTreeItem(node: TreeNode): vscode.TreeItem {
    return toTreeItem(node, this.context.homeDir);
  }

  abstract getChildren(node?: TreeNode): TreeNode[];

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
    this._onDidChangeTreeData.dispose();
  }
}

/** Flat list of files with pending chezmoi changes (drives the Changes view). */
export class ChangesTreeProvider extends BaseTreeProvider {
  getChildren(node?: TreeNode): TreeNode[] {
    if (node !== undefined) {
      return [];
    }
    const entries = this.statusService.entries;
    const statusByPath = buildStatusMap(entries);
    const encrypted = this.statusService.encrypted;
    return entries.map((entry) =>
      makeFileNode(
        entry.targetRelPath,
        entry.targetRelPath,
        statusByPath,
        encrypted,
        entry.isScript,
      ),
    );
  }
}

/**
 * Every managed file (drives the Managed view). Nested tree by default; flat
 * list when `chezmoi.tree.managedView` is `"list"`. Changed files surface
 * their git-style color + badge via ChezmoiDecorationProvider.
 */
export class ManagedTreeProvider extends BaseTreeProvider {
  getChildren(node?: TreeNode): TreeNode[] {
    if (node === undefined) {
      const statusByPath = buildStatusMap(this.statusService.entries);
      const encrypted = this.statusService.encrypted;
      const managed = [...this.statusService.managed].sort((a, b) => a.localeCompare(b));
      const view = vscode.workspace
        .getConfiguration('chezmoi')
        .get<string>('tree.managedView', 'tree');
      return view === 'list'
        ? managed.map((p) => makeFileNode(p, p, statusByPath, encrypted))
        : buildTree(managed, statusByPath, encrypted);
    }
    if (node.kind === 'dir') {
      return node.children;
    }
    return [];
  }
}
