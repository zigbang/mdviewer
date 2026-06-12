# MDViewer Recents & Session Restore — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Subagent model:** Dispatch each task's subagent with `model: "sonnet"`. Coordination/review stays on the parent (Opus) session. Do NOT use Opus for implementation tasks.

**Goal:** Add LRU recent-workspaces (20) + recent-files (20) + auto session restore (workspace + active file + scroll + tree expand state) to MDViewer.

**Architecture:**
- Two new ES module-style script files (`src/recents.js`, `src/session.js`) loaded as classic `<script>`s alongside existing `src/app.js`. They expose globals on `window.MDV` (no bundler in this project, ES modules with Tauri webview can be flaky — keep parity with current loading style).
- Storage: `localStorage` only (3 new `md-viewer-*` keys). No Rust changes — `build_file_tree` Tauri command already exists.
- Persistence triggers are wired by inserting hook calls inside existing `app.js` event handlers (folder open, file open, scroll, tree toggle, link follow).
- Restore runs once at DOMContentLoaded after the existing `applyTheme`/`applyZoom` lines.

**Tech Stack:**
- Tauri v2 (Rust backend) + vanilla JS frontend
- `localStorage` for persistence
- No test framework — verification is manual per task

**Spec:** `docs/superpowers/specs/2026-04-30-mdviewer-recents-design.md`

**Working directory for ALL paths below:** ``

---

## Task 0: Pre-flight verification

**Files:**
- Read: `src/app.js`, `src/index.html`, `src-tauri/src/lib.rs`

- [ ] **Step 1: Confirm starting baseline builds and runs**

```bash
cd .
npm install        # if node_modules missing
npx tauri dev      # smoke: app launches, "Open Folder" works
```

Expected: app opens, can pick a folder, see tree, click a `.md` file, see render. No console errors.

- [ ] **Step 2: Confirm `build_file_tree` Rust command exists and returns `FileNode | null`**

Run: `grep -n 'build_file_tree' src-tauri/src/lib.rs`
Expected: a `#[tauri::command] fn build_file_tree(dir_path: String) -> Option<FileNode>` near line 77, and registration in `invoke_handler` near line 204.

- [ ] **Step 3: Note existing localStorage keys**

Run: `grep -n 'localStorage' src/app.js`
Expected: only `md-viewer-claude-token`, `md-viewer-theme`, `md-viewer-zoom`. New keys (`md-viewer-recent-workspaces`, `md-viewer-recent-files`, `md-viewer-session`) must not collide.

- [ ] **Step 4: Commit baseline note (no code change)**

Skip commit — Task 0 is read-only verification. Move to Task 1.

---

## Task 1: Create `recents.js` (storage + LRU + session save)

**Files:**
- Create: `src/recents.js`

- [ ] **Step 1: Write the file**

Create `src/recents.js` with this exact content:

```javascript
/* ════════════════════════════════════════════════════════
   MD Viewer — recents.js
   Storage + LRU + session save (debounced)
   ════════════════════════════════════════════════════════ */
(function () {
  const NS = (window.MDV = window.MDV || {})

  const KEY_WS      = 'md-viewer-recent-workspaces'
  const KEY_FILES   = 'md-viewer-recent-files'
  const KEY_SESSION = 'md-viewer-session'
  const MAX = 20

  // ── safe JSON parse ──
  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key)
      if (raw == null) return fallback
      const v = JSON.parse(raw)
      return v == null ? fallback : v
    } catch (e) {
      console.warn('[recents] corrupt key, resetting:', key, e)
      try { localStorage.removeItem(key) } catch (_) {}
      return fallback
    }
  }

  function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)) }
    catch (e) { console.warn('[recents] write failed:', key, e) }
  }

  // ── basename helper (handles both / and \) ──
  function basename(path) {
    if (!path) return ''
    const m = path.match(/[^\\/]+$/)
    return m ? m[0] : path
  }

  // ── LRU push (mutates and returns new list, max 20) ──
  function lruPush(list, entry) {
    const filtered = list.filter(x => x.path !== entry.path)
    filtered.unshift(entry)
    if (filtered.length > MAX) filtered.length = MAX
    return filtered
  }

  // ── public: recents lists ──
  function loadRecentWorkspaces() { return readJson(KEY_WS, []) }
  function loadRecentFiles()      { return readJson(KEY_FILES, []) }

  function pushRecentWorkspace(path) {
    if (!path) return
    const list = loadRecentWorkspaces()
    const next = lruPush(list, { path, name: basename(path), lastOpenedAt: Date.now() })
    writeJson(KEY_WS, next)
  }

  function pushRecentFile(path) {
    if (!path) return
    const list = loadRecentFiles()
    const next = lruPush(list, { path, name: basename(path), lastOpenedAt: Date.now() })
    writeJson(KEY_FILES, next)
  }

  function clearRecents() {
    writeJson(KEY_WS, [])
    writeJson(KEY_FILES, [])
  }

  // ── public: session ──
  function defaultSession() {
    return { workspaceRoot: null, activeFile: null, scrollTop: 0, expandedDirs: [] }
  }

  function loadSession() {
    const s = readJson(KEY_SESSION, null)
    if (!s || typeof s !== 'object') return defaultSession()
    return Object.assign(defaultSession(), s)
  }

  // In-memory current session — single source of truth between save calls.
  let _sessionCache = null
  function _session() {
    if (_sessionCache == null) _sessionCache = loadSession()
    return _sessionCache
  }

  let _saveTimer = null
  function _flush() {
    if (_sessionCache == null) return
    writeJson(KEY_SESSION, _sessionCache)
  }

  // saveSession(partial) — merges partial into in-memory session, debounces 300ms write.
  function saveSession(partial) {
    const s = _session()
    Object.assign(s, partial || {})
    if (_saveTimer) clearTimeout(_saveTimer)
    _saveTimer = setTimeout(_flush, 300)
  }

  // saveSessionNow() — synchronous flush (e.g., on workspace switch).
  function saveSessionNow(partial) {
    const s = _session()
    if (partial) Object.assign(s, partial)
    if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null }
    _flush()
  }

  // Flush on visibilitychange / beforeunload to not lose pending scroll updates.
  window.addEventListener('beforeunload', _flush)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') _flush()
  })

  // Export
  NS.recents = {
    loadRecentWorkspaces,
    loadRecentFiles,
    pushRecentWorkspace,
    pushRecentFile,
    clearRecents,
    loadSession,
    saveSession,
    saveSessionNow,
    basename,
  }
})()
```

- [ ] **Step 2: Manual smoke check (open DevTools console)**

After loading the file in Task 2 (script tag), in DevTools:

```javascript
MDV.recents.pushRecentFile('/tmp/a.md')
MDV.recents.pushRecentFile('/tmp/b.md')
MDV.recents.loadRecentFiles()  // → [{path:'/tmp/b.md', ...}, {path:'/tmp/a.md', ...}]
MDV.recents.pushRecentFile('/tmp/a.md')
MDV.recents.loadRecentFiles()  // → a.md is now first (LRU)
```

(This step is verified after Task 2 wires the script tag.)

- [ ] **Step 3: Commit**

```bash
git add src/recents.js
git commit -m "[mdviewer] recents.js: localStorage LRU + debounced session save"
```

---

## Task 2: Add Recent button + dropdown DOM, load `recents.js`

**Files:**
- Modify: `src/index.html`

- [ ] **Step 1: Locate the toolbar Open Folder button**

Run: `grep -n 'btn-open-folder\b' src/index.html`
Expected: a `<button id="btn-open-folder">` element. Note its surrounding container.

- [ ] **Step 2: Add Recent button immediately after `btn-open-folder`**

Insert (preserving existing icon style — copy the SVG/emoji pattern of nearby buttons; if those use emoji like `📁`, use `🕘`):

