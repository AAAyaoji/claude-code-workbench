# Claude Code Workbench

A visual, local-first desktop workbench for [Claude Code](https://claude.com/claude-code) on Windows. It wraps the existing Claude Code CLI in a modern graphical interface — it does **not** re-implement Claude Code or the underlying AI model.

> 一个面向 Windows 的 Claude Code 可视化桌面工作台:把已有的 Claude Code CLI 封装为图形界面,不重新实现 Claude Code 或底层模型。

## Features

- **Launch & chat**: start Claude Code sessions in a project and stream assistant replies, tool calls and results live.
- **Session management**: list past sessions, read their history, and resume them.
- **Project management**: manage local projects and view their Git status and commit history.
- **Skills / MCP viewers**: read-only overview of the Skills and MCP servers Claude Code actually loads (global, project-level and plugin-provided).
- **System tray**: close the window to minimize to the tray; single-instance lock.

## Tech Stack

- **Electron** (main process spawns the Claude Code CLI and owns the file system / Git / SQLite access)
- **React 19 + TypeScript**
- **electron-vite** (build), **electron-builder** (Windows installer)
- **node:sqlite** (built into Node 24 / Electron 45 — no native modules)
- **Radix UI** primitives + a hand-built CSS design system

## Prerequisites

This app is a front-end for the Claude Code CLI. You must install and log into it yourself:

1. **Claude Code CLI** — available on `PATH` as `claude`, and already authenticated (`claude` login). The app reads the existing `~/.claude` configuration and never manages your credentials.
2. **Git** — available on `PATH` as `git`, for Git status / history features.
3. **Node.js 22+** (for development builds).

> The app will fail clearly if `claude` is missing when you try to launch a session. It will not hang.

## Install (from a prebuilt installer)

To install on Windows, run the generated NSIS installer. The installer does **not** require administrator rights by default.

## Development

```bash
# install dependencies
npm install

# run in development (hot reload)
npm run dev

# type-check
npm run typecheck

# build the app bundle (out/)
npm run build
```

> In China you may need to set `ELECTRON_MIRROR` (see `.npmrc`) and `ELECTRON_BUILDER_BINARIES_MIRROR` for faster downloads of the Electron binary and electron-builder toolchain.

## Build the Windows installer

```bash
npm run build:win
```

Outputs are written to `dist/`:

- `Claude Code Workbench Setup <version>.exe` — NSIS installer (per-user, selectable install path)

## Data & storage

All app data is stored **outside the install directory**, in Electron's `userData`:

- Windows: `%APPDATA%\claude-code-workbench\`
  - `workbench.db` — SQLite database (projects / sessions metadata)
  - `avatars\` — user-chosen avatars

Claude Code conversation transcripts remain managed by Claude Code itself under `~/.claude/projects/`. Uninstalling or upgrading the app never deletes your data or conversations.

## Security notes

- Renderer runs sandboxed with `contextIsolation` and `nodeIntegration: false`; it only reaches the main process through a whitelisted `window.api`.
- API tokens live only in your `~/.claude` configuration; the app never reads, displays or logs them.
- No Git operations that could destroy data are performed automatically (`git reset --hard` is never used); all writes require explicit confirmation.

## License

[MIT](./LICENSE) © 2026 AAAYaoji

## Disclaimer

This is not an official Anthropic product. Claude Code and its CLI are provided by Anthropic.
