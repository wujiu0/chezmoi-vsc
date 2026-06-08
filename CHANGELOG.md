# Change Log

All notable changes to the "chezmoi-vsc" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this
project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **Guided `chezmoi init`** — a **Chezmoi: Initialize…** command walks you
  through cloning a dotfiles repo (a GitHub user, `user/repo`, or a full git
  URL — or leave it empty to start a fresh source directory) and, when cloning,
  whether to apply immediately or review pending changes first. It runs in the
  integrated terminal so chezmoi's own prompts (template variables, overwrite
  confirmations) stay interactive. When chezmoi isn't initialized yet, the
  status-bar menu and both side-bar views now offer Initialize / Install links
  instead of a misleading "up to date" message.
- **Remote sync** — keep dotfiles in step with the source repo's git remote
  without leaving the editor:
  - **Chezmoi: Update (Pull & Apply)** runs `chezmoi update` (pull
    `--autostash --rebase`, then apply) — the canonical multi-machine sync-down.
    Also a one-click button on the Changes view title.
  - **Chezmoi: Push** and **Chezmoi: Commit All & Push…** push your local
    commits (the latter prompts for a message, then stages-all / commits /
    pushes). All run in the integrated terminal so credential / passphrase
    prompts stay interactive.
  - **Chezmoi: Open in Source Control** mounts the source repo into VS Code's
    built-in Source Control view of the current window — full staging / diff /
    commit / branch — without changing your workspace folders. Falls back to
    opening the source directory in a new window if the Git extension is
    unavailable.
  - The status-bar menu shows ahead/behind counts (⇡/⇣) for the source repo
    next to Push/Update; toggle with `chezmoi.git.aheadBehind`.

## [0.1.0] - 2026-06-01

Initial MVP release.

### Added

- **Live template preview** — open a `*.tmpl` source file and run **Chezmoi:
  Open Preview to Side** to see the rendered output, refreshed as you type.
  Rendering pipes the file through `chezmoi execute-template`; errors render
  inside the preview rather than as popups. Encrypted files are never
  auto-previewed.
- **Status-bar apply reminder** — shows the number of pending changes
  (`$(sync) chezmoi: N`) and switches to `$(check) chezmoi` when everything is
  applied. Click it for a quick menu (Apply All, Show Diff, Show Status,
  Refresh, Open Source Directory, Settings). Reminder mode is configurable
  (`off` / `statusBarOnly` / `toast`).
- **Dotfiles view** — a tree in the **chezmoi** activity-bar container lists
  managed files and pending changes, with per-item actions: apply this file,
  re-add from `$HOME`, open diff, open source/target, copy target path,
  encrypt/decrypt, and forget. Switchable between nested-tree and flat-list
  layouts.
- **Command-palette wrappers** around the `chezmoi` CLI: Apply, Add Current
  File, Add to chezmoi (Explorer/editor context), Re-add, Forget, Show Status,
  Show Diff, Encrypt…/Decrypt…, Edit Config, Open Source Directory, Refresh.
- **Explorer decorations** marking managed and encrypted files.
- Mutating commands are serialized (chezmoi holds a write lock) while read
  commands run concurrently with duplicate `status` calls deduped.
- Graceful degradation when the `chezmoi` binary is missing or the source dir
  is not initialized.

[0.1.0]: https://github.com/wujiu0/chezmoi-vsc/releases/tag/v0.1.0
