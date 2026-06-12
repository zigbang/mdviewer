# MDViewer — Recent Items & Session Restore

**Date:** 2026-04-30
**Scope:** ``
**Status:** Design approved, pending spec review

## 1. Background

MDViewer (Tauri v2 app, `src/app.js` + `src-tauri/src/`) currently persists only three things in `localStorage`: Claude API token, theme, and zoom level. Every restart starts from a blank screen — last opened workspace, file, scroll position, and tree expansion are all lost.

This spec adds:
- A list of recently opened workspaces and recently opened files.
- Automatic session restore on launch when no file argument is provided.
- A toolbar dropdown to jump to any recent workspace or file.

## 2. Goals & Non-Goals

**Goals**
- Auto-restore last session (workspace + active file + scroll + tree expand state) on argument-less launch.
- Track up to 20 recent workspaces and 20 recent files (LRU).
- Surface recents through a single toolbar dropdown.

**Non-Goals**
- CLI argument / file association handling itself. The launch-file branch is wired through a hook (`getLaunchFile()`) that currently always returns `null`; the actual OS-level file-open plumbing is a follow-up PR.
- Multi-workspace simultaneous view.
- Session export / import.
- Restoring translated state.

## 3. Concepts

- **Workspace** — the root directory selected via `Open Folder` or a single-directory drag-and-drop. The sidebar tree's root.
- **Session** — `{ workspaceRoot, activeFile, scrollTop, expandedDirs }` snapshot.
- **Recent Workspaces / Recent Files** — two separate LRU lists, each capped at 20.

Drag-and-drop of multiple files (current behavior renders a `Files (N)` group) does **not** count as a workspace; only the first file opened from that group is recorded as a recent file.

## 4. Launch Flow

```
App start
  ├─ getLaunchFile() returns a path?  (currently always null)
  │     └─ Yes: build temporary tree from the file's parent dir,
  │             open that file, push to recent-files,
  │             do NOT save as workspace, do NOT touch session.
  │
  └─ No: loadSession() — workspace and active-file restore are INDEPENDENT
        ├─ Step A (workspace): if workspaceRoot present AND exists on disk
        │     → read tree → render → apply expandedDirs
        │     (if missing on disk: skip; recent-workspaces still lists it greyed)
        ├─ Step B (file): if activeFile present AND exists on disk
        │     → openFile → apply scrollTop
        │     (independent of Step A — handles the case where the user opened a file
        │      via drag-and-drop without ever opening a workspace folder)
        └─ Both empty / both missing → empty screen (first launch behavior, unchanged)
```

## 5. Data Model (localStorage)

Existing keys (`md-viewer-claude-token`, `md-viewer-theme`, `md-viewer-zoom`) remain untouched. Three new keys:

### `md-viewer-recent-workspaces`
LRU list, max 20.
```json
[
  { "path": "/Users/x/docs", "name": "docs", "lastOpenedAt": 1730000000000 }
]
```
`name` is derived from `basename(path)` at push time and stored verbatim (not recomputed at render).

### `md-viewer-recent-files`
LRU list, max 20.
```json
[
  { "path": "/Users/x/docs/README.md", "name": "README.md", "lastOpenedAt": 1730000000000 }
]
```
`name` is derived from `basename(path)` at push time.

### `md-viewer-session`
Single object.
```json
{
  "workspaceRoot": "/Users/x/docs",
  "activeFile": "/Users/x/docs/specs/foo.md",
  "scrollTop": 1234,
  "expandedDirs": ["specs", "specs/2026"]
}
```

- `expandedDirs`: directory paths **relative to `workspaceRoot`**, separator normalized to `/`.
- `workspaceRoot: null` (or session object absent) means no workspace was open.
- `activeFile: null` means no file was open even if a workspace existed.

**LRU update:** when pushing a path, remove any existing entry with the same path, then prepend. Trim to 20 from the tail. Path comparison is exact-string (no canonicalization beyond what the OS dialog returns).

**No automatic deletion** of missing paths. Existence is verified only when the dropdown opens.

## 6. UI

