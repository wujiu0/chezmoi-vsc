import * as vscode from 'vscode';
import type { ExecResult } from '../chezmoi/cli';

/** Thin wrapper over an OutputChannel; the sink for every chezmoi command. */
export class Logger {
  private readonly channel: vscode.OutputChannel;

  constructor() {
    this.channel = vscode.window.createOutputChannel('chezmoi');
  }

  info(message: string): void {
    this.channel.appendLine(`[info] ${message}`);
  }

  error(message: string): void {
    this.channel.appendLine(`[error] ${message}`);
  }

  command(args: string[], result: ExecResult): void {
    const status = result.timedOut ? 'timeout' : `exit ${result.code}`;
    this.channel.appendLine(`$ chezmoi ${args.join(' ')}  (${status})`);
    if (result.stderr.trim().length > 0) {
      this.channel.appendLine(result.stderr.trimEnd());
    }
  }

  show(): void {
    this.channel.show(true);
  }

  dispose(): void {
    this.channel.dispose();
  }
}
