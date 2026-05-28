import * as vscode from 'vscode';

const TERMINAL_NAME = 'chezmoi';

function quoteArg(arg: string): string {
	if (/^[A-Za-z0-9_\-./:=@]+$/.test(arg)) {
		return arg;
	}
	return `'${arg.replace(/'/g, `'\\''`)}'`;
}

/**
 * Runs chezmoi's mutating commands in a reused integrated terminal.
 *
 * Unlike read commands (captured via {@link ChezmoiCli}), `apply`/`add`/
 * `re-add`/`forget` can be interactive — chezmoi prompts (and needs a real TTY)
 * when a target diverged, when decrypting, or when running scripts. A terminal
 * gives the user that TTY and full visibility instead of an opaque failure.
 * Sequential `sendText` calls are serialized by the shell itself.
 */
export class WriteTerminal {
	private terminal: vscode.Terminal | undefined;

	constructor(private readonly binaryProvider: () => string) {}

	run(args: string[]): void {
		if (!this.terminal || this.terminal.exitStatus !== undefined) {
			this.terminal = vscode.window.createTerminal({ name: TERMINAL_NAME });
		}
		this.terminal.show(true);
		const command = [this.binaryProvider(), ...args].map(quoteArg).join(' ');
		this.terminal.sendText(command);
	}

	owns(terminal: vscode.Terminal): boolean {
		return terminal === this.terminal;
	}

	dispose(): void {
		this.terminal?.dispose();
	}
}
