import * as vscode from 'vscode';
import { ChezmoiContext } from '../../chezmoi/context';
import { parseSourcePath } from '../../chezmoi/paths';
import { debounce } from '../../util/debounce';
import { inferLanguageId } from './languageInfer';
import { PreviewProvider, PREVIEW_SCHEME, templatePreviewUri } from './provider';

function baseName(fsPath: string): string {
	const parts = fsPath.replace(/\\/g, '/').split('/');
	return parts[parts.length - 1] ?? fsPath;
}

async function openPreview(context: ChezmoiContext, sourceFsPath: string): Promise<void> {
	const relPath = context.sourceRelPath(sourceFsPath);
	const attrs = relPath ? parseSourcePath(relPath) : undefined;
	if (attrs?.isEncrypted) {
		void vscode.window.showWarningMessage('chezmoi: encrypted file, preview skipped.');
		return;
	}

	const uri = templatePreviewUri(sourceFsPath);
	const doc = await vscode.workspace.openTextDocument(uri);

	const langId = inferLanguageId(attrs?.targetRelPath ?? baseName(sourceFsPath));
	if (langId) {
		try {
			await vscode.languages.setTextDocumentLanguage(doc, langId);
		} catch {
			// languageId not registered in this VS Code build — leave auto-detected.
		}
	}

	await vscode.window.showTextDocument(doc, {
		viewColumn: vscode.ViewColumn.Beside,
		preview: false,
		preserveFocus: true,
	});
}

export function registerPreview(
	context: ChezmoiContext,
	provider: PreviewProvider,
): vscode.Disposable[] {
	const disposables: vscode.Disposable[] = [];

	disposables.push(
		vscode.workspace.registerTextDocumentContentProvider(PREVIEW_SCHEME, provider),
	);

	disposables.push(
		vscode.commands.registerCommand(
			'chezmoi-vsc.openPreviewToSide',
			async (target?: vscode.Uri) => {
				const sourceUri =
					target instanceof vscode.Uri
						? target
						: vscode.window.activeTextEditor?.document.uri;

				if (!sourceUri || sourceUri.scheme !== 'file') {
					void vscode.window.showWarningMessage('chezmoi: no file to preview.');
					return;
				}
				if (!context.isInsideSource(sourceUri.fsPath)) {
					void vscode.window.showWarningMessage(
						'chezmoi: file is not inside the chezmoi source directory.',
					);
					return;
				}
				await openPreview(context, sourceUri.fsPath);
			},
		),
	);

	const debounceMs = vscode.workspace
		.getConfiguration('chezmoi')
		.get<number>('preview.debounce', 300);
	const refresh = debounce((fsPath: string) => {
		provider.refresh(templatePreviewUri(fsPath));
	}, debounceMs);

	disposables.push(
		vscode.workspace.onDidChangeTextDocument((event) => {
			const docUri = event.document.uri;
			if (docUri.scheme !== 'file' || !context.isInsideSource(docUri.fsPath)) {
				return;
			}
			refresh(docUri.fsPath);
		}),
	);

	disposables.push(
		vscode.workspace.onDidOpenTextDocument((doc) => {
			const autoOpen = vscode.workspace
				.getConfiguration('chezmoi')
				.get<boolean>('preview.autoOpen', false);
			if (!autoOpen || doc.uri.scheme !== 'file' || !doc.fileName.endsWith('.tmpl')) {
				return;
			}
			if (!context.isInsideSource(doc.uri.fsPath)) {
				return;
			}
			void openPreview(context, doc.uri.fsPath);
		}),
	);

	disposables.push({ dispose: () => refresh.cancel() });

	return disposables;
}
