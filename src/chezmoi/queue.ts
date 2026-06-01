/**
 * Read/write command queue enforcing chezmoi's locking model.
 *
 * chezmoi takes an exclusive write lock for mutating commands (apply, add,
 * re-add, forget, edit, init, update, …). Running two of those concurrently —
 * or a read while one is in flight — risks lock contention. So:
 *
 *   - writes run exclusively (no other read or write overlaps them)
 *   - reads run concurrently with each other
 *   - identical reads can be deduplicated by key (e.g. status refreshes)
 *
 * A single FIFO queue drives this: a queued writer waits for active work to
 * drain before running alone, which also prevents writer starvation since
 * reads never jump ahead of an earlier-queued write.
 */

type TaskKind = 'read' | 'write';

interface Task {
  kind: TaskKind;
  run: () => void;
}

export class CommandQueue {
  private readonly queue: Task[] = [];
  private activeWriter = false;
  private activeReaders = 0;
  private readonly dedupe = new Map<string, Promise<unknown>>();

  runWrite<T>(fn: () => Promise<T>): Promise<T> {
    return this.enqueue('write', fn);
  }

  runRead<T>(fn: () => Promise<T>): Promise<T> {
    return this.enqueue('read', fn);
  }

  /**
   * Run a read command, collapsing concurrent calls with the same key onto a
   * single in-flight promise.
   */
  runReadDeduped<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.dedupe.get(key) as Promise<T> | undefined;
    if (existing) {
      return existing;
    }
    const promise = this.runRead(fn);
    this.dedupe.set(key, promise);
    void promise.finally(() => {
      if (this.dedupe.get(key) === promise) {
        this.dedupe.delete(key);
      }
    });
    return promise;
  }

  private enqueue<T>(kind: TaskKind, fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        kind,
        run: () => {
          Promise.resolve()
            .then(fn)
            .then(resolve, reject)
            .finally(() => {
              if (kind === 'write') {
                this.activeWriter = false;
              } else {
                this.activeReaders -= 1;
              }
              this.schedule();
            });
        },
      });
      this.schedule();
    });
  }

  private schedule(): void {
    while (this.queue.length > 0) {
      const next = this.queue[0];
      if (next === undefined) {
        return;
      }

      if (next.kind === 'write') {
        if (this.activeWriter || this.activeReaders > 0) {
          return;
        }
        this.queue.shift();
        this.activeWriter = true;
        next.run();
        return;
      }

      // Reads only block on an active writer; a writer earlier in the queue
      // is at the head, so we never starve it.
      if (this.activeWriter) {
        return;
      }
      this.queue.shift();
      this.activeReaders += 1;
      next.run();
    }
  }
}
