# chezmoi for VS Code

Bring the [chezmoi](https://www.chezmoi.io/) dotfiles workflow into the editor: live template preview, an apply reminder, and a pending-changes view — all wired to your local `chezmoi` CLI.

> **Status:** early MVP (v0.1.0), packaged for small-scale testing. Expect rough edges and please report issues.

## Features

- **Live template preview** — open a `*.tmpl` source file and run **Chezmoi: Open Preview to Side** to see the rendered output, refreshed as you type. Rendering pipes the file through `chezmoi execute-template`; errors render inside the preview, not as popups.
- **Apply reminder in the status bar** — a status bar item shows the number of pending changes (`$(sync) chezmoi: N`) and turns to `$(check) chezmoi` when everything is applied. Click it for a quick menu (Apply All, Show Diff, Show Status, Refresh, …).
- **Dotfiles view** — a tree in the **chezmoi** activity-bar container lists managed files and pending changes. Per-item actions: apply this file, re-add from `$HOME`, open diff, open source/target, copy target path, encrypt/decrypt, and forget.
- **Command palette wrapper** — common `chezmoi` operations without leaving the editor: Apply, Add Current File, Re-add, Forget, Show Status, Show Diff, Encrypt…/Decrypt…, Edit Config, Open Source Directory, Refresh.

The extension serializes mutating commands (chezmoi holds a write lock) and lets read commands run concurrently, so actions triggered in quick succession stay consistent.

## Requirements

- **chezmoi** installed and on your `PATH` (or point `chezmoi.executable` at the binary). See the [chezmoi install guide](https://www.chezmoi.io/install/).
- **VS Code 1.120 or newer.** The extension runs in the Node extension host (it spawns the `chezmoi` binary), so it does not work in web/`vscode.dev`.

## Extension Settings

| Setting | Default | Description |
| --- | --- | --- |
| `chezmoi.executable` | `"chezmoi"` | Path to the chezmoi binary. |
| `chezmoi.sourceDir` | `""` | Override the source directory (empty = auto-detect via `chezmoi source-path`). |
| `chezmoi.preview.autoOpen` | `false` | Automatically open the preview when opening a `.tmpl` file. |
| `chezmoi.preview.debounce` | `300` | Milliseconds to wait before refreshing the preview on edit. |
| `chezmoi.preview.maxFileSize` | `1048576` | Skip preview for files larger than this (bytes). |
| `chezmoi.statusBar.enabled` | `true` | Show the chezmoi status bar item. |
| `chezmoi.tree.managedView` | `"tree"` | Show managed files as a nested `tree` or a flat `list`. |
| `chezmoi.tree.clickAction` | `"diff"` | Action when clicking a file node: `diff`, `source`, or `target`. |
| `chezmoi.notifications.applyReminder` | `"statusBarOnly"` | How to notify when source files change: `off`, `statusBarOnly`, or `toast`. |
| `chezmoi.advanced.executeTemplateArgs` | `[]` | Extra arguments to pass to `chezmoi execute-template`. |

## Known limitations

- Encrypted files are never auto-previewed (rendering them can block waiting for a passphrase); use the explicit Decrypt action instead.
- Web / `vscode.dev` is not supported — the extension needs a local `chezmoi` binary.

## Release notes

### 0.1.0

Initial MVP: template preview, status-bar apply reminder, pending-changes tree, and command-palette wrappers around the `chezmoi` CLI.