```html
<button id="btn-recent" title="Recent (workspaces & files)">🕘 Recent ▾</button>
<div id="recent-dropdown" class="recent-dropdown hidden" role="menu">
  <div class="recent-section">
    <div class="recent-section-title">Recent Workspaces</div>
    <div id="recent-ws-list" class="recent-list"></div>
  </div>
  <div class="recent-section">
    <div class="recent-section-title">Recent Files</div>
    <div id="recent-files-list" class="recent-list"></div>
  </div>
  <div class="recent-divider"></div>
  <button id="btn-clear-recents" class="recent-action">Clear Recent</button>
</div>
```

- [ ] **Step 3: Add `<script src="recents.js"></script>` BEFORE `<script src="app.js">`**

```html
<script src="recents.js"></script>
<script src="app.js"></script>
```

(The `<script src="session.js">` will be added in Task 6.)

- [ ] **Step 4: Smoke check**

Run: `npx tauri dev` (from ``)

Expected:
- App launches without console error
- "🕘 Recent ▾" button visible in toolbar (no styling yet, dropdown invisible due to `hidden`)
- DevTools: `MDV.recents` is defined → run the LRU test from Task 1 Step 2

- [ ] **Step 5: Commit**

```bash
git add src/index.html
git commit -m "[mdviewer] toolbar: Recent button + dropdown skeleton, load recents.js"
```

---

## Task 3: Style the dropdown

**Files:**
- Modify: `src/style.css`

- [ ] **Step 1: Append CSS to `style.css`**

Add at the end of the file:

```css
/* ── Recent dropdown ────────────────────────────── */
.recent-dropdown {
  position: absolute;
  top: 40px;
  left: 8px;
  z-index: 100;
  min-width: 360px;
  max-width: 520px;
  max-height: 70vh;
  overflow-y: auto;
  background: var(--bg-elev, #1e1e1e);
  color: var(--text, #ddd);
  border: 1px solid var(--border, #333);
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.35);
  padding: 6px 0;
  font-size: 13px;
}
.recent-dropdown.hidden { display: none; }

.recent-section-title {
  padding: 6px 12px 2px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-dim, #888);
}

.recent-list { display: flex; flex-direction: column; }
.recent-item {
  display: flex;
  flex-direction: column;
  padding: 6px 12px;
  cursor: pointer;
  border-left: 2px solid transparent;
}
.recent-item:hover {
  background: var(--bg-hover, #2a2a2a);
  border-left-color: var(--accent, #4a9eff);
}
.recent-item .recent-name { font-weight: 500; }
.recent-item .recent-path {
  color: var(--text-dim, #888);
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.recent-item.disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.recent-item.disabled:hover { background: transparent; border-left-color: transparent; }

.recent-list .recent-empty {
  padding: 4px 12px 8px;
  color: var(--text-dim, #888);
  font-style: italic;
}

.recent-divider {
  height: 1px;
  background: var(--border, #333);
  margin: 6px 0;
}

.recent-action {
  width: 100%;
  text-align: left;
  padding: 8px 12px;
  background: transparent;
  color: var(--text, #ddd);
  border: none;
  cursor: pointer;
  font: inherit;
}
.recent-action:hover { background: var(--bg-hover, #2a2a2a); }
```

> Note: re-use existing CSS variable names if `style.css` already defines them differently. Run `grep -n '\-\-bg-\|--text\|--border\|--accent' src/style.css` first; if names differ, adjust the new rules to match. Only the variable names are negotiable, not the structure.

- [ ] **Step 2: Smoke check**

Reload (Ctrl+R in tauri dev). In DevTools:

```javascript
document.getElementById('recent-dropdown').classList.remove('hidden')
```

Expected: dropdown frame appears (empty sections — fine). Toggle dark/light theme (existing button) → dropdown remains legible in both.

- [ ] **Step 3: Commit**

```bash
git add src/style.css
git commit -m "[mdviewer] style: recent dropdown panel"
```

---

## Task 4: Wire Recent button (open/close, render, validate, click handlers)

