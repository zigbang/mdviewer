# MDViewer Release History

## V2.5.0

### Changes
- Document printing — toolbar Print button and `Ctrl+P` invoke `window.print()`. The print stylesheet (`@media print`) hides the toolbar/sidebar/TOC/tab bar/find bar/modals, flattens the layout, and forces a light tone even in dark theme. Code blocks wrap, headings are not left orphaned at a page bottom, and `pre`/`table`/`blockquote`/mermaid/`img` avoid mid-element page breaks.
- Print: long tables repeat `thead`/`tfoot` on every page (`display: table-header-group`/`footer-group`); whole-table break avoidance is dropped in favor of per-row (`tr`) break avoidance for readability.
- Print: external links (`http`, `mailto:`) print their actual URL in small grey text after the link so paper output stays traceable; long URLs wrap via `word-break: break-all`.
- Print: code syntax highlighting preserved on paper — the hljs github (light) theme is loaded as `media="print"` and the dark theme limited to `media="screen"`, so token colors survive instead of being forced black.

### Shortcuts
- `Ctrl+P` — print the current document

### Fixes
- In-document TOC anchor links now navigate: heading `textContent` is converted to a GitHub-style slug for its `id`. Previously marked v11 emitted no heading ids, so `buildToc` assigned only `heading-N` fallback ids and body anchors like `[Section](#1-domain-model)` failed to match.

---

## V2.4.1

### Changes
- macOS 릴리즈에 ZIGBANG 팀의 Apple Developer ID Application 인증서를 사용한 정식 코드 서명 + Apple notarization 적용. 다운로드한 `.app` / `.dmg`가 Gatekeeper 경고 없이 즉시 실행됨 — `scripts/macos-install.sh` 또는 `xattr -dr` 우회 단계 불필요.

---

## V2.4.0

### Changes
- File-association handling — `.md` / `.markdown` register as `Viewer` document types so Finder/Explorer can route double-clicks to MDViewer. CLI argv (Windows) and macOS `RunEvent::Opened` (NSApplication openFiles) feed a Rust-side launch-file queue that the frontend drains at startup via `take_launch_file` and live via the `launch-file` event. Launching with a file opens its parent dir as the workspace tree and pins the file as the active tab.

### macOS notes
- Releases are ad-hoc signed only (no Apple Developer ID), so downloaded `.app` bundles carry `com.apple.quarantine` and Sequoia's Gatekeeper blocks document opens through them with the `'<file>.md'을(를) 열지 않음` dialog. Run `scripts/macos-install.sh` (or `xattr -dr com.apple.quarantine "/Applications/MD Viewer.app"`) once after installing to clear it. See README → macOS section.

---

## V2.3.0

### Changes
- Sidebar file search filters the loaded workspace tree by markdown filename, with optional regex matching
- Per-tab text find bar with highlighted matches, previous/next navigation, and match counters
- Text find supports rendered visible-text mode by default, Markdown source counting as an option, and case-sensitive matching as an option

---

## V2.2.1

### Changes
- App icon refresh: Zigbang house+ring base, with the new "MD" + magnifying-glass mark composited into the white center

---

## V2.2.0

### Changes
- Tab browsing — VS Code-style: single click in tree opens a preview tab (italic + dim), double click in tree or on the tab title pins it. Clicking a markdown link inside a preview tab auto-promotes that tab to pinned and opens the target as a new preview to its right. Same path is never duplicated across tabs.
- Same-basename tabs disambiguate to `parent/basename` titles
- Per-tab scroll position preserved across tab switches
- Per-tab navigation history — `Alt+←/→` and mouse back/forward operate only on the active tab
- LRU render cache (8 tabs) — instant tab switching with no disk re-read or re-rendering of marked/mermaid/KaTeX
- Pinned tabs persist across restarts; preview tabs are intentionally volatile. Legacy single-`activeFile` sessions migrate to one pinned tab on first launch
- Drag-to-reorder tabs
- Missing-file state — a tab whose file was deleted shows a red dot + strikethrough, the broken-link preview, and only the close action

### Shortcuts
- `Ctrl+W` — close active tab
- `Ctrl+Tab` / `Ctrl+Shift+Tab` — cycle next/previous tab (wraps)
- `Ctrl+1..8` — jump to N-th tab; `Ctrl+9` — jump to last tab

### Fixes
- Manual double-click detection on the tab bar (native `dblclick` is unreliable on `draggable=true` elements in WebKit/Chromium)

---

## V2.1.0

