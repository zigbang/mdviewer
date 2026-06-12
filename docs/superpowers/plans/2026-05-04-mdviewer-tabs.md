# MDViewer Tab Browsing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add VS Code-style tab browsing (single-click = preview, double-click = pinned, link click in preview auto-promotes) to MDViewer with per-tab scroll/history and session persistence of pinned tabs.

**Architecture:** Introduce `tabs.js` as a single-responsibility module owning `TabState`, the tab-bar DOM, and an LRU render cache for `#preview` HTML. `app.js` keeps file-tree, link, and shortcut handlers but delegates intent to `MDV.tabs`. `session.js`/`recents.js` extend the existing session schema to persist pinned tabs across restarts.

**Tech Stack:** Tauri v2, vanilla JS (no test runner), `marked` + `mermaid` + `KaTeX` + `highlight.js` (CDN), CSS variables for theming.

**Spec:** [`docs/superpowers/specs/2026-05-04-mdviewer-tabs-design.md`](../specs/2026-05-04-mdviewer-tabs-design.md)

**Notes for the implementer:**
- This codebase has no JS test runner. "Verify" means manually exercising the app (`npm run tauri dev` from ``) and confirming the listed expected behavior.
- Always commit after each task. Match the existing commit-message style: short subject prefixed with `[mdviewer]` or `MDViewer:`, body explains the why.
- Work happens in worktree `.worktrees/mdviewer-tabs` on branch `mdviewer-tabs`.
- Do not silently re-architect existing code outside of what each task requires.

---

## File Structure

| File | Status | Responsibility |
|------|--------|----------------|
| `src/tabs.js` | **NEW** | `TabState`, all invariants, tab-bar DOM, LRU render cache, public `MDV.tabs` API |
| `src/app.js` | MODIFY | File-tree clicks, link hijack, drag-drop, recents-pickers, shortcuts → call `MDV.tabs`; expose `renderMarkdown(path)` helper |
| `src/session.js` | MODIFY | Restore pinned tabs on startup; subscribe to `tabs.on('change')` for save |
| `src/recents.js` | MODIFY | Extended session schema (`tabs[]`, `activeTabPath`); legacy migration |
| `src/index.html` | MODIFY | Insert `#tab-bar` element |
| `src/style.css` | MODIFY | Tab styles + theme variables |

---

## Task 1: Scaffold `tabs.js` skeleton (single preview tab, behavior-equivalent to today)

