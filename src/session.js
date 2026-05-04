/* ════════════════════════════════════════════════════════
   MD Viewer — session.js
   Startup orchestration: launch-file branch + session restore
   Persists pinned tabs across restarts (preview tabs are volatile).
   ════════════════════════════════════════════════════════ */
(function () {
  const NS = (window.MDV = window.MDV || {})

  // True while restoreSession is replaying tabs from storage.
  // The 'change' listener installed below ignores events during that window
  // so we don't write back partial states. Cleared in finally{} so EVERY
  // exit path (early return, error, no-tabs, no-workspace) re-enables saves.
  let restoring = true

  // Snapshot only what's persistable: pinned tabs (path + scrollTop) and
  // the active pinned tab. If active is a preview, fall back to the most
  // recently active pinned tab (last in pinned list) so reload still lands
  // on something reasonable.
  function snapshotTabs() {
    const all = MDV.tabs.list()
    const tabs = all
      .filter(t => t.pinned)
      .map(t => ({ path: t.path, scrollTop: t.scrollTop || 0 }))
    const cur = MDV.tabs.active()
    let activeTabPath = null
    if (cur) {
      if (cur.pinned) activeTabPath = cur.path
      else {
        const pinned = all.filter(t => t.pinned)
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

  // Returns the absolute path of a file the app was launched with (CLI argv or
  // macOS file-association), or null. Drains one entry from the Rust-side queue.
  async function getLaunchFile() {
    try {
      return await window.__TAURI__.core.invoke('take_launch_file')
    } catch (e) {
      console.warn('[launch] take_launch_file failed:', e)
      return null
    }
  }

  // Open a launch-supplied .md: load its parent dir as the workspace tree
  // (no recents push beyond what openWorkspaceByPath already does) and pin
  // a tab for the file. Best-effort — falls back to just opening the tab.
  async function openLaunchFile(filePath) {
    const parent = filePath.replace(/[\\/][^\\/]+$/, '')
    if (parent && parent !== filePath) {
      try { await MDV.app.openWorkspaceByPath(parent) }
      catch (e) { console.warn('[launch] open parent workspace failed:', e) }
    }
    const t = await MDV.tabs.open(filePath, { pinned: true })
    if (t) await MDV.tabs.activate(t.id)
  }

  // Called once after themes/zoom apply during DOMContentLoaded.
  // Depends on MDV.app exposing: openWorkspaceByPathRestore, expandDirs.
  async function restoreSession() {
    try {
      const launchFile = await getLaunchFile()
      if (launchFile) {
        await openLaunchFile(launchFile)
        return
      }

      const s = MDV.recents.loadSession()
      const invoke = window.__TAURI__.core.invoke

      // Restore workspace tree if a workspace is recorded and still exists.
      // Independent of file restore: a session may have tabs without a workspaceRoot
      // (e.g. user opened a file via drag-and-drop without ever using Open Folder).
      if (s.workspaceRoot) {
        const wsExists = await invoke('path_exists', { path: s.workspaceRoot })
        if (wsExists) {
          await MDV.app.openWorkspaceByPathRestore(s.workspaceRoot)
          MDV.app.expandDirs(s.expandedDirs || [])
        }
      }

      // New schema: restore pinned tabs.
      if (Array.isArray(s.tabs) && s.tabs.length) {
        for (const entry of s.tabs) {
          if (!entry || !entry.path) continue
          const exists = await invoke('path_exists', { path: entry.path })
          if (!exists) continue
          const t = await MDV.tabs.open(entry.path, { pinned: true })
          if (t) t.scrollTop = entry.scrollTop || 0
        }
        if (s.activeTabPath) {
          const cur = MDV.tabs.list().find(t => t.path === s.activeTabPath)
          if (cur) await MDV.tabs.activate(cur.id)
        }
        return
      }

      // Legacy migration: only activeFile present in session → one pinned tab.
      if (s.activeFile) {
        const fileExists = await invoke('path_exists', { path: s.activeFile })
        if (fileExists) {
          const t = await MDV.tabs.open(s.activeFile, { pinned: true })
          if (t) {
            t.scrollTop = s.scrollTop || 0
            await MDV.tabs.activate(t.id)
          }
        }
      }
    } finally {
      restoring = false
      // Flush one canonical save synchronously so storage matches the restored
      // in-memory state. Using saveSessionNow (instead of the 500ms debounced
      // scheduleSave) closes the race against renderPath's 300ms debounced
      // saveSession({activeFile}) writes, which could otherwise land after
      // restoring=false and leave a partial/stale activeFile. Also clear the
      // pending debounce timer to prevent a duplicate write.
      clearTimeout(saveTimer)
      MDV.recents.saveSessionNow(snapshotTabs())
    }
  }

  // Subscribe in the SAME IIFE scope so writes to `restoring` are visible here.
  if (MDV.tabs && MDV.tabs.on) {
    MDV.tabs.on('change', () => {
      if (restoring) return
      scheduleSave()
    })
  }

  // Live file-association opens after startup (macOS NSApplication openFiles fired
  // post-launch, e.g. user double-clicks another .md while MDViewer is already running).
  // Drain the same Rust-side queue rather than relying on the event payload so we avoid
  // re-opening files already consumed by the startup branch.
  if (window.__TAURI__ && window.__TAURI__.event && window.__TAURI__.event.listen) {
    window.__TAURI__.event.listen('launch-file', async () => {
      while (true) {
        const p = await getLaunchFile()
        if (!p) break
        try { await openLaunchFile(p) }
        catch (e) { console.warn('[launch] live open failed:', e) }
      }
    }).catch(e => console.warn('[launch] listen failed:', e))
  }

  NS.session = { getLaunchFile, restoreSession }
})()
