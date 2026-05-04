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
  function basename(path) { return path.split(/[\\/]/).pop() }
  function defaultFind() {
    return { visible: false, query: '', sourceMode: 'rendered', caseSensitive: false, currentIndex: -1 }
  }

  function on(ev, fn) {
    if (!listeners[ev]) throw new Error(`tabs.on: unknown event '${ev}'`)
    listeners[ev].push(fn)
  }

  function emit(ev) {
    if (!listeners[ev]) return
    listeners[ev].forEach(fn => { try { fn() } catch (e) { console.warn(e) } })
  }

  // ── State accessors ──────────────────────────────────────
  function list()   { return state.tabs.slice() }
  function active() { return state.tabs.find(t => t.id === state.activeId) || null }

  // ── open() ───────────────────────────────────────────────
  async function open(path, { pinned = false } = {}) {
    // Uniqueness: existing tab wins.
    const existing = state.tabs.find(t => t.path === path)
    if (existing) {
      if (pinned) existing.pinned = true
      await activate(existing.id)
      return existing
    }

    // Replace-in-place if a preview tab exists and new request is preview.
    const previewIdx = state.tabs.findIndex(t => !t.pinned)
    if (!pinned && previewIdx >= 0) {
      const t = state.tabs[previewIdx]
      // Capture current scrollTop into the outgoing history entry before navigating.
      const pw = document.getElementById('preview-wrap')
      if (pw) t.history[t.historyIdx].scrollTop = pw.scrollTop
      // Truncate any forward stack, then push the new path.
      t.history = t.history.slice(0, t.historyIdx + 1)
      t.history.push({ path, scrollTop: 0 })
      t.historyIdx = t.history.length - 1
      t.path = path
      t.title = basename(path)
      t.scrollTop = 0
      t.find = defaultFind()
      t.loadedMtime = null
      t.externalDirty = false
      t.changedWhilePromptOpen = false
      t.reloadPromptDismissed = false
      invalidate(t)
      await activate(t.id)
      return t
    }

    // Otherwise insert a new tab to the right of the active tab (or at end).
    const tab = {
      id: uid(),
      path,
      title: basename(path),
      pinned,
      scrollTop: 0,
      history: [{ path, scrollTop: 0 }],
      historyIdx: 0,
      renderedHTML: null,
      find: defaultFind(),
      loadedMtime: null,
      externalDirty: false,
      changedWhilePromptOpen: false,
      reloadPromptDismissed: false
    }
    const insertAt = state.activeId
      ? state.tabs.findIndex(t => t.id === state.activeId) + 1
      : state.tabs.length
    state.tabs.splice(insertAt, 0, tab)
    await activate(tab.id)
    return tab
  }

  // ── activate() ──────────────────────────────────────────
  async function activate(id) {
    const tab = state.tabs.find(t => t.id === id)
    if (!tab) return
    // Save outgoing scroll
    const prev = active()
    const pw = document.getElementById('preview-wrap')
    if (prev && prev.id !== id && pw) prev.scrollTop = pw.scrollTop

    state.activeId = id
    await render(tab)
    if (pw) pw.scrollTop = tab.scrollTop || 0
    emit('activate'); emit('change')
  }

  // ── LRU cache helpers ────────────────────────────────────
  const lruOrder = []

  function bumpLru(id) {
    const i = lruOrder.indexOf(id); if (i >= 0) lruOrder.splice(i, 1)
    lruOrder.push(id)
  }

  function evictLru() {
    while (lruOrder.length > RENDER_CACHE_MAX) {
      const id = lruOrder.shift()
      const t = state.tabs.find(x => x.id === id)
      if (t) { t.renderedHTML = null; t.originalMarkdown = null }
    }
  }

  function invalidate(t) {
    t.renderedHTML = null
    t.originalMarkdown = null
    const i = lruOrder.indexOf(t.id); if (i >= 0) lruOrder.splice(i, 1)
  }

  // ── render() ────────────────────────────────────────────
  async function render(tab) {
    const preview      = document.getElementById('preview')
    const previewEmpty = document.getElementById('preview-empty')

    // Cache hit
    if (tab.renderedHTML != null) {
      previewEmpty.classList.add('hidden')
      preview.style.display = 'block'
      preview.innerHTML = tab.renderedHTML
      bumpLru(tab.id)
      MDV.app.adoptRenderedTab(tab.path, tab.originalMarkdown)  // sync app-level state from cached source
      return
    }

    // Cache miss → show empty/loading placeholder while we render
    preview.innerHTML = ''
    preview.style.display = 'none'
    previewEmpty.classList.remove('hidden')

    const result = await MDV.app.renderPath(tab.path)
    if (!result.ok) {
      tab.missing = true
      MDV.app.showError(tab.path)
      emit('change')
      return
    }
    tab.missing = false
    if (MDV.app && MDV.app.clearFindHighlights) MDV.app.clearFindHighlights()
    tab.renderedHTML = preview.innerHTML
    tab.originalMarkdown = MDV.app.getOriginalMarkdown()
    tab.loadedMtime = result.modifiedMs || null
    tab.externalDirty = false
    tab.changedWhilePromptOpen = false
    tab.reloadPromptDismissed = false
    bumpLru(tab.id)
    evictLru()
    emit('change')
  }

  // ── Tab-bar rendering ────────────────────────────────────
  const bar = () => document.getElementById('tab-bar')

  on('change', renderBar)

  function renderBar() {
    const el = bar(); if (!el) return
    const titles = computeDisambiguatedTitles(state.tabs)
    el.innerHTML = ''
    state.tabs.forEach((t, i) => {
      const div = document.createElement('div')
      div.className = 'tab' + (t.id === state.activeId ? ' active' : '') + (t.pinned ? '' : ' preview') + (t.missing ? ' missing' : '') + (t.externalDirty ? ' dirty' : '')
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
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  }

  // ── Tab-bar event delegation ─────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    const el = bar(); if (!el) return
    // draggable=true on .tab makes the native dblclick event unreliable in
    // WebKit/Chromium, so detect double-click manually via timestamp + last-id.
    let lastClickTs = 0
    let lastClickId = null
    const DBL_MS = 400
    el.addEventListener('click', e => {
      const closeBtn = e.target.closest('.tab-close')
      const tabEl = e.target.closest('.tab')
      if (!tabEl) return
      if (closeBtn) { close(tabEl.dataset.id); return }
      const id = tabEl.dataset.id
      const now = Date.now()
      if (lastClickId === id && now - lastClickTs < DBL_MS) {
        promote(id)
        lastClickTs = 0; lastClickId = null
        return
      }
      lastClickTs = now; lastClickId = id
      activate(id)
    })
    el.addEventListener('mousedown', e => {
      if (e.button !== 1) return  // middle-click only
      const tabEl = e.target.closest('.tab'); if (!tabEl) return
      e.preventDefault(); close(tabEl.dataset.id)
    })
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
      if (target && target.dataset.id === dragId) { dragId = null; return }
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
  })

  // ── promote / close / reorder ────────────────────────────
  function promote(id) {
    const t = state.tabs.find(x => x.id === id); if (!t || t.pinned) return
    t.pinned = true; emit('change')
  }

  function close(id) {
    const idx = state.tabs.findIndex(t => t.id === id); if (idx < 0) return
    const wasActive = state.tabs[idx].id === state.activeId
    state.tabs.splice(idx, 1)
    const lru = lruOrder.indexOf(id); if (lru >= 0) lruOrder.splice(lru, 1)
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
    MDV.app.showEmpty()
    emit('change')
  }

  function reorder(id, newIndex) {
    const idx = state.tabs.findIndex(t => t.id === id); if (idx < 0) return
    const [t] = state.tabs.splice(idx, 1)
    state.tabs.splice(Math.max(0, Math.min(state.tabs.length, newIndex)), 0, t)
    emit('change')
  }

  // ── openFromLink() ──────────────────────────────────────
  async function openFromLink(targetPath) {
    // Uniqueness: if target is already open, jump to it.
    const existing = state.tabs.find(t => t.path === targetPath)
    if (existing) {
      await activate(existing.id)
      return
    }
    // If active tab is a preview, promote it to pinned first.
    const cur = active()
    if (cur && !cur.pinned) {
      cur.pinned = true
      emit('change')
    }
    // Open target as a new preview tab to the right.
    await open(targetPath, { pinned: false })
  }

  // ── Per-tab nav history ──────────────────────────────────
  function pushHistoryForActive(targetPath) {
    const t = active(); if (!t) return
    t.history = t.history.slice(0, t.historyIdx + 1)
    t.history.push({ path: targetPath, scrollTop: 0 })
    t.historyIdx = t.history.length - 1
  }

  // ── Per-tab find state ───────────────────────────────────
  function getFindState() {
    const t = active()
    return Object.assign(defaultFind(), t && t.find ? t.find : {})
  }

  function setFindState(partial) {
    const t = active(); if (!t) return null
    t.find = Object.assign(defaultFind(), t.find || {}, partial || {})
    emit('change')
    return t.find
  }

  function resetFindState() {
    const t = active(); if (!t) return null
    t.find = defaultFind()
    emit('change')
    return t.find
  }

  function setExternalState(id, partial) {
    const t = state.tabs.find(x => x.id === id); if (!t) return null
    Object.assign(t, partial || {})
    emit('change')
    return t
  }

  async function navBack() {
    const t = active(); if (!t || t.historyIdx <= 0) return false
    // Capture current scrollTop into the outgoing history entry.
    const pw = document.getElementById('preview-wrap')
    if (pw) t.history[t.historyIdx].scrollTop = pw.scrollTop
    t.historyIdx--
    const entry = t.history[t.historyIdx]
    t.path = entry.path; t.title = basename(entry.path); t.scrollTop = entry.scrollTop
    t.find = defaultFind()
    invalidate(t)
    await render(t); emit('activate'); emit('change')
    return true
  }

  async function navForward() {
    const t = active(); if (!t || t.historyIdx >= t.history.length - 1) return false
    // Capture current scrollTop into the outgoing history entry.
    const pw = document.getElementById('preview-wrap')
    if (pw) t.history[t.historyIdx].scrollTop = pw.scrollTop
    t.historyIdx++
    const entry = t.history[t.historyIdx]
    t.path = entry.path; t.title = basename(entry.path); t.scrollTop = entry.scrollTop
    t.find = defaultFind()
    invalidate(t)
    await render(t); emit('activate'); emit('change')
    return true
  }

  NS.tabs = { list, active, open, promote, close, activate, reorder,
              pushHistory: pushHistoryForActive, navBack, navForward, on,
              openFromLink, getFindState, setFindState, resetFindState,
              setExternalState }
})()