**Files:**
- Create: `src/tabs.js`
- Modify: `src/index.html` (script tag + `#tab-bar` placeholder)
- Modify: `src/style.css` (basic `#tab-bar` so layout doesn't break)

- [ ] **Step 1: Add `<div id="tab-bar"></div>` to `index.html`**

Insert immediately inside `<div id="preview-wrap">`, BEFORE `#preview-empty`:

```html
<div id="preview-wrap">
  <div id="tab-bar"></div>   <!-- NEW -->
  <div id="preview-empty">...</div>
  <div id="preview"></div>
</div>
```

Add `<script src="tabs.js"></script>` AFTER `recents.js` and BEFORE `session.js` and `app.js`.

- [ ] **Step 2: Create `tabs.js` with skeleton API**

```js
/* ════════════════════════════════════════════════════════
   MD Viewer — tabs.js
   TabState + tab-bar DOM + LRU render cache.
   All invariants enforced here; app.js expresses intent only.
   ════════════════════════════════════════════════════════ */
(function () {
  const NS = (window.MDV = window.MDV || {})

  const RENDER_CACHE_MAX = 8

  /** @type {{ tabs: Tab[], activeId: string|null }} */
  const state = { tabs: [], activeId: null }
  const listeners = { change: [], activate: [] }

  function uid() { return Math.random().toString(36).slice(2, 10) }
  function emit(ev) { listeners[ev].forEach(fn => { try { fn() } catch (e) { console.warn(e) } }) }

  // ── Phase-1 stubs (filled in later tasks) ──
  function list()   { return state.tabs.slice() }
  function active() { return state.tabs.find(t => t.id === state.activeId) || null }

  async function open(path, opts) { throw new Error('tabs.open: not implemented') }
  function promote(id) {}
  function close(id) {}
  function activate(id) {}
  function reorder(id, newIndex) {}

  function saveScroll(scrollTop) {}
  function pushHistory(path) {}
  function navBack()    { return false }
  function navForward() { return false }

  function on(ev, fn) { listeners[ev].push(fn) }

  NS.tabs = { list, active, open, promote, close, activate, reorder,
              saveScroll, pushHistory, navBack, navForward, on }
})()
```

- [ ] **Step 3: Add minimal CSS so `#tab-bar` is invisible but reserves no space when empty**

Append to `style.css`:

```css
#tab-bar { display: flex; flex-direction: row; overflow-x: auto; overflow-y: hidden; }
#tab-bar:empty { display: none; }
```

- [ ] **Step 4: Manual verify**

Run `npm run tauri dev` in ``. Open a folder, click a file. Verify:
- Existing behavior unchanged (file renders, TOC, scroll, etc.).
- DevTools console: `MDV.tabs.list()` returns `[]`. No errors.

- [ ] **Step 5: Commit**

```bash
git add src/tabs.js \
        src/index.html \
        src/style.css
git commit -m "[mdviewer] tabs: scaffold tabs.js module + #tab-bar slot

Empty MDV.tabs API stub and tab-bar container. No behavior change yet —
existing single-file flow keeps working. Wires the load order
(recents.js → tabs.js → session.js → app.js) for the next task."
```

---

## Task 2: Extract render pipeline + introduce one-tab `open()`

**Files:**
- Modify: `src/app.js`
- Modify: `src/tabs.js`

Goal: `MDV.tabs.open(path)` becomes the single entry point. App-level callers (file-tree click, link click, drag-drop, recents) all funnel through it. With `RENDER_CACHE_MAX=8` and one tab at a time, behavior is still 1:1 with today.

- [ ] **Step 1: In `app.js`, expose a render helper**

Add a function at the bottom of the existing `MDV.app` exposure:

```js
// src/app.js  — replace the existing MDV.app assignment

/**
 * Read + render a markdown file into the current #preview.
 * Also syncs app-level UI: window title, file-name label, zoom controls,
 * file-tree highlight, recents push. Tab state stays the caller's job.
 * Returns { ok, errorHtml? }.
 */
async function renderPath(filePath, { pushRecent = true } = {}) {
  try {
    const content = await invoke('read_file', { filePath })
    originalMarkdown = content
    currentFilePath = filePath
    const name = filePath.split(/[\\/]/).pop()
    fileNameText.textContent = name
    setWindowTitle(name, filePath)
    zoomControls.classList.add('visible')
    document.querySelectorAll('.tree-item.active').forEach(e => e.classList.remove('active'))
    const treeEl = fileTree.querySelector(`.tree-item[data-path="${CSS.escape(filePath)}"]`)
    if (treeEl) treeEl.classList.add('active')
    if (pushRecent) MDV.recents.pushRecentFile(filePath)
    await renderMarkdown(content)
    return { ok: true }
  } catch (err) {
    currentFilePath = null
    const missingName = filePath.split(/[\\/]/).pop()
    const errorHtml = `<div style="padding:40px;color:var(--text-dim);text-align:center">
      <p style="font-size:32px;margin-bottom:16px">📄</p>
      <p>File not found</p>
      <p style="font-size:12px;margin-top:8px;opacity:0.6">${filePath}</p></div>`
    return { ok: false, errorHtml, missingName }
  }
}

window.MDV.app = { openWorkspaceByPathRestore, openFileRestore, expandDirs, renderPath }
```

- [ ] **Step 2: Implement `tabs.open()` for the single-tab case**

Replace the `open` stub in `tabs.js`:

```js
async function open(path, { pinned = false, fromLink = false } = {}) {
  // Uniqueness: existing tab wins.
  const existing = state.tabs.find(t => t.path === path)
  if (existing) {
    if (pinned) existing.pinned = true
    activate(existing.id)
    return existing
  }

  // Replace-in-place if a preview tab exists.
  const previewIdx = state.tabs.findIndex(t => !t.pinned)
  if (!pinned && previewIdx >= 0) {
    const t = state.tabs[previewIdx]
    t.path = path
    t.title = basename(path)
    t.scrollTop = 0
    activate(t.id)
    return t
  }

  // Otherwise insert a new tab to the right of the active tab (or at end).
  const tab = {
    id: uid(),
    path,
    title: basename(path),
    pinned,
    scrollTop: 0,
    history: [path],
    historyIdx: 0,
    renderedHTML: null
  }
  const insertAt = state.activeId
    ? state.tabs.findIndex(t => t.id === state.activeId) + 1
    : state.tabs.length
  state.tabs.splice(insertAt, 0, tab)
  activate(tab.id)
  return tab
}

function basename(path) { return path.split(/[\\/]/).pop() }
```

- [ ] **Step 3: Implement `activate()` to drive `#preview` via `MDV.app.renderPath`**

```js
async function activate(id) {
  const tab = state.tabs.find(t => t.id === id)
  if (!tab) return
  // Save outgoing scroll
  const prev = active()
  const pw = document.getElementById('preview-wrap')
  if (prev && pw) prev.scrollTop = pw.scrollTop

  state.activeId = id
  await render(tab)
  if (pw) pw.scrollTop = tab.scrollTop || 0
  emit('activate'); emit('change')
}

async function render(tab) {
  const pw = document.getElementById('preview-wrap')
  const result = await MDV.app.renderPath(tab.path)
  // Missing-state handling lands in Task 7; for now if !ok, show errorHtml.
  if (!result.ok) {
    document.getElementById('preview-empty').classList.add('hidden')
    const preview = document.getElementById('preview')
    preview.style.display = 'block'
    preview.innerHTML = result.errorHtml
  }
}
```

- [ ] **Step 4: Reroute `openFile` callers to `MDV.tabs.open`**

In `app.js`, replace direct `openFile(...)` calls in:
- `createTreeNode` file branch: `el.addEventListener('click', () => MDV.tabs.open(node.path, { pinned: false }))`
- `renderDroppedFiles`: `el.addEventListener('click', () => MDV.tabs.open(f.path, { pinned: true }))`
- `pickFile` (recents): `await MDV.tabs.open(entry.path, { pinned: true })`
- The session restore call site `MDV.app.openFileRestore` keeps its current behavior for now (Task 5 rewires it).

The internal `openFile()` function stays for now; `navigateByLink`/`applyNavEntry` still use it. Removed in Task 3.

- [ ] **Step 5: Manual verify**

Run dev. Click various files in the tree. Verify:
- `MDV.tabs.list()` always shows exactly 1 tab.
- Clicking a different file replaces the same tab's `path` (no growth).
- Window title, file-tree highlight, TOC update on switch.
- Drag-drop, recents pickers all still open files.

- [ ] **Step 6: Commit**

```bash
git add src/app.js src/tabs.js
git commit -m "[mdviewer] tabs: route file-open through MDV.tabs.open

renderPath() exposed from app.js as a pure render helper. tabs.open()
implements uniqueness + preview-replace-in-place rules. With one tab at
a time the user-visible behavior is unchanged."
```

---

## Task 3: Multi-tab + tab-bar DOM + active-tab tracking helpers

**Files:**
- Modify: `src/tabs.js`
- Modify: `src/style.css`

- [ ] **Step 1: Add tab-bar rendering**

In `tabs.js`, add a `renderBar()` function called from `emit('change')`:

```js
const bar = () => document.getElementById('tab-bar')

on('change', renderBar)

function renderBar() {
  const el = bar(); if (!el) return
  const titles = computeDisambiguatedTitles(state.tabs)
  el.innerHTML = ''
  state.tabs.forEach((t, i) => {
    const div = document.createElement('div')
    div.className = 'tab' + (t.id === state.activeId ? ' active' : '') + (t.pinned ? '' : ' preview')
    div.dataset.id = t.id
    div.title = t.path
    div.draggable = true
    div.innerHTML = `<span class="tab-title">${escapeHtml(titles[i])}</span>
                     <span class="tab-close" title="Close">×</span>`
    el.appendChild(div)
  })
  // Auto-scroll active into view
  const activeEl = el.querySelector('.tab.active')
  if (activeEl) activeEl.scrollIntoView({ inline: 'nearest', block: 'nearest' })
}

function computeDisambiguatedTitles(tabs) {
  const counts = {}
  tabs.forEach(t => { counts[t.title] = (counts[t.title] || 0) + 1 })
  return tabs.map(t => {
    if (counts[t.title] <= 1) return t.title
    const parent = t.path.replace(/[\\/][^\\/]+$/, '').split(/[\\/]/).pop() || ''
    return parent ? `${parent}/${t.title}` : t.title
  })
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]))
}
```

- [ ] **Step 2: Tab-bar event delegation**

```js
document.addEventListener('DOMContentLoaded', () => {
  const el = bar(); if (!el) return
  el.addEventListener('click', e => {
    const closeBtn = e.target.closest('.tab-close')
    const tabEl = e.target.closest('.tab')
    if (!tabEl) return
    if (closeBtn) { close(tabEl.dataset.id); return }
    activate(tabEl.dataset.id)
  })
  el.addEventListener('dblclick', e => {
    const tabEl = e.target.closest('.tab')
    if (!tabEl) return
    promote(tabEl.dataset.id)
  })
  el.addEventListener('mousedown', e => {
    if (e.button !== 1) return  // middle-click
    const tabEl = e.target.closest('.tab'); if (!tabEl) return
    e.preventDefault(); close(tabEl.dataset.id)
  })
})
```

- [ ] **Step 3: Implement `promote`, `close`, `reorder`**

```js
function promote(id) {
  const t = state.tabs.find(x => x.id === id); if (!t || t.pinned) return
  t.pinned = true; emit('change')
}

function close(id) {
  const idx = state.tabs.findIndex(t => t.id === id); if (idx < 0) return
  const wasActive = state.tabs[idx].id === state.activeId
  state.tabs.splice(idx, 1)
  if (wasActive) {
    const next = state.tabs[idx] || state.tabs[idx - 1] || null
    state.activeId = next ? next.id : null
    if (next) activate(next.id)
    else showEmptyState()
  } else {
    emit('change')
  }
}

function showEmptyState() {
  const preview = document.getElementById('preview')
  const empty   = document.getElementById('preview-empty')
  if (preview) { preview.style.display = 'none'; preview.innerHTML = '' }
  if (empty)   empty.classList.remove('hidden')
  document.getElementById('file-name-text').textContent = ''
  window.__TAURI__.window.getCurrentWindow().setTitle('MD Viewer')
  emit('change')
}

function reorder(id, newIndex) {
  const idx = state.tabs.findIndex(t => t.id === id); if (idx < 0) return
  const [t] = state.tabs.splice(idx, 1)
  state.tabs.splice(Math.max(0, Math.min(state.tabs.length, newIndex)), 0, t)
  emit('change')
}
```

- [ ] **Step 4: Per-tab scroll save**

In `app.js`, modify the existing scroll handler to save into the active tab instead of session directly:

```js
previewWrapEl.addEventListener('scroll', () => {
  const t = MDV.tabs.active()
  if (t) t.scrollTop = previewWrapEl.scrollTop
  // session save still happens in Task 5 via tabs.on('change')
})
```

(Remove the `MDV.recents.saveSession({ scrollTop })` call here — Task 5 reintroduces persistence centrally.)

- [ ] **Step 5: Add tab CSS + theme variables**

Append to `style.css`:

```css
:root[data-theme="dark"]  { --tab-bg: #2d2d2d; --tab-bg-active: #1e1e1e; --tab-bg-hover: #383838; --tab-border: #3a3a3a; }
:root[data-theme="light"] { --tab-bg: #ececec; --tab-bg-active: #ffffff; --tab-bg-hover: #dedede; --tab-border: #c8c8c8; }

#tab-bar { background: var(--tab-bg); border-bottom: 1px solid var(--tab-border); height: 32px; flex-shrink: 0;
           position: sticky; top: 0; z-index: 10; }
.tab { display: flex; align-items: center; min-width: 80px; max-width: 200px; height: 32px; padding: 0 8px;
       background: var(--tab-bg); border-right: 1px solid var(--tab-border); cursor: pointer;
       font-size: 12px; color: var(--text); user-select: none; }
.tab:hover                  { background: var(--tab-bg-hover); }
.tab.active                 { background: var(--tab-bg-active); }
.tab.preview .tab-title     { font-style: italic; }
.tab-title                  { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tab-close                  { width: 16px; height: 16px; line-height: 16px; text-align: center; border-radius: 3px;
                              opacity: 0; margin-left: 4px; flex-shrink: 0; }
.tab:hover .tab-close,
.tab.active .tab-close      { opacity: 0.7; }
.tab-close:hover            { opacity: 1; background: var(--tab-bg-hover); }
```

- [ ] **Step 6: Manual verify**

- Open 3 different files via single-click → still 1 preview tab (italic title), path keeps changing.
- Double-click the tab → italic disappears (pinned).
- Click another file in tree → new preview tab appears next to the pinned tab.
- Middle-click and `×` close tabs. Closing last tab shows empty state.
- Same basename collision test: open two `README.md` from different dirs → titles become `parent/README.md`.

- [ ] **Step 7: Commit**

```bash
git add src/tabs.js \
        src/style.css \
        src/app.js
git commit -m "[mdviewer] tabs: tab-bar UI + multi-tab promote/close/reorder

Click activates, double-click promotes preview→pinned, middle-click and
× close. Same-basename tabs disambiguate to parent/basename. Per-tab
scrollTop is now tracked on the Tab object."
```

---

## Task 4: Keyboard shortcuts + drag-drop reorder

**Files:**
- Modify: `src/app.js` (shortcut block) and `tabs.js` (drag handlers)

- [ ] **Step 1: Add shortcuts to `app.js` keydown block**

Inside the existing `document.addEventListener('keydown', ...)`:

```js
// Tabs: Ctrl+W close, Ctrl+Tab cycle, Ctrl+1..9 jump
if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'w') {
  e.preventDefault()
  const t = MDV.tabs.active(); if (t) MDV.tabs.close(t.id)
}
if (e.ctrlKey && e.key === 'Tab') {
  e.preventDefault()
  const tabs = MDV.tabs.list(); if (!tabs.length) return
  const cur = MDV.tabs.active()
  const i = cur ? tabs.findIndex(t => t.id === cur.id) : 0
  const next = e.shiftKey ? (i - 1 + tabs.length) % tabs.length
                          : (i + 1) % tabs.length
  MDV.tabs.activate(tabs[next].id)
}
if ((e.ctrlKey || e.metaKey) && /^[1-9]$/.test(e.key)) {
  e.preventDefault()
  const tabs = MDV.tabs.list()
  const idx = e.key === '9' ? tabs.length - 1 : parseInt(e.key, 10) - 1
  if (tabs[idx]) MDV.tabs.activate(tabs[idx].id)
}
```

Note: `Ctrl+T` already toggles TOC. Do not change that.

- [ ] **Step 2: Drag-and-drop reorder in `tabs.js`**

Inside the DOMContentLoaded handler:

```js
let dragId = null
el.addEventListener('dragstart', e => {
  const t = e.target.closest('.tab'); if (!t) return
  dragId = t.dataset.id
  e.dataTransfer.effectAllowed = 'move'
})
el.addEventListener('dragover', e => {
  if (!dragId) return
  e.preventDefault()
  e.dataTransfer.dropEffect = 'move'
})
el.addEventListener('drop', e => {
  if (!dragId) return
  e.preventDefault()
  const target = e.target.closest('.tab')
  let newIdx
  if (!target) {
    newIdx = state.tabs.length
  } else {
    const rect = target.getBoundingClientRect()
    const after = e.clientX > rect.left + rect.width / 2
    const tIdx = state.tabs.findIndex(x => x.id === target.dataset.id)
    newIdx = after ? tIdx + 1 : tIdx
  }
  reorder(dragId, newIdx)
  dragId = null
})
el.addEventListener('dragend', () => { dragId = null })
```

- [ ] **Step 3: Manual verify**

- Open 4 tabs. `Ctrl+1`..`Ctrl+4` jump correctly. `Ctrl+9` jumps to last regardless.
- `Ctrl+Tab` / `Ctrl+Shift+Tab` cycle forward/back, wrapping.
- `Ctrl+W` closes active. `Ctrl+T` still toggles TOC (no regression).
- Drag tab 1 onto tab 3 → ends up at the right side of tab 3.

- [ ] **Step 4: Commit**

```bash
git add src/app.js src/tabs.js
git commit -m "[mdviewer] tabs: shortcuts (Ctrl+W/Tab/1..9) + drag reorder"
```

---

## Task 5: Link-click auto-promote rule

**Files:**
- Modify: `src/app.js` (link click handler), `tabs.js` (promote+open helper)

The existing handler in `app.js` (`preview.addEventListener('click', async e => { ... })`) calls `navigateByLink` which mutates the single global `navHistory` and reuses the current `#preview`. We replace that flow for `.md` link navigation with a tab-aware version.

- [ ] **Step 1: Add helper to `tabs.js`**

```js
async function openFromLink(targetPath) {
  // Uniqueness wins: if any tab has this path, just jump.
  const existing = state.tabs.find(t => t.path === targetPath)
  if (existing) { activate(existing.id); return existing }

  // Promote current preview (if active is preview), then open new preview to its right.
  const cur = active()
  if (cur && !cur.pinned) cur.pinned = true
  return open(targetPath, { pinned: false, fromLink: true })
}

NS.tabs.openFromLink = openFromLink
```

- [ ] **Step 2: Rewrite `.md` branch of preview link handler in `app.js`**

```js
// inside preview.addEventListener('click', async e => { ... })
if (ext === 'md' || ext === 'markdown') {
  await MDV.tabs.openFromLink(resolved)
  // If the link had a #anchor, scroll after render
  if (hashPart) {
    requestAnimationFrame(() => {
      const id = decodeURIComponent(hashPart)
      const target = preview.querySelector(`#${CSS.escape(id)}`) ||
                     preview.querySelector(`[id="${id}"]`)
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }
} else {
  invoke('open_path_cmd', { path: resolved })
}
```

For the **same-document anchor (`#x`)** branch, leave the existing `navigateByLink(currentFilePath, id)` for now (no tab change is needed and Task 6 replaces history wholesale).