**Files:**
- Modify: `src/app.js` (append a new section near the bottom, before the resize-handle setup)

- [ ] **Step 1: Add this code block to `app.js`**

Insert before the `// ── 리사이즈 핸들 ──` line:

```javascript
// ── Recent dropdown ────────────────────────────────────
const btnRecent       = document.getElementById('btn-recent')
const recentDropdown  = document.getElementById('recent-dropdown')
const recentWsList    = document.getElementById('recent-ws-list')
const recentFilesList = document.getElementById('recent-files-list')
const btnClearRecents = document.getElementById('btn-clear-recents')

async function renderRecentList(container, entries, onPick) {
  container.innerHTML = ''
  if (!entries.length) {
    const empty = document.createElement('div')
    empty.className = 'recent-empty'
    empty.textContent = '(none)'
    container.appendChild(empty)
    return
  }
  // existence check in parallel
  const flags = await Promise.all(entries.map(e =>
    invoke('path_exists', { path: e.path }).catch(() => false)
  ))
  entries.forEach((e, i) => {
    const item = document.createElement('div')
    item.className = 'recent-item' + (flags[i] ? '' : ' disabled')
    item.title = e.path
    item.innerHTML = `<span class="recent-name">${e.name || ''}</span>
                      <span class="recent-path">${e.path}</span>`
    item.addEventListener('click', () => {
      if (!flags[i]) return
      hideRecentDropdown()
      onPick(e)
    })
    container.appendChild(item)
  })
}

async function showRecentDropdown() {
  await Promise.all([
    renderRecentList(recentWsList,    MDV.recents.loadRecentWorkspaces(), pickWorkspace),
    renderRecentList(recentFilesList, MDV.recents.loadRecentFiles(),      pickFile),
  ])
  recentDropdown.classList.remove('hidden')
}
function hideRecentDropdown() { recentDropdown.classList.add('hidden') }

btnRecent.addEventListener('click', e => {
  e.stopPropagation()
  if (recentDropdown.classList.contains('hidden')) showRecentDropdown()
  else hideRecentDropdown()
})

document.addEventListener('click', e => {
  if (recentDropdown.classList.contains('hidden')) return
  if (recentDropdown.contains(e.target) || btnRecent.contains(e.target)) return
  hideRecentDropdown()
})
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !recentDropdown.classList.contains('hidden')) hideRecentDropdown()
})

btnClearRecents.addEventListener('click', () => {
  if (!confirm('Clear all recent workspaces and recent files?')) return
  MDV.recents.clearRecents()
  hideRecentDropdown()
})

// pickers — implementations land in Task 5/6 (workspace/file open helpers)
async function pickWorkspace(entry) {
  // Implemented in Task 5
  if (typeof openWorkspaceByPath === 'function') return openWorkspaceByPath(entry.path)
  console.warn('openWorkspaceByPath not yet wired')
}
async function pickFile(entry) {
  // Open file in current tree if it matches; otherwise just open the file standalone.
  // Implemented properly in Task 5 once openWorkspaceByPath exists.
  await openFile(entry.path, null)
}
```

- [ ] **Step 2: Smoke check**

Reload. Click "Recent ▾".

Expected:
- Dropdown opens, two sections show "(none)" if no recents yet
- Click outside → closes
- Press Esc → closes
- "Clear Recent" → confirm dialog, then dropdown closes (lists already empty so no visible change)

If you have stale recents from the Task 1 manual test, click an item — Recent Files entry should call `openFile` (file-not-found preview is acceptable for `/tmp/a.md`). Workspace clicks log a `console.warn` (intentional — wired in Task 5).

- [ ] **Step 3: Commit**

```bash
git add src/app.js
git commit -m "[mdviewer] Recent dropdown: open/close, render, existence-validate, clear"
```

---

## Task 5: Hook persistence on Open Folder + openFile + tree expand + scroll + link follow

**Files:**
- Modify: `src/app.js`

This is the largest task. Each sub-step is a small edit to an existing handler; commit at the end.

