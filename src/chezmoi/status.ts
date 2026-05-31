/**
 * Parser for `chezmoi status` output.
 *
 * The format mirrors `git status --short`: each line is two single-character
 * status codes followed by a space and the target path (relative to `$HOME`),
 * e.g. `MM .zshrc`, ` M .bashrc`, `A  .config/foo`.
 *
 *   - column 1: how the last-written state differs from the actual state
 *   - column 2: how the actual state differs from the target state
 *
 * Codes: ` ` (no change), `A` (added), `D` (deleted), `M` (modified),
 * `R` (script to run). Reference: https://www.chezmoi.io/reference/commands/status/
 */

export interface StatusEntry {
  /** Target path relative to `$HOME`, exactly as chezmoi prints it. */
  targetRelPath: string;
  /** First status column (actual vs. last-written). */
  code1: string;
  /** Second status column (actual vs. target). */
  code2: string;
  /** Either column is `R` — this is a script entry, not a regular file. */
  isScript: boolean;
}

/**
 * Parse `chezmoi managed` output — one target path per line (relative to
 * `$HOME`). Blank lines are dropped; order is preserved.
 */
export function parseManaged(output: string): string[] {
  return output
    .split('\n')
    .map((line) => line.replace(/\r$/, '').trim())
    .filter((line) => line.length > 0);
}

export function parseStatus(output: string): StatusEntry[] {
  const entries: StatusEntry[] = [];

  for (const rawLine of output.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    if (line.trim().length === 0) {
      continue;
    }

    const code1 = line.charAt(0) || ' ';
    const code2 = line.charAt(1) || ' ';
    // Drop the two code columns plus the single separating space.
    const targetRelPath = line.slice(2).replace(/^ /, '');
    if (targetRelPath.length === 0) {
      continue;
    }

    entries.push({
      targetRelPath,
      code1,
      code2,
      isScript: code1 === 'R' || code2 === 'R',
    });
  }

  return entries;
}