For the **non-existent path** branch, change `navigateByLink(resolved, null)` to `MDV.tabs.openFromLink(resolved)` — the missing-file UI lands in Task 7.

- [ ] **Step 3: Manual verify**

- Open file A as preview (single click) → italic.
- Click an MD link inside A → A becomes pinned (italic gone), B opens as new preview, B is active.
- Open file C double-click → pinned. Click an MD link in C → C stays pinned (no promote needed), D opens as new preview.
- Click a link to an already-open file → jumps to existing tab, no duplicate.

- [ ] **Step 4: Commit**

```bash
git add src/tabs.js src/app.js
git commit -m "[mdviewer] tabs: auto-promote previous preview on link click

VS Code-style: navigating from a preview tab promotes it to pinned and
opens the target as a new preview to its right. Pinned source tabs are
unaffected. Uniqueness (same path = jump to existing tab) wins."
```

---

## Task 6: Per-tab nav history (replace global `navHistory`)

**Files:**
- Modify: `src/tabs.js`, `src/app.js`

- [ ] **Step 1: In `tabs.js`, implement history methods**

Each `Tab` already has `history: [path]` and `historyIdx: 0` from Task 2. Add:

```js
function pushHistoryForActive(targetPath) {
  const t = active(); if (!t) return
  // truncate forward stack
  t.history = t.history.slice(0, t.historyIdx + 1)
  t.history.push(targetPath)
  t.historyIdx = t.history.length - 1
}

async function navBack() {
  const t = active(); if (!t || t.historyIdx <= 0) return false
  t.historyIdx--
  // open() with uniqueness: same path may already be the current tab.
  // Use a low-level swap: change t.path and re-render.
  t.path = t.history[t.historyIdx]; t.title = basename(t.path); t.scrollTop = 0
  await render(t); emit('change')
  return true
}

async function navForward() {
  const t = active(); if (!t || t.historyIdx >= t.history.length - 1) return false
  t.historyIdx++
  t.path = t.history[t.historyIdx]; t.title = basename(t.path); t.scrollTop = 0
  await render(t); emit('change')
  return true
}

NS.tabs.pushHistoryForActive = pushHistoryForActive
NS.tabs.navBack = navBack
NS.tabs.navForward = navForward
```