- [ ] **Step 1: Add `openWorkspaceByPath()` helper**

After the existing `btnOpenFolder.addEventListener` block (around line 266-270), add:

```javascript
async function openWorkspaceByPath(rootPath) {
  const tree = await invoke('build_file_tree', { dirPath: rootPath })
  if (!tree) return
  renderFileTree(tree, rootPath)
  MDV.recents.pushRecentWorkspace(rootPath)
  MDV.recents.saveSessionNow({
    workspaceRoot: rootPath,
    activeFile: null,
    scrollTop: 0,
    expandedDirs: []
  })
}
```

- [ ] **Step 2: Refactor `btnOpenFolder` handler to call the helper**

Replace:
```javascript
btnOpenFolder.addEventListener('click', async () => {
  const result = await invoke('open_folder_dialog')
  if (!result) return
  renderFileTree(result.tree, result.rootPath)
})
```
with:
```javascript
btnOpenFolder.addEventListener('click', async () => {
  const result = await invoke('open_folder_dialog')
  if (!result) return
  renderFileTree(result.tree, result.rootPath)
  MDV.recents.pushRecentWorkspace(result.rootPath)
  MDV.recents.saveSessionNow({
    workspaceRoot: result.rootPath,
    activeFile: null,
    scrollTop: 0,
    expandedDirs: []
  })
})
```

- [ ] **Step 3: Save activeFile + scrollTop=0 inside `openFile()` on success**

In `openFile()` (around line 348), at the point where `currentFilePath = filePath` is set (after the read succeeds), add:

```javascript
currentFilePath = filePath
originalMarkdown = content
const name = filePath.split(/[\\/]/).pop()
fileNameText.textContent = name
setWindowTitle(name, filePath)
zoomControls.classList.add('visible')
+
+ MDV.recents.pushRecentFile(filePath)
+ MDV.recents.saveSession({ activeFile: filePath, scrollTop: 0 })

await renderMarkdown(content)
```

(The `+` lines indicate insertions.)

> **Important:** push to recent-files happens ONLY here — i.e., on tree click, drag-drop first file, future CLI arg. NOT in `navigateByLink` or in the `not-found` failure branch.

- [ ] **Step 4: Update activeFile (no push) inside `applyNavEntry()` on cross-file nav**

In `applyNavEntry()` (around line 376):

```javascript
async function applyNavEntry(entry) {
  const previewWrap = document.getElementById('preview-wrap')
  if (entry.path !== currentFilePath) {
    const treeEl = Array.from(fileTree.querySelectorAll('.tree-item[data-path]'))
      .find(el => el.dataset.path === entry.path)
    await openFile(entry.path, treeEl, { resetNav: false })
+   // openFile() above already pushed to recent-files & set session — this is a link follow,
+   // so undo the push (keep recent-files clean of "drive-by" link visits).
+   // Cheapest: re-write recent-files without this path's freshly-bumped timestamp.
+   // Acceptable simplification: skip the undo. Tradeoff: link-followed files appear in recents.
+   // Per spec §7: navigateByLink updates session.activeFile only, NOT recent-files.
+   // We MUST honor that — so guard openFile against pushing when called via navigateByLink.
  }
  ...
}
```

Wait — that's ugly. Cleaner: pass an option to `openFile`.

**Replacement plan:**

(a) Change `openFile` signature to accept `pushRecent` (default true):
```javascript
async function openFile(filePath, treeEl, { resetNav = true, pushRecent = true } = {}) {
```

(b) Wrap the recent-files push inside that flag:
```javascript
if (pushRecent) MDV.recents.pushRecentFile(filePath)
MDV.recents.saveSession({ activeFile: filePath, scrollTop: 0 })
```

(c) In `applyNavEntry`, call openFile with `pushRecent: false` (and keep `resetNav: false`):
```javascript
await openFile(entry.path, treeEl, { resetNav: false, pushRecent: false })
```

Apply (a) (b) (c).

- [ ] **Step 5: Save scrollTop on preview scroll (debounced)**

