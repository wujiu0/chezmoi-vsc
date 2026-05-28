# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**语言约定**：始终用中文与用户沟通。

## What this is

A VS Code extension that brings the [chezmoi](https://www.chezmoi.io/) dotfiles workflow into the editor: live template preview, an apply-reminder status bar item, a pending-changes TreeView, and a command palette wrapper around the `chezmoi` CLI binary.

**Current state vs. intended state.** The `src/` code is still the `yo code` Hello World scaffold (`chezmoi-vsc.helloWorld`). The real product is fully specified in two Chinese-language docs that are the source of truth — read them before implementing anything:
- `docs/DESIGN.md` — product design: features F1–F4, module architecture (§5.1), error-handling strategy (§5.3), config schema (§5.4), chezmoi command/lock reference (Appendix A).
- `docs/PLAN.md` — implementation plan: milestones M0–M4, target file layout under `src/`, per-day tasks and acceptance criteria.

Note the docs predate the current scaffold and disagree with it in places (they say npm + `engines.vscode ^1.85`, the repo uses pnpm + `^1.120.0`; they name the command `chezmoi.hello`, the scaffold has `chezmoi-vsc.helloWorld`). When they conflict, `package.json` and the actual toolchain win for *how to build*; the docs win for *what to build*.

## Commands

This repo uses **pnpm** (see `pnpm-lock.yaml`, `.npmrc`), not npm.

```bash
pnpm run compile      # tsc -p ./  → out/
pnpm run watch        # tsc watch mode (also the default VS Code build task)
pnpm run lint         # eslint src
pnpm test             # runs vscode-test; pretest hook compiles + lints first
```

- **Run the extension**: press F5 in VS Code (the "Run Extension" launch config runs the watch build, then opens an Extension Development Host window).
- **Single test**: `pnpm run compile && npx vscode-test --grep "<pattern>"` — `pnpm test` always runs the `pretest` hook (compile + lint), so compile manually when grepping.

## Testing model

Tests use Mocha via `@vscode/test-cli`. The runner (`.vscode-test.mjs`) downloads and launches a **real headless VS Code instance** and executes the compiled specs at `out/test/**/*.test.js` — TypeScript sources in `src/test/` must be compiled first (the `pretest` hook handles this for `pnpm test`). Inside tests the full `vscode` API is available.

## Architecture (planned — see docs/DESIGN.md §5.1)

The extension is a thin UI layer over the `chezmoi` CLI. `extension.ts` is the entry point; everything else hangs off these collaborators:

- **ChezmoiCli** — the *only* place that spawns the `chezmoi` binary (planned via `execa`). All command I/O funnels through here.
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
- `execute-template` failures must render *inside* the preview (it's a high-frequency operation), not as toasts. Reserve toasts for `apply`/`add` failures, with full output going to an OutputChannel.
- TypeScript is `strict`, `module: Node16`, `target: ES2022`. ESLint flat config (`eslint.config.mjs`) warns on missing `curly`, non-`===`, missing `semi`, and non-camel/Pascal import names.
