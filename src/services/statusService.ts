import * as vscode from 'vscode';
import { ChezmoiCli } from '../chezmoi/cli';
import { ChezmoiContext } from '../chezmoi/context';
import { CommandQueue } from '../chezmoi/queue';
import { parseManaged, parseStatus, StatusEntry } from '../chezmoi/status';
import { Logger } from '../util/log';

/**
 * The single source of truth for chezmoi state: the pending-change set
 * (`chezmoi status`) and the full managed-file list (`chezmoi managed`). Runs
 * both through the command queue (deduped), caches the parsed results, and
 * broadcasts. StatusBar and TreeProvider are pure subscribers.
 */
export class StatusService {
  private _entries: StatusEntry[] = [];
  private _managed: string[] = [];
  private _encrypted: Set<string> = new Set();
  private readonly _onDidChange = new vscode.EventEmitter<StatusEntry[]>();
  readonly onDidChange = this._onDidChange.event;

  constructor(
    private readonly cli: ChezmoiCli,
    private readonly context: ChezmoiContext,
    private readonly queue: CommandQueue,
    private readonly log: Logger,
  ) {}

  get entries(): readonly StatusEntry[] {
    return this._entries;
  }

  get managed(): readonly string[] {
    return this._managed;
  }

  get encrypted(): ReadonlySet<string> {
    return this._encrypted;
  }

  get pendingCount(): number {
    return this._entries.length;
  }

  async refresh(): Promise<readonly StatusEntry[]> {
    if (!this.context.available) {
      if (this._entries.length > 0 || this._managed.length > 0 || this._encrypted.size > 0) {
        this._entries = [];
        this._managed = [];
        this._encrypted = new Set();
        this._onDidChange.fire(this._entries);
      }
      return this._entries;
    }

    const [statusResult, managedResult, encryptedResult] = await Promise.all([
      this.queue.runReadDeduped('status', () =>
        this.cli.exec(['status'], { cwd: this.context.sourceDir, timeout: 15000 }),
      ),
      this.queue.runReadDeduped('managed', () =>
        this.cli.exec(['managed', '--include=files,symlinks'], {
          cwd: this.context.sourceDir,
          timeout: 15000,
        }),
      ),
      this.queue.runReadDeduped('managed-encrypted', () =>
        this.cli.exec(['managed', '--include=encrypted'], {
          cwd: this.context.sourceDir,
          timeout: 15000,
        }),
      ),
    ]);

    if (statusResult.code !== 0) {
      this.log.error(`status exited ${statusResult.code}: ${statusResult.stderr.trim()}`);
    }
    if (managedResult.code !== 0) {
      this.log.error(`managed exited ${managedResult.code}: ${managedResult.stderr.trim()}`);
    }
    if (encryptedResult.code !== 0) {
      this.log.error(`managed --include=encrypted exited ${encryptedResult.code}: ${encryptedResult.stderr.trim()}`);
    }

    this._entries = parseStatus(statusResult.stdout);
    this._managed = parseManaged(managedResult.stdout);
    this._encrypted = new Set(parseManaged(encryptedResult.stdout));
    this._onDidChange.fire(this._entries);
    return this._entries;
  }

  dispose(): void {
    this._onDidChange.dispose();
  }
}