Add near the other `preview-wrap` references (e.g., near the navigation key handlers):

```javascript
const previewWrapEl = document.getElementById('preview-wrap')
previewWrapEl.addEventListener('scroll', () => {
  MDV.recents.saveSession({ scrollTop: previewWrapEl.scrollTop })
})
```

Note: `saveSession` is already 300ms-debounced inside `recents.js`, so no extra debounce needed.

- [ ] **Step 6: Save expandedDirs on tree directory toggle**

Modify `createTreeNode()`'s directory branch (around line 305-322).

- Add `data-path` to the directory row, normalized to a workspace-relative path with `/` separators. To avoid plumbing the workspace root through, store the **absolute** path on directories too, and at save time compute the relative path against the current workspace root (which is in `MDV.recents.loadSession().workspaceRoot`).

Simpler: pass `rootPath` into `createTreeNode` and compute relative once.

**Implementation:**

(a) Change `renderFileTree(tree, rootPath)` to keep `rootPath` accessible. Store on a module-level variable already? — no, just thread it through:

```javascript
function renderFileTree(tree, rootPath) {
  currentWorkspaceRoot = rootPath  // new module-level var
  ...
}
```

Add at top of app.js near `currentFilePath`:
```javascript
let currentWorkspaceRoot = null
```

(b) In `createTreeNode` directory branch, add `row.dataset.path = node.path` and compute relative on toggle:

```javascript
row.dataset.path = node.path
row.addEventListener('click', () => {
  const collapsed = children.classList.toggle('collapsed')
  row.classList.toggle('open', !collapsed)
  saveExpandedDirs()
})
```

(c) Helper:

```javascript
function saveExpandedDirs() {
  if (!currentWorkspaceRoot) return
  const root = currentWorkspaceRoot
  const expanded = []
  fileTree.querySelectorAll('.tree-dir-row.open').forEach(row => {
    const abs = row.dataset.path
    if (!abs) return
    let rel = abs.startsWith(root) ? abs.slice(root.length) : abs
    rel = rel.replace(/^[\\/]+/, '').replace(/\\/g, '/')
    if (rel) expanded.push(rel)
  })
  MDV.recents.saveSession({ expandedDirs: expanded })
}
```

- [ ] **Step 7: Wire `pickFile` in the dropdown to use `openFile`**

The Task 4 stub already calls `openFile(entry.path, null)`. With the new `pushRecent` default = true, the click correctly bumps recents. No further change needed.

Also wire `pickWorkspace`:
```javascript
async function pickWorkspace(entry) { await openWorkspaceByPath(entry.path) }
```
Replace the warning stub from Task 4.

- [ ] **Step 8: Smoke checks**

Reload. With DevTools open:

1. Click Open Folder → pick a folder with `.md` files.
   - Console: `localStorage.getItem('md-viewer-recent-workspaces')` shows that path.
   - `localStorage.getItem('md-viewer-session')` shows `workspaceRoot` set, `activeFile: null`.

2. Click a `.md` file in tree.
   - `md-viewer-recent-files` includes that path.
   - `md-viewer-session.activeFile` matches.

3. Scroll the preview, wait 1s.
   - `md-viewer-session.scrollTop` is non-zero.

4. Expand a directory in the tree.
   - `md-viewer-session.expandedDirs` shows the relative path.

5. Open the file by clicking, then click an internal link to another `.md`.
   - `md-viewer-session.activeFile` updates to the new file.
   - `md-viewer-recent-files` does **NOT** prepend the link-followed file (still has the click-opened file at the top).

6. Click "Recent ▾" → both lists populated, click an item → opens.

- [ ] **Step 9: Commit**

```bash
git add src/app.js
git commit -m "[mdviewer] persist recents + session on folder/file/scroll/expand/nav"
```

---

## Task 6: Create `session.js` and wire restore at startup

**Files:**
- Create: `src/session.js`
- Modify: `src/index.html`
- Modify: `src/app.js`