- [ ] **Step 2: Wire `openFromLink` to push history**

```js
async function openFromLink(targetPath) {
  const existing = state.tabs.find(t => t.path === targetPath)
  if (existing) { activate(existing.id); return existing }

  const cur = active()
  if (cur && !cur.pinned) cur.pinned = true
  const t = await open(targetPath, { pinned: false, fromLink: true })
  // Newly-created tab has its own history starting at this path; nothing extra.
  return t
}
```

When navigating WITHIN the active tab via `navBack/navForward`, history index moves. When opening a new tab via link, the new tab gets its own fresh history. This matches the spec: history is per-tab.

- [ ] **Step 3: Replace `Alt+←/→` handlers in `app.js`**

```js
if (e.altKey && e.key === 'ArrowLeft')  { e.preventDefault(); MDV.tabs.navBack() }
if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); MDV.tabs.navForward() }
```

Same for the mouse back/forward buttons (`window.addEventListener('mouseup', ...)`).

- [ ] **Step 4: Delete the now-dead globals + functions in `app.js`**

Remove:
- `const navHistory = []`, `let navIndex = -1`, `resetHistory()`
- `navigateByLink`, `applyNavEntry`, `navBack`, `navForward` (the app.js versions)
- The `resetNav` parameter from `openFile` (still used internally by image/preview restore)

