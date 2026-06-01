# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**语言约定**：始终用中文与用户沟通。

## What this is

A VS Code extension that brings the [chezmoi](https://www.chezmoi.io/) dotfiles workflow into the editor: live template preview, an apply-reminder status bar item, a pending-changes TreeView, and a command palette wrapper around the `chezmoi` CLI binary.

**Current state.** The MVP (features F1–F4, milestones M0–M3) is implemented under `src/`; the Hello World scaffold is gone. The two Chinese-language docs remain the source of truth for _what_ the product should do — read them before changing behavior:

- `docs/DESIGN.md` — product design: features F1–F4, module architecture (§5.1), error-handling strategy (§5.3), config schema (§5.4), chezmoi command/lock reference (Appendix A).
- `docs/PLAN.md` — implementation plan: milestones M0–M4, target file layout under `src/`, per-day tasks and acceptance criteria.

When the docs conflict with the repo, `package.json` and the actual toolchain win for _how to build_ (pnpm, `engines ^1.120.0`, `chezmoi-vsc.*` command prefix); the docs win for _what to build_.

**Reality vs. docs, learned during build:** `chezmoi status` / `chezmoi managed` emit **target** paths (e.g. `.zshrc`), not source names like the DESIGN §4.3 tree mockup implies. chezmoi resolves target args against cwd, so `cat`/`apply`/`re-add`/`forget`/`source-path` must be handed an **absolute** `$HOME/<target>` path. `execa` (DESIGN §5.2) was dropped for `node:child_process` — the spawn boundary lives entirely in `ChezmoiCli` and pulls in no extra dependency.

**The extension ships as a native ESM bundle** — `package.json` has `"type": "module"`, and tsdown (rolldown) bundles `src/extension.ts` into `out/extension.js` as ESM with `vscode` left external. VS Code's Node extension host supports ESM extensions since **v1.100** (our `engines` is `^1.120.0`, comfortably above it), so any older note here calling the host "CommonJS" is obsolete. The web-worker extension host still can't load ESM, but this extension is Node-only (it spawns `chezmoi`) and can never run there anyway.

## Commands

This repo uses **pnpm** (see `pnpm-lock.yaml`, `.npmrc`), not npm.

```bash
pnpm run build        # tsdown → out/ (ESM bundle, vscode external)
pnpm run watch        # tsdown --watch (also the default VS Code build task)
pnpm run typecheck    # tsc --noEmit — the ONLY place types are checked; the build does not
pnpm run lint         # oxlint src
pnpm run format       # oxfmt .
pnpm test             # vscode-test; pretest hook runs lint + typecheck + build first
```

- **Run the extension**: press F5 in VS Code (the "Run Extension" launch config runs the watch build, then opens an Extension Development Host window).
- **Single test**: `pnpm run build && npx vscode-test --grep "<pattern>"` — `pnpm test` always runs the `pretest` hook (lint + typecheck + build), so build manually when grepping.
- **No type-checking during build.** tsdown/rolldown strips types without checking them; `pnpm run watch` will happily emit a bundle that doesn't type-check. Rely on the editor's TS server live, and `pnpm run typecheck` (or `pretest`) as the gate.

## Testing model

Tests use Mocha via `@vscode/test-cli`. The runner (`.vscode-test.mjs`) downloads and launches a **real VS Code instance** and executes the bundled specs at `out/test/**/*.test.js` — tsdown bundles `src/test/**/*.test.ts` into `out/test/` first (the `pretest` hook handles this for `pnpm test`). Specs use Mocha's TDD globals (`suite`/`test`); `mocha` is not bundled. Inside tests the full `vscode` API is available.

## Architecture (planned — see docs/DESIGN.md §5.1)

The extension is a thin UI layer over the `chezmoi` CLI. `extension.ts` is the entry point; everything else hangs off these collaborators:

- **ChezmoiCli** — the _only_ place that spawns the `chezmoi` binary (via `node:child_process`). All command I/O funnels through here.
- **ChezmoiContext** — resolves source dir / binary path / config once at activation, broadcasts changes via `EventEmitter`.
- **StatusService** — runs `chezmoi status`, parses it into `StatusEntry[]`, exposes `onDidChange`. The single source of truth that StatusBar and TreeProvider both subscribe to.
- **Watcher** — `FileSystemWatcher` on the source dir, debounced, triggers `StatusService.refresh()`.
- **PreviewProvider** — a `TextDocumentContentProvider` under the `chezmoi-preview` URI scheme; renders a source file by piping it through `chezmoi execute-template` (via stdin, not `-f`).
- **TreeProvider** / **StatusBar** — pure views, driven by `StatusService.onDidChange`.
- **CommandQueue** — read/write mutex (see below).

### Two constraints that drive correctness

1. **chezmoi holds a write lock.** Commands that mutate (`apply`, `add`, `re-add`, `forget`, `edit`, `init`, `update`, ...) must be serialized; read commands (`status`, `diff`, `cat`, `execute-template`) may run concurrently, with duplicate `status` calls deduped. This is what CommandQueue exists for — don't fire mutating chezmoi commands in parallel.

2. **Source path ↔ target path translation.** chezmoi encodes target attributes in source filenames (`dot_` → `.`, `private_`/`encrypted_`/`readonly_` prefixes, `.tmpl` suffix, etc.). Any feature that maps between the source dir and `$HOME` needs this conversion (planned in `src/chezmoi/paths.ts`) and it must be unit-tested against the full prefix list from chezmoi's docs.

## Conventions / gotchas

- The preview pipes file content through `chezmoi execute-template` over **stdin** deliberately — this avoids chezmoi's requirement that `-f` targets live inside the source dir.
- Encrypted files can block `execute-template` waiting for a passphrase; never auto-preview them — check `chezmoi managed` attributes first.
- Use `vscode.Uri` / `path.posix` vs `path.win32` for all path work (Windows + WSL/Remote-SSH support is a goal; the extension runs host-side as a `workspace` extension).
- `execute-template` failures must render _inside_ the preview (it's a high-frequency operation), not as toasts. Reserve toasts for `apply`/`add` failures, with full output going to an OutputChannel.
- TypeScript is `strict` plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, and `isolatedModules`; `module: esnext`, `moduleResolution: bundler`, `target: ES2022`. `verbatimModuleSyntax` means type-only imports/exports **must** be written `import type` / `export type` — the bundler transpiles each file in isolation and won't elide them for you.
- Lint is **oxlint** (`oxlint src`), formatting is **oxfmt** (`oxfmt .`) — the old ESLint flat config is gone. A `.git-blame-ignore-revs` entry hides the one-time oxfmt reformat commit.
