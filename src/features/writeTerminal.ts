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
export interface RunOptions {
  /** Environment variables prepended to the command line (per-invocation). */
  env?: Record<string, string>;
}

export class WriteTerminal {
  private terminal: vscode.Terminal | undefined;

  constructor(private readonly binaryProvider: () => string) {}

  run(args: string[], options: RunOptions = {}): void {
    this.runChained([args], options);
  }

  /**
   * Send multiple commands as a single `&&`-chained shell line. Necessary
   * when the terminal is still being initialized: separate `sendText` calls
   * race with shell startup, and the second one can be swallowed by the
   * first command's stdin. Chaining with `&&` also short-circuits — if the
   * earlier command fails, later ones don't run.
   */
  runChained(commands: string[][], options: RunOptions = {}): void {
    if (commands.length === 0) {
      return;
    }
    if (!this.terminal || this.terminal.exitStatus !== undefined) {
      this.terminal = vscode.window.createTerminal({ name: TERMINAL_NAME });
    }
    this.terminal.show(true);

    const envPrefix = options.env
      ? Object.entries(options.env)
          .map(([k, v]) => `${k}=${quoteArg(v)}`)
          .join(' ') + ' '
      : '';
    const binary = this.binaryProvider();
    const parts = commands.map((args) => [binary, ...args].map(quoteArg).join(' '));
    this.terminal.sendText(envPrefix + parts.join(' && '));
  }

  owns(terminal: vscode.Terminal): boolean {
    return terminal === this.terminal;
  }

  dispose(): void {
    this.terminal?.dispose();
  }
}
