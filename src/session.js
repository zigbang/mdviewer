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
  // Depends on MDV.app exposing: openWorkspaceByPathRestore, openFileRestore, expandDirs.
  async function restoreSession() {
    const launchFile = await getLaunchFile()
    if (launchFile) {
      // Future: open the file's parent dir as a temp tree (no workspace save), open file.
      // For now this branch is unreachable.
      return
    }

    const s = MDV.recents.loadSession()
    const invoke = window.__TAURI__.core.invoke

    // Restore workspace tree if a workspace is recorded and still exists.
    // Independent of file restore: a session may have an activeFile without a workspaceRoot
    // (e.g. user opened a file via drag-and-drop without ever using Open Folder).
    if (s.workspaceRoot) {
      const wsExists = await invoke('path_exists', { path: s.workspaceRoot })
      if (wsExists) {
        await MDV.app.openWorkspaceByPathRestore(s.workspaceRoot)
        MDV.app.expandDirs(s.expandedDirs || [])
      }
    }

    // Restore active file independently — works even when no workspace is recorded.
    if (s.activeFile) {
      const fileExists = await invoke('path_exists', { path: s.activeFile })
      if (fileExists) {
        await MDV.app.openFileRestore(s.activeFile, s.scrollTop || 0)
      }
    }
  }

  NS.session = { getLaunchFile, restoreSession }
})()
