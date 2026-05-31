import * as path from 'node:path';
import * as vscode from 'vscode';
import { StatusEntry } from '../../chezmoi/status';

export interface SectionNode {
  kind: 'section';
  label: string;
  count: number;
  children: TreeNode[];
}

export interface DirNode {
  kind: 'dir';
  label: string;
  children: TreeNode[];
}

export interface FileNode {
  kind: 'file';
  /** Label shown in the tree (full path in flat contexts, basename in tree). */
  label: string;
  /** Target path relative to `$HOME`. */
  targetRelPath: string;
  /** Present when the file has a pending change (drives the status badge). */
  entry?: StatusEntry;
  isScript: boolean;
  isEncrypted: boolean;
}

export type TreeNode = SectionNode | DirNode | FileNode;

function codeLabel(entry: StatusEntry): string {
  return (entry.code1 + entry.code2).trim();
}

export function toTreeItem(node: TreeNode, homeDir: string): vscode.TreeItem {
  if (node.kind === 'section') {
    const item = new vscode.TreeItem(`${node.label} (${node.count})`, vscode.TreeItemCollapsibleState.Expanded);
    item.contextValue = 'chezmoiSection';
    return item;
  }

  if (node.kind === 'dir') {
    const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.Collapsed);
    item.iconPath = new vscode.ThemeIcon('folder');
    item.contextValue = 'chezmoiDir';
    return item;
  }

  const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.None);
  const tooltipBits = [node.targetRelPath];
  if (node.entry) {
    tooltipBits.push(`[${codeLabel(node.entry)}]`);
  }
  if (node.isEncrypted) {
    tooltipBits.push('[encrypted]');
  }
  item.tooltip = tooltipBits.join(' ');

  if (node.isScript) {
    item.iconPath = new vscode.ThemeIcon('run', new vscode.ThemeColor('charts.purple'));
    item.contextValue = 'chezmoiScript';
    if (node.entry) {
      item.description = codeLabel(node.entry);
    }
    return item;
  }

  // Regular file/symlink: themed file icon via resourceUri. Changed files get
  // their color + badge from ChezmoiDecorationProvider (git-style), not here.
  // Encryption is the only thing that overrides the file-type icon, since the
  // padlock signals "you can't open this directly" — more salient than type.
  item.resourceUri = vscode.Uri.file(path.join(homeDir, node.targetRelPath));
  if (node.isEncrypted) {
    item.iconPath = new vscode.ThemeIcon('lock');
  }
  // contextValue encodes encryption + change so right-click menu can gate
  // Encrypt/Decrypt actions and Apply/Re-add visibility precisely.
  const base = node.isEncrypted ? 'chezmoiFileEncrypted' : 'chezmoiFile';
  item.contextValue = node.entry ? `${base}Changed` : base;
  item.command = {
    command: 'chezmoi-vsc.openEntry',
    title: 'Open',
    arguments: [node],
  };
  return item;
}
