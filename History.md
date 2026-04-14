# MDViewer Release History

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