Same-document anchor (`#x`) link branch: replace `navigateByLink(currentFilePath, id)` with a direct `scrollIntoView` (no tab change, no history push — anchors are intra-doc):

```js
if (href.startsWith('#')) {
  e.preventDefault()
  if (!currentFilePath) return
  const id = decodeURIComponent(href.slice(1))
  const target = preview.querySelector(`#${CSS.escape(id)}`) ||
                 preview.querySelector(`[id="${id}"]`)
  if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' })
  return
}
```

- [ ] **Step 5: Manual verify**

- In tab A, click MD link → goes to B (new tab). `Alt+←` in B does nothing (B has only its own start in history).
- In tab A, follow link to B then `Alt+←` should not jump to B's tab — the user must use `Ctrl+Tab` for that. *(Confirm this matches spec: history is per-tab, link clicks create new tabs, so `Alt+←` is mostly meaningful when navigating within a single tab — e.g. clicking a `#anchor`-less link that re-uses the current tab. With current rules, in-tab navigation only happens via `navBack/navForward` themselves. Acceptable: `Alt+←/→` simply does nothing in fresh tabs.)*
- Open A double-click (pinned). In A, follow links manually until you have a multi-step in-tab history (you can simulate by calling `MDV.tabs.pushHistoryForActive('/some/abs.md')` then `MDV.tabs.navBack()` from devtools).
- No JS errors anywhere; `Ctrl+T` still toggles TOC; mouse back/forward buttons no longer crash.

