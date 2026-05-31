import { spawn } from 'node:child_process';

export interface ExecResult {
  stdout: string;
  stderr: string;
  code: number;
  timedOut: boolean;
}

export interface ExecOptions {
  cwd?: string;
  /** Kill the process after this many milliseconds. 0 / undefined = no limit. */
  timeout?: number;
  /** Piped to the child's stdin (used by execute-template). */
  stdin?: string;
}

/** Observability hook invoked once per completed command. */
export type ExecLogger = (entry: { args: string[]; result: ExecResult }) => void;

/** Thrown when the chezmoi binary itself cannot be launched (e.g. not on PATH). */
export class ChezmoiNotFoundError extends Error {
  constructor(
    public readonly binary: string,
    public readonly cause: Error,
  ) {
    super(`Failed to launch chezmoi binary "${binary}": ${cause.message}`);
    this.name = 'ChezmoiNotFoundError';
  }
}

/**
 * The single place that spawns the chezmoi binary. Every command in the
 * extension funnels through here so process I/O, timeouts and stdin handling
 * live in one spot. Non-zero exit codes are returned, not thrown — callers
 * decide what a failure means. A genuine launch failure (missing binary)
 * rejects with {@link ChezmoiNotFoundError}.
 */
export class ChezmoiCli {
  constructor(
    private readonly binaryProvider: () => string,
    private readonly logger?: ExecLogger,
  ) {}

  get binary(): string {
    return this.binaryProvider();
  }

  exec(args: string[], options: ExecOptions = {}): Promise<ExecResult> {
    return new Promise<ExecResult>((resolve, reject) => {
      const child = spawn(this.binary, args, { cwd: options.cwd });
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      let settled = false;
      let timer: NodeJS.Timeout | undefined;

      if (options.timeout && options.timeout > 0) {
        timer = setTimeout(() => {
          timedOut = true;
          child.kill('SIGKILL');
        }, options.timeout);
      }

      const cleanup = (): void => {
        if (timer) {
          clearTimeout(timer);
        }
      };

      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      child.on('error', (err: Error) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        reject(new ChezmoiNotFoundError(this.binary, err));
      });

      child.on('close', (code: number | null) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        const result: ExecResult = { stdout, stderr, code: code ?? -1, timedOut };
        this.logger?.({ args, result });
        resolve(result);
      });

      child.stdin.on('error', () => {
        // chezmoi may close stdin before we finish writing (e.g. on early
        // exit); swallow EPIPE so it surfaces as a normal non-zero result.
      });
      child.stdin.end(options.stdin ?? '');
    });
  }

  async checkInstalled(): Promise<boolean> {
    try {
      const result = await this.exec(['--version'], { timeout: 5000 });
      return result.code === 0;
    } catch {
      return false;
    }
  }

  async version(): Promise<string | undefined> {
    try {
      const result = await this.exec(['--version'], { timeout: 5000 });
      return result.code === 0 ? result.stdout.trim() : undefined;
    } catch {
      return undefined;
    }
  }
}