### Toolbar
A new button is inserted immediately after `btn-open-folder`:
```
[📁 Open Folder] [🕘 Recent ▾]   ...existing buttons
```

### Recent dropdown (`#recent-dropdown`)
Anchored under the Recent button. Two sections plus a footer action:

```
Recent Workspaces
  📁 docs                /Users/x/docs
  📁 specs               /Volumes/ext/specs    (greyed, disabled)
  ...
Recent Files
  📄 README.md           /Users/x/docs/README.md
  ...
─────────────────────────────────────
Clear Recent
```

- Sections show "(none)" when their list is empty. The dropdown is openable even on first launch (both lists empty → "Recent Workspaces / (none) / Recent Files / (none) / Clear Recent").
- Each row shows the basename in bold and the full path in dim text.
- Hovering a row highlights it; clicking opens the workspace or file and closes the dropdown.
- On open, all rows are validated via Rust `path_exists`. Missing paths get `.disabled` (greyed, `cursor: not-allowed`, click ignored). They are **not** removed from storage.
- Closing: outside click, Escape, or a successful row click.
- "Clear Recent": confirm dialog; if confirmed, both lists are emptied. The session is left untouched (the currently displayed workspace/file is not affected).

### Empty preview state
Unchanged. The dropdown is still reachable from the toolbar.

### Styling
New rules go into `style.css`, reusing existing CSS variables for theme parity. Dark and light themes must both be legible.

## 7. Persistence Triggers

| Event | Effect |
|---|---|
| `Open Folder` succeeds | in this order: push `recent-workspaces`, then set `session.workspaceRoot`, clear `expandedDirs`, set `activeFile = null`, `scrollTop = 0`. Persist as a single `saveSession` call after the field updates |
| `.md` file drop (any count, any source) | sidebar shows the dropped files (existing behavior). The first file is opened, which pushes to `recent-files` via the `openFile` path. **Workspace is NOT updated** — D&D is treated as an ad-hoc viewing scope, not a workspace switch. To open a workspace, use `Open Folder` or the Recent dropdown. |
| `openFile()` succeeds (tree click, D&D, future CLI arg) | push `recent-files`; set `session.activeFile`; `scrollTop = 0` |
| `navigateByLink` (in-doc link follows) | update `session.activeFile` and `scrollTop` only; do **not** push to `recent-files` |
| `#preview-wrap` scroll | update `session.scrollTop`, **debounced 300 ms** |
| Tree directory expand/collapse | update `session.expandedDirs` |
| `openFile()` fails (file-not-found preview) | do not modify `recent-files` |

## 8. Restore Flow

`session.js` exports `restoreSession()`, called once after `applyTheme` / `applyZoom` during DOMContentLoaded.

1. `getLaunchFile()` — currently returns `null`. Future: returns the CLI arg / file-association path.
   - If non-null: parent dir → temporary tree built via the same `build_file_tree` Rust command (rendered like a normal workspace tree but `session.workspaceRoot` is **not** updated); open the file; push to `recent-files`; skip restoration. Return.
2. Else `loadSession()` — workspace and active-file restore are **independent**:
   - **Step A (workspace):** if `workspaceRoot` is present AND `path_exists`:
     - Build tree via existing Rust command `build_file_tree(dirPath)` (the dialog-less twin of `open_folder_dialog`).
     - Render.
     - Apply `expandedDirs` (see §9).
   - **Step B (active file):** if `activeFile` is present AND `path_exists`:
     - Call `openFile(activeFile, …, { pushRecent: false })`.
     - In the render-complete callback set `previewWrap.scrollTop = session.scrollTop`.
     - This step runs even when `workspaceRoot` is null/missing — handles users who only ever drag-and-dropped files.
   - If both are absent or missing on disk: leave the empty screen.

## 9. Tree Expand State

Currently `createTreeNode` only assigns `data-path` to file nodes. To support expand-state restore, also assign `data-path` to directory nodes (relative path to workspace root, `/`-normalized). On directory toggle, read the path and update `session.expandedDirs` (a `Set` flattened to array on save).

On restore, walk `expandedDirs` and toggle the `collapsed` class off on the matching nodes (and add `open` to the row). Unmatched paths are silently ignored.