- [ ] **Step 1: Create `session.js`**

```javascript
/* ════════════════════════════════════════════════════════
   MD Viewer — session.js
   Startup orchestration: launch-file branch + session restore
   ════════════════════════════════════════════════════════ */
(function () {
  const NS = (window.MDV = window.MDV || {})

  // Placeholder for future CLI arg / file-association integration.
  // Returns the absolute path of a file the app was launched with, or null.
  async function getLaunchFile() {
    return null
  }

  // Called once after themes/zoom apply during DOMContentLoaded.
  // Depends on MDV.app exposing: openWorkspaceByPath, openFile, restoreScroll, expandDirs.
  async function restoreSession() {
    const launchFile = await getLaunchFile()
    if (launchFile) {
      // Future: open the file's parent dir as a temp tree (no workspace save), open file.
      // For now this branch is unreachable.
      return
    }

    const s = MDV.recents.loadSession()
    if (!s.workspaceRoot) return

    const exists = await window.__TAURI__.core.invoke('path_exists', { path: s.workspaceRoot })
    if (!exists) return

    await MDV.app.openWorkspaceByPathRestore(s.workspaceRoot)  // doesn't push to recents, doesn't reset session
    MDV.app.expandDirs(s.expandedDirs || [])

    if (s.activeFile) {
      const fileExists = await window.__TAURI__.core.invoke('path_exists', { path: s.activeFile })
      if (fileExists) {
        await MDV.app.openFileRestore(s.activeFile, s.scrollTop || 0)
      }
    }
  }

  NS.session = { getLaunchFile, restoreSession }
})()
```

- [ ] **Step 2: Add restore-mode helpers in `app.js`**

In `app.js`, after `openWorkspaceByPath`:

```javascript
async function openWorkspaceByPathRestore(rootPath) {
  const tree = await invoke('build_file_tree', { dirPath: rootPath })
  if (!tree) return
  renderFileTree(tree, rootPath)
  // Do NOT push recents (already there) and do NOT reset session.
}

function expandDirs(relPaths) {
  if (!relPaths || !relPaths.length) return
  const wanted = new Set(relPaths)
  fileTree.querySelectorAll('.tree-dir-row').forEach(row => {
    const abs = row.dataset.path
    if (!abs || !currentWorkspaceRoot) return
    let rel = abs.startsWith(currentWorkspaceRoot) ? abs.slice(currentWorkspaceRoot.length) : abs
    rel = rel.replace(/^[\\/]+/, '').replace(/\\/g, '/')
    if (wanted.has(rel)) {
      const children = row.parentElement.querySelector('.tree-dir-children')
      if (children) {
        children.classList.remove('collapsed')
        row.classList.add('open')
      }
    }
  })
}

async function openFileRestore(filePath, scrollTop) {
  await openFile(filePath, null, { pushRecent: false })
  // Apply scroll after render settles
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const pw = document.getElementById('preview-wrap')
      if (pw) pw.scrollTop = scrollTop || 0
    })
  })
}

// Expose for session.js
window.MDV = window.MDV || {}
window.MDV.app = { openWorkspaceByPathRestore, openFileRestore, expandDirs }
```

- [ ] **Step 3: Trigger restore at startup**

At the very bottom of `app.js`, after `applyZoom()` and other init:

```javascript
window.addEventListener('DOMContentLoaded', () => {
  // applyTheme/applyZoom already executed — they're synchronous at script load
  if (MDV.session && MDV.session.restoreSession) {
    MDV.session.restoreSession().catch(err => console.warn('[restore] failed:', err))
  }
})
```

If DOMContentLoaded already fired by the time `app.js` runs (it usually has, since scripts are at end of body), use:

```javascript
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => MDV.session.restoreSession().catch(console.warn))
} else {
  MDV.session.restoreSession().catch(console.warn)
}
```

- [ ] **Step 4: Add `<script src="session.js">` in `index.html`**