### Changes
- Local images (png/gif/jpg) now render: enable Tauri asset protocol, add `http://asset.localhost` to CSP `img-src` (Windows asset URLs use http scheme), convert relative `<img>` sources via `convertFileSrc` after markdown render
- Strip `\\?\` UNC prefix from Windows `canonicalize()` so asset scope and OS-open accept the path
- Broken links show a "File not found" preview regardless of extension; the missing target is pushed to nav history so Alt+Left / back works; filename bar and TOC reflect the missing state
- Window title shows `<filename> - MD Viewer - <full path>` when a file is open (with `(not found)` / `(Translated)` markers for those states); plain "MD Viewer" when nothing is selected
- About modal tagline tightened to just "for Device Engineering"

### Fixes
- CSP was blocking every Tauri IPC call (`http://ipc.localhost`), so Open Folder and all other commands silently failed — added `ipc:` and `http://ipc.localhost` to `connect-src`
- Tauri's auto-injected script nonces disabled `'unsafe-inline'`, which blocked the inline `onclick=` on the empty-hint Open Folder button; replaced with an addEventListener wiring
- `open_folder_dialog` switched to async `pick_folder` + tokio oneshot so the async runtime isn't blocked

### Build / Dev
- `devtools` feature enabled for release builds (F12 / right-click → Inspect); no auto-open on startup

---

## V2.0.0

### Changes
- Migrated from Electron to Tauri v2 (Rust + system WebView)
- Distribution size reduced from ~67MB to ~6MB
- Lower memory footprint (~50-150MB vs ~200-400MB)
- Native system title bar on all platforms (Windows, macOS, Linux)
- Rust backend replaces Node.js (file I/O, path resolution, folder dialog, translate API)
- All V1.4.0 features preserved: unified link handler, navigation history, mermaid, KaTeX, themes, drag & drop, translation

---

## V1.4.0

### Changes
- Unified link handler: external URLs open in browser, in-document anchors scroll smoothly, relative `.md` links open within the app, other files open in system default app
- Navigation safety guard: `will-navigate` and `setWindowOpenHandler` prevent blank screen on unhandled links
- Navigation history for link clicks: back/forward via mouse side buttons or Alt+Left/Right
- In-document anchor navigation also tracked in history with scroll position preservation
- macOS build: ad-hoc codesign and `ditto` repack in CI for Apple Silicon compatibility
- Build artifact renamed to include architecture (`MDViewer_V{version}-{arch}`)

---

## V1.3.0

### Changes
- Page Up / Page Down keyboard navigation for preview scrolling (85% viewport)
- Home / End keyboard navigation to scroll to top/bottom of preview
- Shortcut keys listed in About dialog
- File association support: open .md files directly from Windows Explorer
- Multiple files passed via command line are listed in sidebar, first file auto-displayed

---

## V1.2.0

### Changes
- Drag & drop support for multiple .md files
- Files from same directory show filename only; different directories grouped with directory headers
- First dropped file auto-displayed
- Light/Dark theme toggle button added to toolbar (persisted via localStorage)
- Mermaid diagrams re-initialized on theme change with appropriate theme
- Light theme: mermaid text color forced darker for readability
- Toolbar layout reordered: Fullscreen → Theme → Translate → Filename → Zoom
- CSS hardcoded colors replaced with CSS variables for theme support

---

## V1.1.0

### Changes
- UI language changed to English (About modal Korean message preserved)
- Translate button added to toolbar (requires Claude API token, not tested)
- "Not tested" notice displayed on translate dialog
- Folder open button moved to sidebar header
- Zigbang smart home logo added to toolbar (links to smarthome.zigbang.com)
- App icon changed to zigbang house icon
- System menu removed for clean UI
- Fullscreen button added to toolbar (F11)
- Zoom controls ([-] % [+]) added next to filename (content-only zoom)
- Zoom starts at 100% on launch, persists across file changes
- About dialog with version info and keyboard shortcuts
- Sidebar/TOC resize handles hidden when panel is collapsed
- Fixed `min-width` override preventing panel collapse
- Fixed marked v11 renderer API (`code` function signature)
- Keyboard shortcut: Ctrl+= changed to reset zoom (was zoom in)
- Build artifact renamed to `MDViewer_V{version}.exe`

---

## V1.0.0

### Features
- Electron-based Markdown viewer desktop application
- Folder browser with recursive .md file scanning
- Markdown rendering with marked.js (GFM support)
- Mermaid v11 diagram rendering
- KaTeX math equation rendering
- highlight.js code syntax highlighting
- Dark theme (VS Code style) with CSS variables
- Table of Contents (TOC) panel with scroll spy
- Resizable sidebar and TOC panels
- Keyboard shortcuts (Ctrl+B sidebar, Ctrl+T TOC)
- External link handling (opens in default browser)
- Windows x64 portable .exe build via electron-builder
