# MDViewer Tab Browsing — Design Spec

- **Date:** 2026-05-04
- **Component:** `.`
- **Branch:** `mdviewer-tabs`
- **Status:** Draft (post-brainstorming, pre-plan)

## 1. Goal

Add tab browsing to MDViewer so users can keep multiple markdown documents open simultaneously, switch between them quickly, and have the working set survive across restarts. The tab model follows the VS Code "preview tab" convention: casual exploration does not litter the tab bar, while documents the user explicitly commits to are kept until closed.

## 2. Tab Model

### 2.1 Tab data

```
Tab {
  id:        string   // internal uuid, not user-visible
  path:      string   // absolute file path
  title:     string   // basename, possibly disambiguated with parent dir
  pinned:    boolean  // false = preview (italic), true = pinned
  scrollTop: number   // last scroll position
  history:   string[] // per-tab nav history (paths)
  historyIdx:number   // index into history
}

TabState {
  tabs:     Tab[]            // visual order, left -> right
  activeId: string | null    // currently focused tab
}
```

### 2.2 Invariants (enforced inside `tabs.js`)

- At most **one preview tab** (`pinned=false`) exists at any time.
- Opening a path that already lives in any tab activates the existing tab instead of creating a duplicate. Pinned wins over preview if somehow both exist.
- Promoting a preview tab keeps its slot index — no re-ordering on promote.
- Closing the last tab returns the UI to the existing `#preview-empty` state and clears the window title.
- Tabs are independent of workspace: changing or closing the workspace does **not** close tabs (consistent with the existing drag-drop behavior that lets users open files outside the workspace).

### 2.3 Missing files

When a tab's path no longer resolves (`path_exists` returns false) at activation time, the tab is rendered with a strikethrough title and a small red dot, and the preview area shows the existing broken-link UX. Only the close action remains active. Missing-state is checked lazily on activation, not pre-emptively across all tabs.

## 3. Interaction Rules

### 3.1 Opening files

| Trigger | Result |
|---|---|
| File-tree single click | Open as **preview**. If a preview tab exists, replace its `path` in place. Otherwise insert a new preview tab to the right of the active tab. |
| File-tree double click | Open as **pinned**. If the path is already in a preview tab, promote it. |
| Preview tab label double click | Promote that tab to pinned, slot unchanged. |
| Recent-files menu selection | Open as **pinned** (explicit user choice). If already open as preview, promote in place. |
| Drag-drop `.md` file(s) onto window | Open each as **pinned**; activate the first. |
| Markdown link click inside an active **preview** tab | Promote the current preview to pinned (slot unchanged), then open the target as a new preview tab to its right and activate it. If the target path is already in another tab, jump to that tab instead (uniqueness wins). |
| Markdown link click inside an active **pinned** tab | Open the target as a new preview tab to the right and activate it. The pinned source tab is unchanged. |
| Same-document anchor (`#section`) link | No tab change, existing scroll-to-anchor behavior. |
| External URL (`http://...`) | No tab change, existing external-open behavior. |

### 3.2 Closing

- `Ctrl+W`, middle-click, or the per-tab `×` closes the active/target tab.
- Closing the active tab activates the right neighbor; if none, the left neighbor; if none, empty state.
- No confirmation dialog (read-only viewer, no dirty state to lose).

### 3.3 Keyboard

| Shortcut | Action |
|---|---|
| `Ctrl+W` | Close active tab |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Next / previous tab |
| `Ctrl+1..8` | Jump to Nth tab |
| `Ctrl+9` | Jump to last tab |
| `Alt+←` / `Alt+→` | Per-tab nav back / forward (history is now per-tab, not global) |

Existing shortcuts (`Ctrl+B`, `Ctrl+T`, `Ctrl+Shift+O`, `F5`, `F11`, zoom, etc.) are unchanged. `Ctrl+T` continues to toggle TOC — no "new tab" shortcut is added because MDViewer is file-driven.

### 3.4 Drag and drop reorder

Tabs can be dragged within the tab bar to any index. preview and pinned tabs may be freely interleaved by the user.

### 3.5 Active-tab transition