- [ ] **Step 6: Commit**

```bash
git add src/tabs.js src/app.js
git commit -m "[mdviewer] tabs: per-tab nav history; drop global navHistory

Each Tab owns its own history/historyIdx. Alt+←/→ and mouse back/forward
operate on the active tab only. Same-doc anchor links no longer push
history; they just scroll."
```

---

## Task 7: LRU render cache + missing-file state

**Files:**
- Modify: `src/tabs.js`, `src/app.js`

- [ ] **Step 1: Cache the rendered HTML on each successful render**

In `tabs.js`, modify `render(tab)`:

```js
async function render(tab) {
  const preview     = document.getElementById('preview')
  const previewEmpty= document.getElementById('preview-empty')

  // Cache hit
  if (tab.renderedHTML != null) {
    previewEmpty.classList.add('hidden')
    preview.style.display = 'block'
    preview.innerHTML = tab.renderedHTML
    bumpLru(tab.id)
    // Keep app.js global state in sync so #refresh, #translate work
    await MDV.app.adoptRenderedTab(tab.path)
    return
  }

  // Cache miss → show "loading" via the existing preview-empty placeholder
  preview.innerHTML = ''
  preview.style.display = 'none'
  previewEmpty.classList.remove('hidden')

  const result = await MDV.app.renderPath(tab.path)
  if (!result.ok) {
    tab.missing = true
    previewEmpty.classList.add('hidden')
    preview.style.display = 'block'
    preview.innerHTML = result.errorHtml
    emit('change')
    return
  }
  tab.missing = false
  tab.renderedHTML = preview.innerHTML
  bumpLru(tab.id)
  evictLru()
  emit('change')
}

const lruOrder = []  // most-recently-used at the END
function bumpLru(id) {
  const i = lruOrder.indexOf(id); if (i >= 0) lruOrder.splice(i, 1)
  lruOrder.push(id)
}
function evictLru() {
  while (lruOrder.length > RENDER_CACHE_MAX) {
    const id = lruOrder.shift()
    const t = state.tabs.find(x => x.id === id)
    if (t) t.renderedHTML = null
  }
}
```