Place between `recents.js` and `app.js`:
```html
<script src="recents.js"></script>
<script src="session.js"></script>
<script src="app.js"></script>
```

(Order: recents must define `MDV.recents` first; session defines `MDV.session`; app uses both and exposes `MDV.app`. The DOMContentLoaded handler in app.js calls `MDV.session.restoreSession`.)

- [ ] **Step 5: Smoke check — full restore cycle**

1. Open folder A → open file X → scroll halfway → expand 2 directories.
2. Quit app (close window).
3. Relaunch (`npx tauri dev`).
4. Expected:
   - Same folder A in sidebar
   - Same file X opened
   - Same scroll position (within a few px tolerance)
   - Same 2 directories expanded
5. Now move folder A to another name (rename in shell). Relaunch.
6. Expected: empty screen. Click Recent ▾ → workspace appears greyed (disabled).
7. Rename it back. Relaunch → restores normally.

- [ ] **Step 6: Commit**

```bash
git add src/session.js src/index.html src/app.js
git commit -m "[mdviewer] session.js: auto-restore workspace + file + scroll + tree expand"
```

---

## Task 7: Run the full manual test plan from the spec

**Files:** none (verification only)

- [ ] **Step 1: Spec §12 test 1 — workspace + file + scroll round-trip**

Open folder A → open file X → scroll → relaunch → A/X/scroll restored.

- [ ] **Step 2: Spec §12 test 2 — workspace switch / LRU**

Switch to folder B → relaunch → B restored. Recent Workspaces dropdown: B at top, A below.

- [ ] **Step 3: Spec §12 test 3 — tree expand restore**

Expand 2-3 directories → relaunch → same expand state.

- [ ] **Step 4: Spec §12 test 4 — recent-files cap**

In DevTools, push 21 distinct file paths via `MDV.recents.pushRecentFile('/tmp/N.md')` (loop). Confirm `MDV.recents.loadRecentFiles().length === 20` and the first-pushed entry is dropped.

- [ ] **Step 5: Spec §12 test 5 — missing workspace**

Move workspace dir aside → relaunch → empty screen. Recent ▾ → entry greyed. Restore dir → relaunch → normal.

- [ ] **Step 6: Spec §12 test 6 — multi-file D&D**

Drag 3 `.md` files from different dirs into the window. Confirm: no new entry in Recent Workspaces; the first file appears in Recent Files (it was auto-clicked by existing `firstItem.click()` logic).

- [ ] **Step 7: Spec §12 test 7 — Clear Recent**

Click Recent ▾ → Clear Recent → confirm. Both sections show "(none)". Current screen unchanged.

- [ ] **Step 8: Spec §12 test 8 — themes**

Toggle dark/light via existing button. Open Recent ▾. Confirm legibility in both.

- [ ] **Step 9: Final commit if any nit-fixes were needed**

```bash
git status
# if any pending fixes:
git add -A
git commit -m "[mdviewer] recents: manual-test fixes"
```

- [ ] **Step 10: Push branch (per global rule: published branches push too — this is a new branch, push it)**

```bash
git push -u origin feat/mdviewer-recents
```

---

## Notes for the implementer

- **DRY:** `openWorkspaceByPath` (recents-bumping) and `openWorkspaceByPathRestore` (silent) share the `build_file_tree` + `renderFileTree` core. Resist adding a third path; instead refactor to a private `_buildAndRender(rootPath)` helper if both call sites grow.
- **YAGNI:** Do not add pinning, search, or per-workspace recent-files filtering. Spec §14 explicitly defers them.
- **Frequent commits:** every numbered Task above ends with one commit. Don't squash into one.
- **No bundler:** these scripts are loaded as classic `<script>`s. Don't introduce `import`/`export` syntax. Use the `window.MDV` namespace.
- **No tests framework available:** verification is manual per Step "Smoke check". If the implementer has time/inclination, adding a basic Vitest setup is out-of-scope for this plan.
- **Subagent dispatch:** every task subagent runs with `model: "sonnet"`. The orchestrator on Opus reviews after each task.