On switching the active tab:
1. Save the current `#preview` `scrollTop` into the outgoing tab.
2. Restore the incoming tab's rendered HTML (from cache, see §4) into `#preview`. On cache miss, immediately show the existing `#preview-empty` spinner / placeholder while the async render (marked → mermaid → KaTeX) runs, then replace.
3. Restore `scrollTop` after the HTML is in place.
4. Update window title, file-tree highlight, and TOC from the incoming tab.

## 4. Render Caching

- Each tab keeps an optional `renderedHTML` blob in memory.
- Cache is **LRU bounded at 8 tabs, keyed by last-activation time**. When more than 8 tabs hold cached HTML, activating a 9th drops the `renderedHTML` of the least-recently-active cached tab. Only `renderedHTML` is dropped — `path`, `scrollTop`, and `history` survive; the tab re-renders on next activation.
- `F5` invalidates the active tab's cache and re-renders.
- Rationale: mermaid + KaTeX re-render is non-trivial on large docs; user perception of tab switching as "instant" matters more than the memory footprint of ≤8 cached HTML strings.

## 5. UI / Visual

### 5.1 Layout

```
#preview-wrap
├── #tab-bar       ← NEW (horizontal, scrolls horizontally on overflow)
│   └── .tab × N
├── #preview-empty (existing)
└── #preview       (existing)
```

The tab bar lives strictly inside the preview column — sidebar and TOC widths are unaffected, and existing resize handles continue to work.

### 5.2 Tab visuals

- **Active tab:** background equals `#preview` background (visually merged with content), no bottom border.
- **Inactive tab:** one shade darker than the bar background; hover one shade lighter.
- **Preview tab title:** `font-style: italic`.
- **Missing-file tab:** small red dot on the left, `text-decoration: line-through` on title.
- **Close button (`×`):** rendered only on tab hover or active state to avoid visual noise; always visible for missing tabs.
- **Width:** `min 80px / max 200px`, ellipsis on overflow.
- **Disambiguation:** if multiple tabs share the same `basename`, fallback titles become `parentDir/basename`.

### 5.3 Overflow

When the total tab width exceeds the preview column width, the tab bar scrolls horizontally. Activating a tab calls `scrollIntoView({ inline: 'nearest' })` so the active tab is always visible.

### 5.4 Theming

The existing `[data-theme]` CSS variables are extended with four tab-related tokens (`--tab-bg`, `--tab-bg-active`, `--tab-bg-hover`, `--tab-border`). Both light and dark themes get values.

## 6. Module Structure

```
src/
├── tabs.js     ← NEW: TabState + tab-bar DOM + render cache
├── app.js      ← MODIFIED: file open / link hijack / shortcuts call MDV.tabs
├── session.js  ← MODIFIED: tab restore + save subscription
├── recents.js  ← MODIFIED: extended session schema
├── index.html  ← MODIFIED: insert #tab-bar
└── style.css   ← MODIFIED: tab styles + theme tokens
```

### 6.1 `tabs.js` public API (`window.MDV.tabs`)

```js
MDV.tabs = {
  // queries
  list(): Tab[]
  active(): Tab | null

  // mutations
  open(path, { pinned = false, fromLink = false }): Promise<Tab>
  promote(tabId): void
  close(tabId): void
  activate(tabId): void
  reorder(tabId, newIndex): void

  // active-tab context
  saveScroll(scrollTop): void
  pushHistory(path): void
  navBack(): boolean
  navForward(): boolean

  // events
  on(event, handler) // 'change' | 'activate'
}
```

### 6.2 Responsibility split

- **`tabs.js`** owns: `TabState`, all invariants from §2.2, tab-bar DOM rendering, the LRU render cache, and direct mutation of `#preview.innerHTML` on activation.
- **`app.js`** owns: file-tree clicks, link hijacking, drag-drop, keyboard handlers — all expressed as calls into `MDV.tabs`. It exposes a single render helper (e.g. `MDV.app.renderMarkdown(path) -> { html, error? }`) that `tabs.js` calls on cache miss.
- **`session.js`** owns: startup restore that reads tabs from session and replays `MDV.tabs.open(..., { pinned: true })`, plus a subscription to `tabs.on('change')` that triggers a throttled (500 ms) save.