## 10. Module Layout

`src/app.js` is already ~680 lines. New code goes into separate modules to keep concerns bounded:

- **`src/recents.js`** (new) — pure storage & LRU.
  - `loadRecentWorkspaces()`, `pushRecentWorkspace(path)`
  - `loadRecentFiles()`, `pushRecentFile(path)`
  - `loadSession()`, `saveSession(partial)` (debounced internally)
  - `clearRecents()`
- **`src/session.js`** (new) — startup orchestration.
  - `restoreSession()`
  - `getLaunchFile()` — placeholder returning `null`.
- **`src/app.js`** — adds hook calls at the existing `btnOpenFolder`, `openFile`, `navigateByLink`, scroll, and tree-toggle sites.
- **`index.html`** — adds the two new `<script>` tags and the Recent button + dropdown DOM.

### Rust additions (`src-tauri/src/`)
- None. The existing `build_file_tree(dir_path)` Tauri command (already registered in `lib.rs` and used by `open_folder_dialog` internally) is reused for dialog-less tree builds during session restore.
- No CLI/file-association plumbing in this PR.

## 11. Edge Cases

| Case | Behavior |
|---|---|
| Workspace root missing on disk (e.g., external drive unmounted) | Empty screen on launch. Both `recent-workspaces` and `session.workspaceRoot` are preserved so a re-mount auto-restores on next launch. The entry shows greyed in the dropdown. |
| Active file missing but workspace exists | Tree restores; `activeFile` rendered as nothing (preview-empty visible). |
| Active file present but workspace null/missing (D&D-only session) | Sidebar stays empty (`Open a folder` hint), preview shows the file. Independent of workspace step. |
| `expandedDirs` references deleted folders | Silently skipped, no error. |
| Switching workspaces | `expandedDirs` is reset to `[]` (it belongs to a specific tree). |
| Corrupt JSON in any key | `try/catch` deletes that key, logs `console.warn`, proceeds as if empty. |
| Frequent scroll changes | 300 ms debounce; `localStorage.setItem` of a small JSON is negligible. |
| `Clear Recent` | Empties recent lists only. Session and on-screen state are preserved. |
| WebView wipes localStorage | Treated as first launch. No recovery; out of scope. |
| Translated state | Not restored; always opens the original markdown. |
| `.md` file drop (any count) | Sidebar shows just those files; `recent-workspaces` and `session.workspaceRoot` are unchanged. Recent files updated as the first file is auto-opened. To open the parent folder as a workspace, use `Open Folder` or Recent ▾. |

## 12. Manual Test Plan

1. Open folder A, open file X, scroll, close → relaunch → A/X/scroll restored.
2. Switch to folder B, close → relaunch → B restored; A is the second item under Recent Workspaces.
3. Expand 2–3 directories in the tree, close → relaunch → same expand state.
4. Open 21 distinct files → the oldest drops off `recent-files`.
5. Move workspace dir aside, relaunch → empty screen; dropdown shows it greyed. Restore the dir, relaunch → normal restore.
6. Drag-drop multiple `.md` files from different dirs → no workspace recorded; the first file appears in `recent-files`.
7. Click Recent ▾ → Clear Recent → confirm → both sections show "(none)"; current screen unchanged.
8. Toggle dark/light → dropdown remains legible.

## 13. Migration

None. Existing localStorage keys are untouched; the three new keys are absent on first run, which is handled as "no recents, no session".

## 14. Out of Scope (follow-ups)

- Wiring `getLaunchFile()` to actual OS events (Windows file association, macOS `open-file` AppleEvent, Linux `.desktop` `%f`, single-instance arg passing).
- Pinning recents.
- Per-workspace recent-files filtering.
- Cross-device session sync.
- Picking a recent file that lives outside the currently open workspace: the file opens, but the sidebar tree continues to show the prior workspace. The session records the cross-workspace `activeFile` against the old `workspaceRoot`. On next launch, the workspace tree is restored as before, and the active file restore may fail (file not in tree). To "switch" workspaces, the user picks the parent workspace from Recent ▾ first.
