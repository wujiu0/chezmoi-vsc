import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { ChezmoiCli } from './cli';

export type ChezmoiState =
	| 'ok' // binary present and source dir resolved
	| 'notInstalled' // binary not found / not launchable
	| 'notInitialized'; // binary present but `source-path` failed

/**
 * Resolves and caches global chezmoi facts (binary, source dir, home dir) once
 * at activation, and re-resolves on demand. Other collaborators read state from
 * here and subscribe to {@link onDidChange} for re-resolution events.
 */
export class ChezmoiContext {
	private _state: ChezmoiState = 'notInstalled';
	private _sourceDir: string | undefined;
	private _version: string | undefined;

	private readonly _onDidChange = new vscode.EventEmitter<void>();
	readonly onDidChange = this._onDidChange.event;

	constructor(private readonly cli: ChezmoiCli) {}

	get state(): ChezmoiState {
		return this._state;
	}

	get available(): boolean {
		return this._state === 'ok';
	}

	get sourceDir(): string | undefined {
		return this._sourceDir;
	}

	get homeDir(): string {
		return os.homedir();
	}

	get version(): string | undefined {
		return this._version;
	}

	/** (Re-)resolve binary availability and source directory. */
	async initialize(): Promise<void> {
		this._version = await this.cli.version();
		if (this._version === undefined) {
			this._state = 'notInstalled';
			this._sourceDir = undefined;
			this._onDidChange.fire();
			return;
		}

		const override = vscode.workspace
			.getConfiguration('chezmoi')
			.get<string>('sourceDir', '')
			.trim();

		if (override.length > 0) {
			this._sourceDir = override;
		} else {
			const result = await this.cli.exec(['source-path'], { timeout: 5000 });
			this._sourceDir =
				result.code === 0 && result.stdout.trim().length > 0
					? result.stdout.trim()
					: undefined;
		}

		this._state = this._sourceDir ? 'ok' : 'notInitialized';
		this._onDidChange.fire();
	}

	/** True when `fsPath` lives inside the resolved source directory. */
	isInsideSource(fsPath: string): boolean {
		if (!this._sourceDir) {
			return false;
		}
		const rel = path.relative(this._sourceDir, fsPath);
		return rel.length > 0 && !rel.startsWith('..') && !path.isAbsolute(rel);
	}

	/** Source-relative path for a file inside the source dir, or undefined. */
	sourceRelPath(fsPath: string): string | undefined {
		if (!this.isInsideSource(fsPath)) {
			return undefined;
		}
		return path.relative(this._sourceDir!, fsPath).split(path.sep).join('/');
	}

	dispose(): void {
		this._onDidChange.dispose();
	}
}
