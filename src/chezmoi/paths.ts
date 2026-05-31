/**
 * Translation between chezmoi source paths and their target (`$HOME`) paths.
 *
 * chezmoi encodes target attributes into source filenames, segment by segment:
 *   - `dot_`            → leading `.`            (e.g. `dot_zshrc` → `.zshrc`)
 *   - `literal_`        → remainder is verbatim  (stops further decoding)
 *   - attribute/type prefixes (`private_`, `encrypted_`, `executable_`,
 *     `readonly_`, `empty_`, `exact_`, `create_`, `modify_`, `remove_`,
 *     `symlink_`, `run_…`) are stripped
 *   - `.tmpl` suffix    → file is a template
 *
 * Each path component is encoded independently, e.g.
 *   `private_dot_config/dot_gitconfig.tmpl` → `.config/.gitconfig`.
 *
 * Reference: https://www.chezmoi.io/reference/source-state-attributes/
 */

export interface SourceAttributes {
  /** Relative target path under `$HOME` (forward-slash separated). */
  targetRelPath: string;
  /** Had a `.tmpl` suffix — content is rendered via execute-template. */
  isTemplate: boolean;
  /** Any segment carried the `encrypted_` attribute. */
  isEncrypted: boolean;
  /** The entry is a `run_…` script (executes, has no persistent target). */
  isScript: boolean;
  /** The entry is a `symlink_` (target is a symlink). */
  isSymlink: boolean;
}

// run_ script prefixes, longest first so `run_once_before_` wins over `run_`.
const RUN_PREFIXES = [
  'run_once_before_',
  'run_once_after_',
  'run_onchange_before_',
  'run_onchange_after_',
  'run_once_',
  'run_onchange_',
  'run_before_',
  'run_after_',
  'run_',
];

// Stackable attribute / type prefixes (order within a segment is flexible).
const ATTR_PREFIXES = [
  'encrypted_',
  'private_',
  'readonly_',
  'empty_',
  'executable_',
  'exact_',
  'create_',
  'modify_',
  'remove_',
  'symlink_',
];

interface SegmentResult {
  name: string;
  isTemplate: boolean;
  isEncrypted: boolean;
  isScript: boolean;
  isSymlink: boolean;
}

function decodeSegment(segment: string, isLast: boolean): SegmentResult {
  let name = segment;
  let isTemplate = false;
  let isEncrypted = false;
  let isScript = false;
  let isSymlink = false;

  if (isLast) {
    if (name.endsWith('.literal')) {
      name = name.slice(0, -'.literal'.length);
    }
    if (name.endsWith('.tmpl')) {
      isTemplate = true;
      name = name.slice(0, -'.tmpl'.length);
    }
  }

  let stripping = true;
  while (stripping) {
    stripping = false;

    if (name.startsWith('literal_')) {
      name = name.slice('literal_'.length);
      break;
    }
    if (name.startsWith('dot_')) {
      name = '.' + name.slice('dot_'.length);
      break;
    }

    for (const prefix of RUN_PREFIXES) {
      if (name.startsWith(prefix)) {
        isScript = true;
        name = name.slice(prefix.length);
        stripping = true;
        break;
      }
    }
    if (stripping) {
      continue;
    }

    for (const prefix of ATTR_PREFIXES) {
      if (name.startsWith(prefix)) {
        if (prefix === 'encrypted_') {
          isEncrypted = true;
        }
        if (prefix === 'symlink_') {
          isSymlink = true;
        }
        name = name.slice(prefix.length);
        stripping = true;
        break;
      }
    }
  }

  return { name, isTemplate, isEncrypted, isScript, isSymlink };
}

/** Parse a chezmoi source-relative path into its target path and attributes. */
export function parseSourcePath(sourceRelPath: string): SourceAttributes {
  const normalized = sourceRelPath.replace(/\\/g, '/').replace(/^\/+/, '');
  const segments = normalized.split('/').filter((s) => s.length > 0);

  const targetSegments: string[] = [];
  let isTemplate = false;
  let isEncrypted = false;
  let isScript = false;
  let isSymlink = false;

  segments.forEach((segment, index) => {
    const isLast = index === segments.length - 1;
    const decoded = decodeSegment(segment, isLast);
    targetSegments.push(decoded.name);
    isTemplate = isTemplate || decoded.isTemplate;
    isEncrypted = isEncrypted || decoded.isEncrypted;
    isSymlink = isSymlink || decoded.isSymlink;
    // Only the leaf determines script-ness; an ancestor dir can't be a script.
    if (isLast) {
      isScript = decoded.isScript;
    }
  });

  return {
    targetRelPath: targetSegments.join('/'),
    isTemplate,
    isEncrypted,
    isScript,
    isSymlink,
  };
}

/** Convenience: source-relative path → target-relative path. */
export function sourceToTarget(sourceRelPath: string): string {
  return parseSourcePath(sourceRelPath).targetRelPath;
}