- [ ] **Step 2: Add `MDV.app.adoptRenderedTab(path)` for cache-hit re-sync**

This sets `currentFilePath`, `originalMarkdown`, window title, file-tree highlight, and rebuilds the TOC against the already-rendered DOM (it walks `preview.querySelectorAll('h1..h6')` as `buildToc` does). Fastest implementation:

```js
// src/app.js
async function adoptRenderedTab(filePath) {
  currentFilePath = filePath
  // Re-read source so refresh / translate still work. Cheap relative to render.
  try { originalMarkdown = await invoke('read_file', { filePath }) }
  catch { originalMarkdown = null }
  const name = filePath.split(/[\\/]/).pop()
  fileNameText.textContent = name
  setWindowTitle(name, filePath)
  zoomControls.classList.add('visible')
  document.querySelectorAll('.tree-item.active').forEach(e => e.classList.remove('active'))
  const treeEl = fileTree.querySelector(`.tree-item[data-path="${CSS.escape(filePath)}"]`)
  if (treeEl) treeEl.classList.add('active')
  buildToc()
}

window.MDV.app = { ..., adoptRenderedTab }
```

(Add `adoptRenderedTab` to the existing `MDV.app` object exposed at the bottom.)

- [ ] **Step 3: Missing-file styling**

Update `renderBar()` to add a `missing` class:

```js
div.className += t.missing ? ' missing' : ''
```

CSS:

```css
.tab.missing .tab-title { text-decoration: line-through; }
.tab.missing::before    { content: ''; width: 6px; height: 6px; border-radius: 50%;
                          background: #f48771; margin-right: 6px; flex-shrink: 0; }
```

- [ ] **Step 4: Cache-invalidate on F5 refresh**

In `app.js`, change `refreshFile`:

```js
async function refreshFile() {
  const t = MDV.tabs.active(); if (!t) return
  t.renderedHTML = null
  t.missing = false
  await MDV.tabs.activate(t.id)  // force re-render
}
```

Remove the previous `currentFilePath`-based body. The button click handler stays the same.

- [ ] **Step 5: Manual verify**

- Open 10 different files (mix of single/double-click). Cycle through them with `Ctrl+Tab`. The 9th unique cache forces eviction of the LRU; activating an evicted tab shows brief loading then re-renders.
- Externally delete a file open in a tab. `F5` on that tab → tab gets red dot, strikethrough title, "File not found" preview. Other tabs unaffected.
- `F5` on a normal tab → re-renders fresh, scroll preserved.

- [ ] **Step 6: Commit**

```bash
git add src/tabs.js src/app.js src/style.css
git commit -m "[mdviewer] tabs: LRU render cache + missing-file state

Per-tab innerHTML cache (LRU bound 8) keeps tab switching instant for
working sets that fit. Missing files render with red dot + strikethrough
and the existing broken-file preview. F5 invalidates the active cache."
```

---

## Task 8: Session schema extension + restore + legacy migration

**Files:**
- Modify: `src/recents.js`, `src/session.js`, `src/tabs.js`

- [ ] **Step 1: Extend recents.js schema**

Find `loadSession` / `saveSession` in `recents.js`. Ensure they:
- Accept and persist additional fields `tabs: [{path, scrollTop}]` and `activeTabPath: string|null`.
- Keep returning legacy `activeFile` / `scrollTop` keys for back-compat.
- Treat unknown fields as pass-through (do not strip).

If the implementation already does pass-through merge (likely), no change needed beyond the call sites. Verify by reading the file before editing.

- [ ] **Step 2: Save trigger from tabs**

In `session.js`, after `MDV.session = ...`:

```js
function snapshotTabs() {
  const tabs = MDV.tabs.list()
    .filter(t => t.pinned)
    .map(t => ({ path: t.path, scrollTop: t.scrollTop || 0 }))
  const cur = MDV.tabs.active()
  let activeTabPath = null
  if (cur) {
    if (cur.pinned) activeTabPath = cur.path
    else {
      // most-recently-active pinned tab
      const pinned = MDV.tabs.list().filter(t => t.pinned)
      activeTabPath = pinned.length ? pinned[pinned.length - 1].path : null
    }
  }
  return { tabs, activeTabPath }
}

let saveTimer = null
function scheduleSave() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    MDV.recents.saveSession(snapshotTabs())
  }, 500)
}

document.addEventListener('DOMContentLoaded', () => {
  if (MDV.tabs && MDV.tabs.on) MDV.tabs.on('change', scheduleSave)
})
```

- [ ] **Step 3: Restore in `restoreSession`**

Replace the existing single-file restore logic:

