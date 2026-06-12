# MD Viewer

[![MDViewer Build](https://github.com/zigbang/mdviewer/actions/workflows/build.yml/badge.svg)](https://github.com/zigbang/mdviewer/actions/workflows/build.yml)

Markdown viewer — Tauri v2 (Rust + system WebView) + marked.js + Mermaid + KaTeX + highlight.js

~6MB distribution, lightweight to run. See [History.md](History.md) for the per-version changelog.

## Download

Get the latest version from [Releases](https://github.com/zigbang/mdviewer/releases):

| Platform | File | Notes |
|----------|------|-------|
| Windows | `*.exe` (NSIS) / `*.msi` | Installer |
| macOS | `MDViewer_V*-mac.zip` / `*.dmg` | Apple Developer ID signed + notarized (V2.4.1+) |

## Features

- 📂 Open a folder → browse `.md` files in the file tree, with recent-folder list and automatic session restore
- 🖱️ Double-click `.md` files in Finder/Explorer to open directly (file association)
- 🗂️ Tab browsing — VS Code style (single click = preview, double click = pin), drag to reorder, per-tab scroll position and navigation history
- 📋 Auto-generated table of contents — click to jump, in-document anchor links supported
- 📊 Mermaid diagram rendering (v11)
- 🧮 KaTeX math rendering (`$...$`, `$$...$$`)
- 🎨 Code syntax highlighting (highlight.js)
- 🔎 File name search — filters the sidebar tree, with regex option
- ✨ In-document text search — per-tab search state, highlights, previous/next navigation, optional Markdown-source matching
- 🖨️ Document printing — print-only stylesheet (hides sidebar/toolbar, keeps code highlighting, repeats table headers across pages, appends external link URLs)
- 🖼️ Local image rendering, broken-link placeholder page
- Zoom in/out, fullscreen, collapsible sidebar / TOC panels

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+F` | Find in current tab (`Enter`/`Shift+Enter` for next/previous) |
| `Ctrl+B` | Toggle file tree sidebar |
| `Ctrl+T` | Toggle TOC panel |
| `Ctrl+P` | Print current document |
| `Ctrl+W` | Close active tab |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Cycle tabs (next/previous) |
| `Ctrl+1..8`, `Ctrl+9` | Jump to N-th / last tab |
| `Ctrl++` / `Ctrl+-` / `Ctrl+0` | Zoom in / out / reset |
| `Alt+←` / `Alt+→` | Per-tab navigation history back/forward |
| `F5` | Reload current document |
| `F11` | Toggle fullscreen |

Use `Cmd` instead of `Ctrl` on macOS.

## Development / Build

Prerequisites: Node.js 20+, [Rust toolchain](https://rustup.rs/) (stable)

```bash
# 1. Install dependencies
npm install

# 2. Run in dev mode
npx tauri dev

# 3. Release build
npx tauri build
# → platform packages under src-tauri/target/release/bundle/
#    Windows: nsis/*.exe, msi/*.msi
#    macOS:   macos/*.app, dmg/*.dmg
```

## macOS notes

**V2.4.1 and later** are Apple Developer ID signed + notarized — they run immediately after download, no workaround needed.

**V2.4.0 and earlier** are ad-hoc signed only, so Gatekeeper blocks them. Copy the `.app` to `/Applications`, then run once:

```bash
./scripts/macos-install.sh
# or directly:
xattr -dr com.apple.quarantine "/Applications/MD Viewer.app"
```

## Documentation

- [History.md](History.md) — per-version release notes
- [MDViewer_Windows_Security_Guide.pdf](MDViewer_Windows_Security_Guide.pdf) — Windows security guide
