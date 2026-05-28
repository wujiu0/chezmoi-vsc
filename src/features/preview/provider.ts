import * as path from 'node:path';
import * as vscode from 'vscode';
import { ChezmoiCli } from '../../chezmoi/cli';
import { ChezmoiContext } from '../../chezmoi/context';
import { CommandQueue } from '../../chezmoi/queue';
import { parseSourcePath } from '../../chezmoi/paths';

export const PREVIEW_SCHEME = 'chezmoi-preview';

const EXECUTE_TEMPLATE_TIMEOUT_MS = 5000;

type PreviewMode = 'template' | 'target';

function basename(p: string): string {
	const parts = p.replace(/\\/g, '/').split('/');
	return parts[parts.length - 1] ?? p;
}

function buildUri(mode: PreviewMode, payload: string, displayName: string): vscode.Uri {
	return vscode.Uri.from({
		scheme: PREVIEW_SCHEME,
		authority: mode,
		path: '/' + displayName,
		query: encodeURIComponent(payload),
	});
}

/** Preview of a source file rendered live via `execute-template`. */
export function templatePreviewUri(sourceFsPath: string): vscode.Uri {
	return buildUri('template', sourceFsPath, basename(sourceFsPath));
}

/** Preview of a target's computed state via `chezmoi cat <target>`. */
export function targetPreviewUri(targetRelPath: string): vscode.Uri {
	return buildUri('target', targetRelPath, basename(targetRelPath));
}

/**
 * Backs the `chezmoi-preview` virtual document scheme. Two modes:
 *   - `template`: pipe a source file's (possibly unsaved) content through
 *     `chezmoi execute-template` — the live editing preview (F1).
 *   - `target`: `chezmoi cat <target>` — the computed target state, used as the
 *     left side of the diff view (F3).
 *
 * Rendering failures are returned as document content (never thrown), since
 * preview is a high-frequency operation that must not surface toasts.
 */
export class PreviewProvider implements vscode.TextDocumentContentProvider {
	private readonly _onDidChange = new vscode.EventEmitter<vscode.Uri>();
	readonly onDidChange = this._onDidChange.event;

	constructor(
		private readonly cli: ChezmoiCli,
		private readonly context: ChezmoiContext,
		private readonly queue: CommandQueue,
	) {}

	refresh(uri: vscode.Uri): void {
		this._onDidChange.fire(uri);
	}

	async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
		const payload = decodeURIComponent(uri.query);
		if (uri.authority === 'target') {
			return this.renderTarget(payload);
		}
		return this.renderTemplate(payload);
	}

	private async renderTemplate(sourceFsPath: string): Promise<string> {
		const relPath = this.context.sourceRelPath(sourceFsPath);
		if (relPath) {
			const attrs = parseSourcePath(relPath);
			if (attrs.isEncrypted) {
				return '# [encrypted file - preview skipped]';
			}
		}

		const config = vscode.workspace.getConfiguration('chezmoi');
		const maxSize = config.get<number>('preview.maxFileSize', 1048576);

		const content = await this.readSourceContent(sourceFsPath);
		if (content === undefined) {
			return `# chezmoi: cannot read ${sourceFsPath}`;
		}
		if (Buffer.byteLength(content, 'utf8') > maxSize) {
			return '# file too large to preview';
		}

		const extraArgs = config.get<string[]>('advanced.executeTemplateArgs', []);
		const result = await this.queue.runRead(() =>
			this.cli.exec(['execute-template', ...extraArgs], {
				cwd: this.context.sourceDir,
				stdin: content,
				timeout: EXECUTE_TEMPLATE_TIMEOUT_MS,
			}),
		);

		if (result.timedOut) {
			return `# chezmoi error: execute-template timed out\n\n${content}`;
		}
		if (result.code !== 0) {
			return `# chezmoi error:\n# ${result.stderr.trim().split('\n').join('\n# ')}\n\n${content}`;
		}
		return result.stdout;
	}

	private async renderTarget(targetRelPath: string): Promise<string> {
		// chezmoi resolves target args against cwd, so pass an absolute $HOME path.
		const targetAbs = path.isAbsolute(targetRelPath)
			? targetRelPath
			: path.join(this.context.homeDir, targetRelPath);
		const result = await this.queue.runRead(() =>
			this.cli.exec(['cat', targetAbs], {
				cwd: this.context.sourceDir,
				timeout: EXECUTE_TEMPLATE_TIMEOUT_MS,
			}),
		);
		if (result.code !== 0) {
			return `# chezmoi error:\n# ${result.stderr.trim().split('\n').join('\n# ')}`;
		}
		return result.stdout;
	}

	private async readSourceContent(fsPath: string): Promise<string | undefined> {
		const open = vscode.workspace.textDocuments.find(
			(doc) => doc.uri.scheme === 'file' && doc.uri.fsPath === fsPath,
		);
		if (open) {
			return open.getText();
		}
		try {
			const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(fsPath));
			return Buffer.from(bytes).toString('utf8');
		} catch {
			return undefined;
		}
	}

	dispose(): void {
		this._onDidChange.dispose();
	}
}