```js
async function restoreSession() {
  // launch-file branch unchanged
  const launchFile = await getLaunchFile()
  if (launchFile) return

  const s = MDV.recents.loadSession()
  const invoke = window.__TAURI__.core.invoke

  if (s.workspaceRoot) {
    const wsExists = await invoke('path_exists', { path: s.workspaceRoot })
    if (wsExists) {
      await MDV.app.openWorkspaceByPathRestore(s.workspaceRoot)
      MDV.app.expandDirs(s.expandedDirs || [])
    }
  }

  // New-style: restore tabs[]
  if (Array.isArray(s.tabs) && s.tabs.length) {
    for (const entry of s.tabs) {
      const exists = await invoke('path_exists', { path: entry.path })
      if (!exists) continue
      const t = await MDV.tabs.open(entry.path, { pinned: true })
      t.scrollTop = entry.scrollTop || 0
    }
    if (s.activeTabPath) {
      const cur = MDV.tabs.list().find(t => t.path === s.activeTabPath)
      if (cur) await MDV.tabs.activate(cur.id)
    }
    return
  }

  // Legacy: single activeFile → one pinned tab
  if (s.activeFile) {
    const fileExists = await invoke('path_exists', { path: s.activeFile })
    if (fileExists) {
      const t = await MDV.tabs.open(s.activeFile, { pinned: true })
      t.scrollTop = s.scrollTop || 0
      await MDV.tabs.activate(t.id)
    }
  }
}
```

- [ ] **Step 4: Suppress save during restore**

To avoid restore writing back stale partial state mid-loop, gate the save handler with a flag. Both the flag and the listener must live in the same `session.js` IIFE scope so `restoring = false` is visible to the listener:

```js
// session.js — inside the existing (function () { ... })()
let restoring = true

function snapshotTabs() { /* as Step 2 */ }
function scheduleSave() { /* as Step 2 */ }

if (MDV.tabs && MDV.tabs.on) {
  MDV.tabs.on('change', () => {
    if (restoring) return
    scheduleSave()
  })
}

// inside restoreSession() — after all open()/activate() calls, on every exit path:
restoring = false
scheduleSave()  // one canonical write at the end
```

Make sure `restoreSession()` clears `restoring` even on the early-return paths (no `workspaceRoot`, no `tabs[]`, no `activeFile`).

- [ ] **Step 5: Manual verify**

- Open 4 files (2 pinned, 1 preview, 1 active pinned), set distinct scroll positions. Quit + restart. Expected: 3 pinned tabs restored with their scrolls, preview gone, active pinned tab activated.
- Delete `~/.local/share/...` session backing OR seed it with an OLD-format `{ activeFile: "...", scrollTop: 42 }` object → on next start, exactly 1 pinned tab opens with that scrollTop.
- No tab → quit → restart should land in empty state (no errors).

- [ ] **Step 6: Commit**

```bash
git add src/session.js src/recents.js src/tabs.js
git commit -m "[mdviewer] tabs: persist + restore pinned tabs across sessions

Session schema now carries tabs[]/activeTabPath. Preview tabs are
intentionally volatile. Legacy sessions (only activeFile) migrate to a
single pinned tab. Save is debounced 500ms and suppressed during the
restore pass."
```

---

## Task 9: Final polish + README + smoke test

**Files:**
- Modify: `src/style.css` (any visual polish), `README.md`

- [ ] **Step 1: Refine missing-file empty preview area**

When the active tab is missing, ensure the existing broken-link UX matches what `app.js`'s old `openFile` produced (the same red icon block). Visual consistency check only.

- [ ] **Step 2: Update README shortcuts table**

Append rows:

```md
| `Ctrl+W`             | Close active tab |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Cycle tabs |
| `Ctrl+1..9`          | Jump to Nth tab (Ctrl+9 = last) |
```

Update About modal's `<table id="about-shortcuts">` in `index.html` similarly.

- [ ] **Step 3: Run the full §9 manual test checklist from the spec**

Mark each item ✅ or note residual issue. Do NOT proceed to commit until all 10 items are clean (or document explicit exceptions in the commit body).

- [ ] **Step 4: Bump version**

In `package.json` and `src-tauri/tauri.conf.json` and the About modal version label, bump `2.1.0` → `2.2.0`.

- [ ] **Step 5: Commit and push**

```bash
git add -A
git commit -m "[mdviewer] tabs: polish + README/about + bump to v2.2.0

Documents shortcuts, ensures missing-file UI parity, and runs through
the spec §9 manual checklist."
git push -u origin mdviewer-tabs
```

- [ ] **Step 6: Open PR**

```bash
gh pr create --title "[mdviewer] Tab browsing (v2.2.0)" --body "$(cat <<'EOF'
## Summary
- VS Code-style tab browsing in MDViewer: single click = preview tab, double click = pinned, link-click in preview auto-promotes
- Per-tab scroll, per-tab nav history, LRU render cache (8)
- Session restore now persists pinned tabs; legacy single-file sessions migrate

## Test plan
- [ ] Spec §9 manual checklist (items 1–10) passes
- [ ] Existing flows untouched: workspace open, recents, drag-drop, translation, theme/zoom, F5, F11

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Dependencies + Order

Tasks 1–8 must be done in order (each task depends on the previous one's API surface). Task 9 is final polish and can split off if needed.

## Out of Scope (Spec §11 reaffirmed)

Editing, "reopen closed tab", split panes, persisting preview tabs across restarts, cross-window tab sync.
