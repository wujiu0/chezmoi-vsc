export interface Debounced<A extends unknown[]> {
  (...args: A): void;
  cancel(): void;
}

/** Trailing-edge debounce; the last call within `waitMs` wins. */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, waitMs: number): Debounced<A> {
  let timer: NodeJS.Timeout | undefined;

  const debounced = (...args: A): void => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = undefined;
      fn(...args);
    }, waitMs);
  };

  debounced.cancel = (): void => {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

  return debounced;
}
