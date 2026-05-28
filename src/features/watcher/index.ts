import * as vscode from 'vscode';
import { ChezmoiContext } from '../../chezmoi/context';
import { StatusService } from '../../services/statusService';
import { debounce } from '../../util/debounce';

const REFRESH_DEBOUNCE_MS = 500;

/**
 * Watches the chezmoi source directory and debounces a status refresh on any
 * change. No-op when the source dir is unresolved (degraded state).
 */
export function registerWatcher(
	context: ChezmoiContext,
	statusService: StatusService,
): vscode.Disposable[] {
	if (!context.sourceDir) {
		return [];
	}

	const pattern = new vscode.RelativePattern(context.sourceDir, '**/*');
	const watcher = vscode.workspace.createFileSystemWatcher(pattern);
	const refresh = debounce(() => {
		void statusService.refresh();
	}, REFRESH_DEBOUNCE_MS);

	watcher.onDidCreate(() => refresh());
	watcher.onDidChange(() => refresh());
	watcher.onDidDelete(() => refresh());

	return [watcher, { dispose: () => refresh.cancel() }];
}