All invariants live in `tabs.js`; callers express intent and read back results.

## 7. Session Persistence

### 7.1 Schema (extended `recents.loadSession()` / `saveSession()`)

```json
{
  "workspaceRoot": "/path/to/ws",
  "expandedDirs": ["..."],

  "tabs": [
    { "path": "/abs/a.md", "scrollTop": 120 },
    { "path": "/abs/b.md", "scrollTop": 0 }
  ],
  "activeTabPath": "/abs/b.md",

  "activeFile": "/abs/b.md",
  "scrollTop": 0
}
```

- `tabs[]` contains **pinned tabs only**. Preview tabs are intentionally volatile.
- `activeTabPath` mirrors the path of the active pinned tab if it is pinned; if the active tab at save time was a preview tab, `activeTabPath` falls back to the **most recently active pinned tab** (or `null` if none).
- On restore, paths whose files no longer exist are silently skipped.
- `activeFile` and top-level `scrollTop` are kept for backwards compatibility.

### 7.2 Migration

If a session has `activeFile` but no `tabs[]` field (legacy v2.x session), restore creates a single pinned tab from `activeFile` with the legacy `scrollTop`.

### 7.3 Save triggers

`tabs.on('change')` fires on: open, close, promote, activate, reorder, scrollTop update. The handler debounces saves to one write per 500 ms.

## 8. Edge Cases

| Case | Handling |
|---|---|
| Path disappears externally | Detected at next activation; tab enters missing state; `#preview` shows broken-link UX; only close works |
| Duplicate basename across tabs | All affected titles fall back to `parent/basename` |
| Workspace change | Tabs untouched (workspace-independent) |
| Drop multiple files | All open as pinned, first activated |
| Anchor link (`#x`) | No tab change, existing scroll behavior |
| External URL | No tab change, existing external-open behavior |
| `F5` refresh | Active tab cache invalidated, re-render, scrollTop preserved |
| Close last tab | `activeId = null`, empty state shown, window title cleared, window stays open |
| Translation modal active | Continues to overwrite active tab content; switching tabs reverts to original (translation is ephemeral, not persisted on the tab) |
| LRU eviction | Drops `renderedHTML` only; `path`, `scrollTop`, `history` retained |

## 9. Manual Test Checklist

1. Single-click 5 distinct files in tree → exactly one preview tab whose path keeps changing.
2. Double-click 3 distinct files → 3 pinned tabs accumulate.
3. From a preview tab, click an internal link → previous preview promoted to pinned, new preview created and activated.
4. Click a file already open in a tab → existing tab activated, no duplicate.
5. `Ctrl+1..9` jumps; `Ctrl+W` closes; `Ctrl+Tab`/`Ctrl+Shift+Tab` cycle.
6. Drag a tab to a new index → order persists.
7. Open 5 tabs (mixed), restart app → all pinned restored, preview gone, last active tab focused.
8. Delete a file externally, then activate that tab → missing-state UI, only close works.
9. Start app with a legacy session (only `activeFile`) → migrates to one pinned tab.
10. Open 10 tabs and cycle through them → DOM cache evicts oldest entries silently; re-activation re-renders without errors.

## 10. Implementation Phases (input to writing-plans)

1. Introduce `tabs.js` skeleton with single-preview-tab semantics that match current behavior 1:1. `Tab.history` / `historyIdx` are present in the data shape from day 1; in this phase they simply mirror the existing global history for the single tab.
2. Multi-tab support, pin/promote rules, tab-bar UI, keyboard shortcuts. Per-tab nav history activates here (each tab keeps its own `history` array; `Alt+←/→` operates on the active tab's history).
3. Link-click auto-promote rule (§3.1, last two rows).
4. DOM render cache + LRU bound.
5. Session schema extension, save/restore, legacy migration.
6. Edge-case polish: missing tabs, duplicate-basename disambiguation, drag-and-drop reorder.

## 11. Out of Scope

- Editor / write functionality (MDViewer remains read-only).
- "Reopen closed tab" history.
- Tab groups / split panes.
- Persisting preview tabs across restarts.
- Cross-window tab sync.
