import * as vscode from 'vscode';
import { ChezmoiContext } from '../../chezmoi/context';
import { StatusEntry } from '../../chezmoi/status';
import { DirNode, FileNode, SectionNode, toTreeItem, TreeNode } from './item';
import { StatusService } from '../../services/statusService';

export const TREE_VIEW_ID = 'chezmoiStatus';

function basename(p: string): string {
	const parts = p.split('/');
	return parts[parts.length - 1] ?? p;
}

interface DirAcc {
	dirs: Map<string, DirAcc>;
	files: string[];
}

/**
 * TreeDataProvider for the chezmoi sidebar. Two sections:
 *   - Changes: flat list of pending entries (with status badges).
 *   - Managed: every managed file, as a nested tree or a flat list
 *     (`chezmoi.tree.managedView`); changed files keep their badge here too.
 */
export class TreeProvider implements vscode.TreeDataProvider<TreeNode> {
	private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	private readonly disposables: vscode.Disposable[] = [];

	constructor(
		private readonly context: ChezmoiContext,
		private readonly statusService: StatusService,
	) {
		this.disposables.push(
			this.statusService.onDidChange(() => this._onDidChangeTreeData.fire()),
			this.context.onDidChange(() => this._onDidChangeTreeData.fire()),
		);
	}

	getTreeItem(node: TreeNode): vscode.TreeItem {
		return toTreeItem(node, this.context.homeDir);
	}

	getChildren(node?: TreeNode): TreeNode[] {
		if (node === undefined) {
			return this.rootSections();
		}
		if (node.kind === 'section' || node.kind === 'dir') {
			return node.children;
		}
		return [];
	}

	private rootSections(): SectionNode[] {
		const entries = this.statusService.entries;
		const statusByPath = new Map<string, StatusEntry>();
		for (const entry of entries) {
			statusByPath.set(entry.targetRelPath, entry);
		}

		const sections: SectionNode[] = [];

		if (entries.length > 0) {
			const changeNodes: FileNode[] = entries.map((entry) => ({
				kind: 'file',
				label: entry.targetRelPath,
				targetRelPath: entry.targetRelPath,
				entry,
				isScript: entry.isScript,
			}));
			sections.push({
				kind: 'section',
				label: 'Changes',
				count: changeNodes.length,
				children: changeNodes,
			});
		}

		const managed = [...this.statusService.managed].sort((a, b) => a.localeCompare(b));
		const view = vscode.workspace
			.getConfiguration('chezmoi')
			.get<string>('tree.managedView', 'tree');
		const managedChildren =
			view === 'list'
				? managed.map((p) => this.fileNode(p, p, statusByPath))
				: this.buildTree(managed, statusByPath);

		sections.push({
			kind: 'section',
			label: 'Managed',
			count: managed.length,
			children: managedChildren,
		});

		return sections;
	}

	private fileNode(
		label: string,
		targetRelPath: string,
		statusByPath: Map<string, StatusEntry>,
	): FileNode {
		return {
			kind: 'file',
			label,
			targetRelPath,
			entry: statusByPath.get(targetRelPath),
			isScript: false,
		};
	}

	private buildTree(
		paths: string[],
		statusByPath: Map<string, StatusEntry>,
	): TreeNode[] {
		const root: DirAcc = { dirs: new Map(), files: [] };
		for (const p of paths) {
			const parts = p.split('/');
			let cursor = root;
			for (let i = 0; i < parts.length - 1; i++) {
				const segment = parts[i];
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
				.map(([name, sub]) => ({
					kind: 'dir',
					label: name,
					children: toNodes(sub),
				}));
			const fileNodes: FileNode[] = acc.files
				.sort((a, b) => a.localeCompare(b))
				.map((full) => this.fileNode(basename(full), full, statusByPath));
			return [...dirNodes, ...fileNodes];
		};

		return toNodes(root);
	}

	dispose(): void {
		this.disposables.forEach((d) => d.dispose());
		this._onDidChangeTreeData.dispose();
	}
}
