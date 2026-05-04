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

  // Reads from localStorage — does NOT reflect uncommitted writes still in the 300ms debounce buffer.
  // For mid-session "current truth", a caller would need direct access to the in-memory _sessionCache (private).
  // Used by session.js at startup, when _sessionCache is null and storage IS the truth.
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
