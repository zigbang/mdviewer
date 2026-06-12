/* ════════════════════════════════════════════════════════
   MD Viewer — app.js (Tauri v2)
   ════════════════════════════════════════════════════════ */

// ── Tauri API ────────────────────────────────────────────
const { invoke } = window.__TAURI__.core
const { getCurrentWindow } = window.__TAURI__.window

// ── mermaid 초기화 ────────────────────────────────────────
function initMermaid(isDark) {
  mermaid.initialize({
    startOnLoad: false,
    theme: isDark ? 'dark' : 'default',
    darkMode: isDark,
    fontFamily: "'Segoe UI', 'Apple SD Gothic Neo', sans-serif",
    flowchart:  { htmlLabels: true, curve: 'basis' },
    sequence:   { useMaxWidth: true },
    gantt:      { useMaxWidth: true }
  })
}
initMermaid(true)

// ── marked 설정 ──────────────────────────────────────────
marked.use({
  breaks: true,
  gfm: true,
  renderer: {
    code(code, lang) {
      if (lang === 'mermaid') {
        return `<div class="mermaid">${code}</div>`
      }
      const highlighted = lang && hljs.getLanguage(lang)
        ? hljs.highlight(code, { language: lang }).value
        : hljs.highlightAuto(code).value
      return `<pre><code class="hljs language-${lang || ''}">${highlighted}</code></pre>`
    }
  }
})

// ── 상태 ─────────────────────────────────────────────────
let currentFilePath     = null
let currentWorkspaceRoot = null
let sidebarVisible      = true
let tocVisible          = true
let currentWorkspaceTree = null
let fileSearchActive    = false
let fileSearchEnabled   = true
let fileSearchSavedExpandedDirs = null
let activeFindMarks     = []
let activeSourceTotal   = 0

// ── DOM 레퍼런스 ─────────────────────────────────────────
const sidebar         = document.getElementById('sidebar')
const tocPanel        = document.getElementById('toc-panel')
const fileTree        = document.getElementById('file-tree')
const sidebarRootName = document.getElementById('sidebar-root-name')
const preview         = document.getElementById('preview')
const previewEmpty    = document.getElementById('preview-empty')
const tocList         = document.getElementById('toc-list')
const fileNameText    = document.getElementById('file-name-text')
const btnToggleSidebar= document.getElementById('btn-toggle-sidebar')
const btnToggleToc    = document.getElementById('btn-toggle-toc')
const btnOpenFolder   = document.getElementById('btn-open-folder')
const zoomControls    = document.getElementById('zoom-controls')
const zoomLevelEl     = document.getElementById('zoom-level')
const btnZoomIn       = document.getElementById('btn-zoom-in')
const btnZoomOut      = document.getElementById('btn-zoom-out')
const btnFileSearch   = document.getElementById('btn-file-search')
const fileSearchPanel = document.getElementById('file-search-panel')
const fileSearchInput = document.getElementById('file-search-input')
const btnFileSearchClear = document.getElementById('btn-file-search-clear')
const fileSearchRegex = document.getElementById('file-search-regex')
const fileSearchStatus = document.getElementById('file-search-status')
const btnViewerFind   = document.getElementById('btn-viewer-find')
const viewerFindBar   = document.getElementById('viewer-find-bar')
const viewerFindInput = document.getElementById('viewer-find-input')
const viewerFindCount = document.getElementById('viewer-find-count')
const viewerFindPrev  = document.getElementById('viewer-find-prev')
const viewerFindNext  = document.getElementById('viewer-find-next')
const viewerFindMarkdown = document.getElementById('viewer-find-markdown')
const viewerFindCase  = document.getElementById('viewer-find-case')
const viewerFindClose = document.getElementById('viewer-find-close')
const reloadOverlay   = document.getElementById('reload-overlay')
const reloadMessage   = document.getElementById('reload-message')
const reloadNote      = document.getElementById('reload-note')
const reloadCancel    = document.getElementById('reload-cancel')
const reloadOk        = document.getElementById('reload-ok')

// ── 로고 클릭 → 외부 브라우저 ────────────────────────────
document.getElementById('toolbar-logo').addEventListener('click', () => {
  invoke('open_external', { url: 'https://smarthome.zigbang.com/' })
})

// ── 윈도우 타이틀 업데이트 ────────────────────────────────
function setWindowTitle(displayName, filePath) {
  const title = filePath ? `${displayName} - MD Viewer - ${filePath}` : 'MD Viewer'
  getCurrentWindow().setTitle(title)
}

// ── 리프레시 ────────────────────────────────────────────
async function refreshFile() {
  const t = MDV.tabs.active(); if (!t) return
  t.renderedHTML = null
  t.missing = false
  await MDV.tabs.activate(t.id)
}
document.getElementById('btn-refresh').addEventListener('click', refreshFile)

// ── 인쇄 ────────────────────────────────────────────────
function printCurrent() {
  if (!MDV.tabs.active()) return
  window.print()
}
document.getElementById('btn-print').addEventListener('click', printCurrent)

// ── 전체 화면 ───────────────────────────────────────────
document.getElementById('btn-fullscreen').addEventListener('click', () => {
  invoke('toggle_fullscreen')
})

// ── About 모달 ──────────────────────────────────────────
const aboutOverlay = document.getElementById('about-overlay')
// 버전은 빌드 타임에 tauri.conf.json 값이 바이너리에 박히고, 여기서 런타임에 읽어 표시
window.__TAURI__.app.getVersion()
  .then((v) => { document.getElementById('about-version').textContent = `MD Viewer v${v}` })
  .catch(() => {})
document.getElementById('btn-about').addEventListener('click', () => {
  aboutOverlay.classList.add('visible')
})
document.getElementById('about-close').addEventListener('click', () => {
  aboutOverlay.classList.remove('visible')
})
aboutOverlay.addEventListener('click', (e) => {
  if (e.target === aboutOverlay) aboutOverlay.classList.remove('visible')
})

// ── 번역 ────────────────────────────────────────────────
const translateOverlay = document.getElementById('translate-overlay')
const translateToken   = document.getElementById('translate-token')
const translateLang    = document.getElementById('translate-lang')
const translateStatus  = document.getElementById('translate-status')
let originalMarkdown   = null

const savedToken = localStorage.getItem('md-viewer-claude-token')
if (savedToken) translateToken.value = savedToken

document.getElementById('btn-translate').addEventListener('click', () => {
  if (!currentFilePath) return
  translateStatus.textContent = ''
  translateStatus.className = ''
  translateOverlay.classList.add('visible')
})

document.getElementById('translate-cancel').addEventListener('click', () => {
  translateOverlay.classList.remove('visible')
})
translateOverlay.addEventListener('click', (e) => {
  if (e.target === translateOverlay) translateOverlay.classList.remove('visible')
})

document.getElementById('translate-ok').addEventListener('click', async () => {
  const token = translateToken.value.trim()
  if (!token) {
    translateStatus.textContent = 'Please enter API Token'
    translateStatus.className = 'error'
    return
  }
  if (!originalMarkdown) {
    translateStatus.textContent = 'Please open a file first'
    translateStatus.className = 'error'
    return
  }

  localStorage.setItem('md-viewer-claude-token', token)

  translateStatus.textContent = 'Translating...'
  translateStatus.className = ''
  document.getElementById('translate-ok').disabled = true

  try {
    const translated = await invoke('translate_markdown', {
      markdown: originalMarkdown,
      targetLang: translateLang.value,
      apiToken: token
    })
    translateOverlay.classList.remove('visible')

    const name = currentFilePath.split(/[\\/]/).pop()
    fileNameText.textContent = name + ' (Translated)'
    setWindowTitle(name + ' (Translated)', currentFilePath)
    renderMarkdown(translated).then(() => runFindForActiveTab({ preserveIndex: true }))
  } catch (err) {
    translateStatus.textContent = err
    translateStatus.className = 'error'
  } finally {
    document.getElementById('translate-ok').disabled = false
  }
})

// ── 테마 토글 ───────────────────────────────────────────
const btnTheme    = document.getElementById('btn-theme')
const iconSun     = document.getElementById('theme-icon-sun')
const iconMoon    = document.getElementById('theme-icon-moon')

function applyTheme(theme, rerender) {
  document.documentElement.setAttribute('data-theme', theme)
  iconSun.style.display  = theme === 'dark'  ? 'none' : 'block'
  iconMoon.style.display = theme === 'dark'  ? 'block' : 'none'
  localStorage.setItem('md-viewer-theme', theme)
  initMermaid(theme === 'dark')
  if (rerender && originalMarkdown) {
    renderMarkdown(originalMarkdown).then(() => runFindForActiveTab({ preserveIndex: true }))
  }
}

btnTheme.addEventListener('click', () => {
  const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light'
  applyTheme(next, true)
})

applyTheme(localStorage.getItem('md-viewer-theme') || 'dark')

// ── 줌 (컨텐츠 영역만) ──────────────────────────────────
let zoomPercent = 100

function applyZoom() {
  preview.style.zoom = (zoomPercent / 100).toString()
  zoomLevelEl.textContent = zoomPercent + '%'
  localStorage.setItem('md-viewer-zoom', zoomPercent)
}

function doZoomIn()    { zoomPercent = Math.min(200, zoomPercent + 10); applyZoom() }
function doZoomOut()   { zoomPercent = Math.max(50, zoomPercent - 10);  applyZoom() }
function doZoomReset() { zoomPercent = 100; applyZoom() }

btnZoomIn.addEventListener('click', doZoomIn)
btnZoomOut.addEventListener('click', doZoomOut)
zoomLevelEl.addEventListener('click', doZoomReset)

applyZoom()

// ── 토글 ─────────────────────────────────────────────────
btnToggleSidebar.addEventListener('click', () => {
  sidebarVisible = !sidebarVisible
  sidebar.classList.toggle('hidden', !sidebarVisible)
  document.getElementById('resize-sidebar').classList.toggle('hidden', !sidebarVisible)
})

btnToggleToc.addEventListener('click', () => {
  tocVisible = !tocVisible
  tocPanel.classList.toggle('hidden', !tocVisible)
  document.getElementById('resize-toc').classList.toggle('hidden', !tocVisible)
})

function isEditableTarget(target) {
  if (!target) return false
  const tag = target.tagName ? target.tagName.toLowerCase() : ''
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable
}

// 단축키
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
    e.preventDefault()
    openViewerFindBar()
    return
  }
  const editing = isEditableTarget(e.target)
  if (editing && !e.altKey) return

  if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
    e.preventDefault()
    btnToggleSidebar.click()
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 't') {
    e.preventDefault()
    btnToggleToc.click()
  }
  if ((e.ctrlKey || e.metaKey) && e.key === '+') {
    e.preventDefault()
    doZoomIn()
  }
  if ((e.ctrlKey || e.metaKey) && e.key === '-') {
    e.preventDefault()
    doZoomOut()
  }
  if ((e.ctrlKey || e.metaKey) && (e.key === '0' || e.key === '=')) {
    e.preventDefault()
    doZoomReset()
  }
  if (e.key === 'F11') {
    e.preventDefault()
    invoke('toggle_fullscreen')
  }
  if (e.key === 'F5') {
    e.preventDefault()
    refreshFile()
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
    e.preventDefault()
    printCurrent()
  }
  // 네비게이션 back/forward
  if (e.altKey && e.key === 'ArrowLeft')  { e.preventDefault(); MDV.tabs.navBack().catch(err => console.warn(err)) }
  if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); MDV.tabs.navForward().catch(err => console.warn(err)) }
  // Tabs: Ctrl+W close, Ctrl+Tab cycle, Ctrl+1..9 jump
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'w') {
    e.preventDefault()
    const t = MDV.tabs.active(); if (t) MDV.tabs.close(t.id)
  }
  if (e.ctrlKey && e.key === 'Tab') {
    e.preventDefault()
    const tabs = MDV.tabs.list()
    if (tabs.length) {
      const cur = MDV.tabs.active()
      const i = cur ? tabs.findIndex(t => t.id === cur.id) : 0
      const next = e.shiftKey ? (i - 1 + tabs.length) % tabs.length
                              : (i + 1) % tabs.length
      MDV.tabs.activate(tabs[next].id)
    }
  }
  if ((e.ctrlKey || e.metaKey) && /^[1-9]$/.test(e.key)) {
    e.preventDefault()
    const tabs = MDV.tabs.list()
    const idx = e.key === '9' ? tabs.length - 1 : parseInt(e.key, 10) - 1
    if (tabs[idx]) MDV.tabs.activate(tabs[idx].id)
  }
  // Page Up / Page Down / Home / End → 미리보기 스크롤
  const pw = document.getElementById('preview-wrap')
  if (e.key === 'PageDown')  { e.preventDefault(); pw.scrollBy(0, pw.clientHeight * 0.85) }
  if (e.key === 'PageUp')    { e.preventDefault(); pw.scrollBy(0, -pw.clientHeight * 0.85) }
  if (e.key === 'Home')      { e.preventDefault(); pw.scrollTo(0, 0) }
  if (e.key === 'End')       { e.preventDefault(); pw.scrollTo(0, pw.scrollHeight) }
})

// ── 미리보기 스크롤 세션 저장 ────────────────────────────
const previewWrapEl = document.getElementById('preview-wrap')
previewWrapEl.addEventListener('scroll', () => {
  const t = MDV.tabs.active()
  if (t) t.scrollTop = previewWrapEl.scrollTop
})

// ── 폴더 열기 ────────────────────────────────────────────
async function openWorkspaceByPath(rootPath, prebuiltTree) {
  const tree = prebuiltTree != null ? prebuiltTree : await invoke('build_file_tree', { dirPath: rootPath })
  if (!tree) return
  clearFileSearch({ closePanel: false, resetEnabled: false })
  setFileSearchEnabled(true)
  renderFileTree(tree, rootPath)
  MDV.recents.pushRecentWorkspace(rootPath)
  // saveSessionNow cancels any in-flight debounced saveSession (e.g. stale expandedDirs from old workspace).
  MDV.recents.saveSessionNow({
    workspaceRoot: rootPath,
    activeFile: null,
    scrollTop: 0,
    expandedDirs: []
  })
}

async function openWorkspaceByPathRestore(rootPath) {
  const tree = await invoke('build_file_tree', { dirPath: rootPath })
  if (!tree) return
  clearFileSearch({ closePanel: false, resetEnabled: false })
  setFileSearchEnabled(true)
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

/**
 * Read + render a markdown file into the current #preview.
 * Also syncs app-level UI: window title, file-name label, zoom controls,
 * file-tree highlight, recents push. Tab state stays the caller's job.
 * Returns { ok, errorHtml? }.
 */
async function renderPath(filePath, { pushRecent = true } = {}) {
  try {
    const content = await invoke('read_file', { filePath })
    const modifiedMs = await invoke('file_modified_ms', { filePath }).catch(() => null)
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
    return { ok: true, modifiedMs }
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

// ── Empty / error state helpers (called by tabs.js) ─────────
function showEmpty() {
  clearFindHighlights()
  activeSourceTotal = 0
  preview.style.display = 'none'
  preview.innerHTML = ''
  previewEmpty.classList.remove('hidden')
  fileNameText.textContent = ''
  setWindowTitle('MD Viewer', null)
}

function showError(filePath) {
  clearFindHighlights()
  activeSourceTotal = 0
  previewEmpty.classList.add('hidden')
  preview.style.display = 'block'
  preview.innerHTML = `<div style="padding:40px;color:var(--text-dim);text-align:center">
      <p style="font-size:32px;margin-bottom:16px">📄</p>
      <p>File not found</p>
      <p style="font-size:12px;margin-top:8px;opacity:0.6">${filePath}</p></div>`
}

function adoptRenderedTab(filePath, markdownSource) {
  clearFindHighlights()
  currentFilePath = filePath
  originalMarkdown = markdownSource
  const name = filePath.split(/[\\/]/).pop()
  fileNameText.textContent = name
  setWindowTitle(name, filePath)
  zoomControls.classList.add('visible')
  document.querySelectorAll('.tree-item.active').forEach(e => e.classList.remove('active'))
  const treeEl = fileTree.querySelector(`.tree-item[data-path="${CSS.escape(filePath)}"]`)
  if (treeEl) treeEl.classList.add('active')
  buildToc()
}

// ── 현재 탭 텍스트 찾기 ──────────────────────────────────
function openViewerFindBar() {
  if (MDV.tabs.setFindState) MDV.tabs.setFindState({ visible: true })
  viewerFindBar.classList.remove('hidden')
  syncFindBarFromActiveTab()
  viewerFindInput.focus()
  viewerFindInput.select()
  runFindForActiveTab({ preserveIndex: true })
}

function closeViewerFindBar({ clearCurrent = true } = {}) {
  if (MDV.tabs.setFindState) MDV.tabs.setFindState({ visible: false })
  viewerFindBar.classList.add('hidden')
  clearFindHighlights()
  activeSourceTotal = 0
  if (clearCurrent) {
    activeFindMarks.forEach(mark => mark.classList.remove('current'))
  }
  updateFindCount()
}

function syncFindBarFromActiveTab() {
  const state = MDV.tabs.getFindState ? MDV.tabs.getFindState() : { visible: false, query: '', sourceMode: 'rendered', caseSensitive: false }
  viewerFindBar.classList.toggle('hidden', !state.visible)
  viewerFindInput.value = state.query || ''
  viewerFindMarkdown.checked = state.sourceMode === 'markdown'
  viewerFindCase.checked = !!state.caseSensitive
  updateFindCount()
}

function clearFindHighlights() {
  const marks = Array.from(preview.querySelectorAll('.mdv-find-mark'))
  marks.forEach(mark => {
    const parent = mark.parentNode
    if (!parent) return
    parent.replaceChild(document.createTextNode(mark.textContent), mark)
    parent.normalize()
  })
  activeFindMarks = []
}

function normalizeForFind(text, caseSensitive) {
  return caseSensitive ? text : text.toLowerCase()
}

function countPlainMatches(text, query, caseSensitive) {
  if (!text || !query) return 0
  const haystack = normalizeForFind(text, caseSensitive)
  const needle = normalizeForFind(query, caseSensitive)
  let count = 0
  let from = 0
  while (needle && from <= haystack.length) {
    const idx = haystack.indexOf(needle, from)
    if (idx < 0) break
    count++
    from = idx + needle.length
  }
  return count
}

function isFindSkippableNode(node) {
  if (!node || node.nodeType !== Node.ELEMENT_NODE) return false
  if (node.classList && node.classList.contains('mdv-find-mark')) return true
  return ['SCRIPT', 'STYLE', 'TEXTAREA'].includes(node.tagName)
}

function wrapMatchesInTextNode(textNode, query, caseSensitive) {
  const text = textNode.nodeValue
  const haystack = normalizeForFind(text, caseSensitive)
  const needle = normalizeForFind(query, caseSensitive)
  const ranges = []
  let from = 0
  while (needle && from <= haystack.length) {
    const idx = haystack.indexOf(needle, from)
    if (idx < 0) break
    ranges.push([idx, idx + needle.length])
    from = idx + needle.length
  }
  if (!ranges.length) return []

  const frag = document.createDocumentFragment()
  const marks = []
  let pos = 0
  ranges.forEach(([start, end]) => {
    if (start > pos) frag.appendChild(document.createTextNode(text.slice(pos, start)))
    const mark = document.createElement('span')
    mark.className = 'mdv-find-mark'
    mark.textContent = text.slice(start, end)
    marks.push(mark)
    frag.appendChild(mark)
    pos = end
  })
  if (pos < text.length) frag.appendChild(document.createTextNode(text.slice(pos)))
  textNode.parentNode.replaceChild(frag, textNode)
  return marks
}

function applyRenderedFind(query, { caseSensitive }) {
  const textNodes = []
  const walker = document.createTreeWalker(preview, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue) return NodeFilter.FILTER_REJECT
      let p = node.parentElement
      while (p && p !== preview) {
        if (isFindSkippableNode(p)) return NodeFilter.FILTER_REJECT
        p = p.parentElement
      }
      return NodeFilter.FILTER_ACCEPT
    }
  })
  while (walker.nextNode()) textNodes.push(walker.currentNode)
  return textNodes.flatMap(node => wrapMatchesInTextNode(node, query, caseSensitive))
}

function updateFindCount() {
  const state = MDV.tabs.getFindState ? MDV.tabs.getFindState() : { sourceMode: 'rendered', currentIndex: -1 }
  const visibleTotal = activeFindMarks.length
  viewerFindCount.classList.remove('warning')
  if (!state.query) {
    viewerFindCount.textContent = '0 / 0'
  } else if (state.sourceMode === 'markdown' && activeSourceTotal !== visibleTotal) {
    viewerFindCount.classList.add('warning')
    viewerFindCount.textContent = visibleTotal
      ? `${Math.max(0, state.currentIndex + 1)} / ${visibleTotal} visible · ${activeSourceTotal} source`
      : `0 visible · ${activeSourceTotal} source`
  } else {
    viewerFindCount.textContent = visibleTotal ? `${state.currentIndex + 1} / ${visibleTotal}` : '0 / 0'
  }
  const canMove = visibleTotal > 0
  viewerFindPrev.disabled = !canMove
  viewerFindNext.disabled = !canMove
}

function setCurrentFindMark(index) {
  activeFindMarks.forEach(mark => mark.classList.remove('current'))
  if (!activeFindMarks.length) {
    MDV.tabs.setFindState({ currentIndex: -1 })
    updateFindCount()
    return
  }
  const next = Math.max(0, Math.min(activeFindMarks.length - 1, index))
  activeFindMarks[next].classList.add('current')
  MDV.tabs.setFindState({ currentIndex: next })
  updateFindCount()
}

function runFindForActiveTab({ preserveIndex = false } = {}) {
  clearFindHighlights()
  const state = MDV.tabs.getFindState ? MDV.tabs.getFindState() : null
  if (!state || !state.visible || !state.query) {
    activeSourceTotal = 0
    updateFindCount()
    return
  }

  if (state.sourceMode === 'markdown') {
    activeSourceTotal = countPlainMatches(originalMarkdown || '', state.query, state.caseSensitive)
  } else {
    activeSourceTotal = 0
  }
  activeFindMarks = applyRenderedFind(state.query, { caseSensitive: state.caseSensitive })
  const wantedIndex = preserveIndex && state.currentIndex >= 0 ? state.currentIndex : 0
  setCurrentFindMark(activeFindMarks.length ? wantedIndex : -1)
}

function goToFindMatch(delta) {
  if (!activeFindMarks.length) return
  const state = MDV.tabs.getFindState()
  const current = state.currentIndex >= 0 ? state.currentIndex : 0
  const next = (current + delta + activeFindMarks.length) % activeFindMarks.length
  setCurrentFindMark(next)
  activeFindMarks[next].scrollIntoView({ behavior: 'smooth', block: 'center' })
}

function updateActiveFindStateFromControls({ resetIndex = true } = {}) {
  MDV.tabs.setFindState({
    query: viewerFindInput.value,
    sourceMode: viewerFindMarkdown.checked ? 'markdown' : 'rendered',
    caseSensitive: viewerFindCase.checked,
    currentIndex: resetIndex ? -1 : MDV.tabs.getFindState().currentIndex
  })
  runFindForActiveTab({ preserveIndex: !resetIndex })
}

btnViewerFind.addEventListener('click', openViewerFindBar)
viewerFindInput.addEventListener('input', () => updateActiveFindStateFromControls())
viewerFindMarkdown.addEventListener('change', () => updateActiveFindStateFromControls())
viewerFindCase.addEventListener('change', () => updateActiveFindStateFromControls())
viewerFindPrev.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); goToFindMatch(-1) })
viewerFindNext.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); goToFindMatch(1) })
viewerFindClose.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); closeViewerFindBar() })
viewerFindInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault()
    goToFindMatch(e.shiftKey ? -1 : 1)
  }
  if (e.key === 'Escape') {
    e.preventDefault()
    closeViewerFindBar()
  }
})
MDV.tabs.on('activate', () => {
  syncFindBarFromActiveTab()
  const state = MDV.tabs.getFindState ? MDV.tabs.getFindState() : null
  if (state && state.visible) runFindForActiveTab({ preserveIndex: true })
  else {
    clearFindHighlights()
    activeSourceTotal = 0
    updateFindCount()
  }
  handleActiveTabExternalDirty()
})

// ── 외부 파일 변경 감지 / Reload 확인 ─────────────────────
const FILE_WATCH_INTERVAL_MS = 2000
let fileWatchRunning = false
let reloadPrompt = { open: false, tabId: null }

function updateReloadPromptNote(tab) {
  reloadNote.textContent = tab && tab.changedWhilePromptOpen
    ? 'The file changed again while this prompt was open. Reload will read the latest version.'
    : ''
}

function closeReloadPrompt() {
  reloadPrompt = { open: false, tabId: null }
  reloadOverlay.classList.add('hidden')
  reloadNote.textContent = ''
}

function maybeShowReloadPrompt(tab) {
  if (!tab || !tab.externalDirty || tab.reloadPromptDismissed) return
  const active = MDV.tabs.active()
  if (!active || active.id !== tab.id) return
  if (reloadPrompt.open) {
    if (reloadPrompt.tabId === tab.id) updateReloadPromptNote(tab)
    return
  }
  reloadPrompt = { open: true, tabId: tab.id }
  reloadMessage.textContent = `${basename(tab.path)} changed on disk. Reload the latest version?`
  updateReloadPromptNote(tab)
  reloadOverlay.classList.remove('hidden')
}

function markTabChanged(tab, modifiedMs) {
  const samePrompt = reloadPrompt.open && reloadPrompt.tabId === tab.id
  MDV.tabs.setExternalState(tab.id, {
    externalDirty: true,
    detectedMtime: modifiedMs,
    changedWhilePromptOpen: !!samePrompt || !!tab.changedWhilePromptOpen,
    reloadPromptDismissed: tab.detectedMtime === modifiedMs ? !!tab.reloadPromptDismissed : false
  })
  const updated = MDV.tabs.list().find(t => t.id === tab.id)
  if (samePrompt) updateReloadPromptNote(updated)
  maybeShowReloadPrompt(updated)
}

async function pollOpenFileChanges() {
  if (fileWatchRunning) return
  fileWatchRunning = true
  try {
    const tabs = MDV.tabs.list().filter(t => t.path && !t.missing)
    await Promise.all(tabs.map(async tab => {
      let modifiedMs
      try {
        modifiedMs = await invoke('file_modified_ms', { filePath: tab.path })
      } catch (_) {
        return
      }
      if (!tab.loadedMtime) {
        MDV.tabs.setExternalState(tab.id, { loadedMtime: modifiedMs })
        return
      }
      if (modifiedMs > tab.loadedMtime && modifiedMs !== tab.detectedMtime) {
        markTabChanged(tab, modifiedMs)
      }
    }))
  } finally {
    fileWatchRunning = false
  }
}

function handleActiveTabExternalDirty() {
  const tab = MDV.tabs.active()
  if (!tab || !tab.externalDirty) return
  if (tab.reloadPromptDismissed) {
    MDV.tabs.setExternalState(tab.id, { reloadPromptDismissed: false })
  }
  maybeShowReloadPrompt(MDV.tabs.active())
}

reloadCancel.addEventListener('click', e => {
  e.preventDefault()
  const tabId = reloadPrompt.tabId
  if (tabId) MDV.tabs.setExternalState(tabId, { reloadPromptDismissed: true, changedWhilePromptOpen: false })
  closeReloadPrompt()
})

reloadOk.addEventListener('click', async e => {
  e.preventDefault()
  const tabId = reloadPrompt.tabId
  closeReloadPrompt()
  const tab = MDV.tabs.list().find(t => t.id === tabId)
  if (!tab) return
  MDV.tabs.setExternalState(tab.id, {
    renderedHTML: null,
    missing: false,
    externalDirty: false,
    changedWhilePromptOpen: false,
    reloadPromptDismissed: false
  })
  await MDV.tabs.activate(tab.id)
  runFindForActiveTab({ preserveIndex: true })
})

setInterval(pollOpenFileChanges, FILE_WATCH_INTERVAL_MS)

// Expose for session.js and tabs.js
window.MDV = window.MDV || {}
function getOriginalMarkdown() { return originalMarkdown }
window.MDV.app = { openWorkspaceByPath, openWorkspaceByPathRestore, expandDirs, renderPath, showEmpty, showError, adoptRenderedTab, getOriginalMarkdown, clearFindHighlights }

btnOpenFolder.addEventListener('click', async () => {
  const result = await invoke('open_folder_dialog')
  if (!result) return
  await openWorkspaceByPath(result.rootPath, result.tree)
})

const btnOpenFolderEmpty = document.getElementById('btn-open-folder-empty')
if (btnOpenFolderEmpty) {
  btnOpenFolderEmpty.addEventListener('click', () => btnOpenFolder.click())
}

// ── 파일 이름 검색 ──────────────────────────────────────
function basename(path) {
  if (!path) return ''
  const m = String(path).match(/[^\\/]+$/)
  return m ? m[0] : String(path)
}

function captureExpandedDirs() {
  if (!currentWorkspaceRoot) return []
  const root = currentWorkspaceRoot
  const expanded = []
  fileTree.querySelectorAll('.tree-dir-row.open').forEach(row => {
    const abs = row.dataset.path
    if (!abs) return
    let rel = abs.startsWith(root) ? abs.slice(root.length) : abs
    rel = rel.replace(/^[\\/]+/, '').replace(/\\/g, '/')
    if (rel) expanded.push(rel)
  })
  return expanded
}

function showFileSearchStatus(text, className = '') {
  fileSearchStatus.textContent = text || ''
  fileSearchStatus.className = className
}

function setFileSearchEnabled(enabled) {
  fileSearchEnabled = enabled
  fileSearchPanel.classList.toggle('disabled', !enabled)
  btnFileSearch.disabled = !enabled
}

function openFileSearchPanel() {
  if (!fileSearchEnabled) return
  fileSearchPanel.classList.remove('hidden')
  fileSearchInput.focus()
  fileSearchInput.select()
}

function clearFileSearch({ closePanel = false, resetEnabled = false } = {}) {
  fileSearchActive = false
  fileSearchSavedExpandedDirs = null
  fileSearchInput.value = ''
  fileSearchRegex.checked = false
  showFileSearchStatus('')
  if (closePanel) fileSearchPanel.classList.add('hidden')
  if (resetEnabled) setFileSearchEnabled(true)
  if (currentWorkspaceTree && currentWorkspaceRoot) {
    renderFileTree(currentWorkspaceTree, currentWorkspaceRoot, { restoreExpandedDirs: captureExpandedDirs() })
  }
}

function makeFileMatcher(query, useRegex) {
  if (!useRegex) {
    const needle = query.toLowerCase()
    return name => name.toLowerCase().includes(needle)
  }
  const re = new RegExp(query, 'i')
  return name => re.test(name)
}

function filterTreeByName(node, matches) {
  if (!node) return null
  if (node.type === 'file') return matches(node.name || basename(node.path)) ? Object.assign({}, node) : null
  const children = (node.children || []).map(child => filterTreeByName(child, matches)).filter(Boolean)
  return children.length ? Object.assign({}, node, { children }) : null
}

function applyFileSearch() {
  if (!fileSearchEnabled || !currentWorkspaceTree || !currentWorkspaceRoot) return
  const query = fileSearchInput.value.trim()
  showFileSearchStatus('')
  if (!query) {
    fileSearchActive = false
    const restore = fileSearchSavedExpandedDirs || captureExpandedDirs()
    fileSearchSavedExpandedDirs = null
    renderFileTree(currentWorkspaceTree, currentWorkspaceRoot, { restoreExpandedDirs: restore })
    return
  }

  let matcher
  try {
    matcher = makeFileMatcher(query, fileSearchRegex.checked)
  } catch (e) {
    fileSearchActive = false
    showFileSearchStatus('Invalid regular expression', 'error')
    renderFileTree(currentWorkspaceTree, currentWorkspaceRoot, { restoreExpandedDirs: fileSearchSavedExpandedDirs || captureExpandedDirs() })
    return
  }

  if (!fileSearchActive) fileSearchSavedExpandedDirs = captureExpandedDirs()
  fileSearchActive = true
  const filtered = filterTreeByName(currentWorkspaceTree, matcher)
  if (!filtered) {
    fileTree.innerHTML = '<div class="empty-hint"><p>🔎</p><p>No matching markdown files</p></div>'
    showFileSearchStatus('0 matches')
    return
  }
  const count = countFileNodes(filtered)
  renderFileTree(filtered, currentWorkspaceRoot, { filtered: true, expandAll: true })
  showFileSearchStatus(`${count} match${count === 1 ? '' : 'es'}`)
}

function countFileNodes(node) {
  if (!node) return 0
  if (node.type === 'file') return 1
  return (node.children || []).reduce((sum, child) => sum + countFileNodes(child), 0)
}

btnFileSearch.addEventListener('click', () => {
  if (fileSearchPanel.classList.contains('hidden')) openFileSearchPanel()
  else fileSearchPanel.classList.add('hidden')
})
fileSearchInput.addEventListener('input', applyFileSearch)
fileSearchRegex.addEventListener('change', applyFileSearch)
btnFileSearchClear.addEventListener('click', () => clearFileSearch())
fileSearchInput.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return
  e.preventDefault()
  if (fileSearchInput.value) clearFileSearch()
  else fileSearchPanel.classList.add('hidden')
})

// ── 확장 디렉터리 목록 저장 ──────────────────────────────
function saveExpandedDirs() {
  if (!currentWorkspaceRoot) return
  if (fileSearchActive) return
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

// ── 파일트리 렌더링 ─────────────────────────────────────
function renderFileTree(tree, rootPath, opts = {}) {
  currentWorkspaceRoot = rootPath
  if (!opts.filtered) currentWorkspaceTree = tree
  if (!tree) {
    fileTree.innerHTML = '<div class="empty-hint"><p>📭</p><p>No .md files found</p></div>'
    return
  }
  sidebarRootName.textContent = tree.name || rootPath.split(/[\\/]/).pop()
  fileTree.innerHTML = ''
  if (tree.type === 'dir') {
    tree.children.forEach(node => fileTree.appendChild(createTreeNode(node, 0, opts)))
  } else {
    fileTree.appendChild(createTreeNode(tree, 0, opts))
  }
  if (opts.restoreExpandedDirs) expandDirs(opts.restoreExpandedDirs)
}

function createTreeNode(node, depth, opts = {}) {
  if (node.type === 'file') {
    const el = document.createElement('div')
    el.className = 'tree-item tree-file-row'
    el.style.paddingLeft = `${8 + depth * 12}px`
    el.innerHTML = `<span class="icon">📄</span><span class="label">${node.name}</span>`
    el.dataset.path = node.path
    el.addEventListener('click', () => MDV.tabs.open(node.path, { pinned: false }))
    el.addEventListener('dblclick', () => MDV.tabs.open(node.path, { pinned: true }))
    return el
  }

  const wrap = document.createElement('div')
  wrap.className = 'tree-node-wrap'

  const row = document.createElement('div')
  row.className = 'tree-item tree-dir-row'
  row.style.paddingLeft = `${8 + depth * 12}px`
  row.innerHTML = `<span class="arrow">▶</span><span class="icon">📁</span><span class="label">${node.name}</span>`
  row.dataset.path = node.path

  const children = document.createElement('div')
  children.className = 'tree-dir-children' + (opts.expandAll ? '' : ' collapsed')
  node.children.forEach(child => children.appendChild(createTreeNode(child, depth + 1, opts)))
  if (opts.expandAll) row.classList.add('open')

  row.addEventListener('click', () => {
    const collapsed = children.classList.toggle('collapsed')
    row.classList.toggle('open', !collapsed)
    saveExpandedDirs()
  })

  wrap.appendChild(row)
  wrap.appendChild(children)
  return wrap
}

// ── 이미지 경로 → asset URL 변환 ─────────────────────────
async function fixImagePaths() {
  if (!currentFilePath) return
  const imgs = preview.querySelectorAll('img')
  if (!imgs.length) return
  await Promise.all(Array.from(imgs).map(async img => {
    const src = img.getAttribute('src')
    if (!src || /^(https?:|data:|blob:|asset:)/.test(src)) return
    try {
      const absPath = await invoke('resolve_relative', { fromFile: currentFilePath, relPath: decodeURIComponent(src) })
      img.src = window.__TAURI__.core.convertFileSrc(absPath)
    } catch (e) {
      console.warn('Image path resolve failed:', src, e)
    }
  }))
}

// ── Markdown 렌더링 ──────────────────────────────────────
async function renderMarkdown(mdText) {
  previewEmpty.classList.add('hidden')
  preview.style.display = 'block'
  preview.innerHTML = marked.parse(mdText)
  await fixImagePaths()
  await renderMermaid()
  renderKatex()
  buildToc()
}

// ── 링크 클릭 처리 (이벤트 위임, 1회 등록) ───────────────
preview.addEventListener('click', async e => {
  const a = e.target.closest('a[href]')
  if (!a) return
  const href = a.getAttribute('href')
  if (!href) return

  // 1) 외부 URL
  if (/^(https?:|mailto:|tel:)/i.test(href)) {
    e.preventDefault()
    invoke('open_external', { url: href })
    return
  }

  // 2) 페이지 내 앵커 (#id) — 스크롤만, history push 없음
  if (href.startsWith('#')) {
    e.preventDefault()
    if (!currentFilePath) return
    const id = decodeURIComponent(href.slice(1))
    const target = preview.querySelector(`#${CSS.escape(id)}`) ||
                   preview.querySelector(`[id="${id}"]`)
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    return
  }

  // 3) 상대 경로 — 현재 파일 기준으로 resolve
  e.preventDefault()
  if (!currentFilePath) return
  const [pathPart, hashPart] = href.split('#')
  const resolved = await invoke('resolve_relative', {
    fromFile: currentFilePath,
    relPath: decodeURI(pathPart)
  })
  const ext = resolved.split('.').pop().toLowerCase()
  const exists = await invoke('path_exists', { path: resolved })

  // 존재하지 않으면 tab logic으로 → File not found 프리뷰 (Task 7에서 UI 개선)
  if (!exists) {
    await MDV.tabs.openFromLink(resolved)
    return
  }

  if (ext === 'md' || ext === 'markdown') {
    await MDV.tabs.openFromLink(resolved)
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
})

// ── 마우스 back/forward 버튼 ─────────────────────────────
window.addEventListener('mouseup', e => {
  if (e.button === 3) { e.preventDefault(); MDV.tabs.navBack().catch(err => console.warn(err)) }
  if (e.button === 4) { e.preventDefault(); MDV.tabs.navForward().catch(err => console.warn(err)) }
})
window.addEventListener('mousedown', e => {
  if (e.button === 3 || e.button === 4) e.preventDefault()
})

// ── Mermaid 렌더링 ───────────────────────────────────────
async function renderMermaid() {
  const blocks = preview.querySelectorAll('.mermaid')
  if (!blocks.length) return
  try {
    await mermaid.run({ nodes: Array.from(blocks) })
  } catch (e) {
    blocks.forEach(block => {
      if (!block.querySelector('svg')) {
        block.innerHTML = `<span style="color:#f48771">Mermaid Error: ${e.message}</span>`
      }
    })
  }
  blocks.forEach(attachDiagramZoomButtons)
}

// ── Mermaid 다이어그램 확대 보기 ─────────────────────────
const diagramOverlay   = document.getElementById('diagram-overlay')
const diagramViewport  = document.getElementById('diagram-viewport')
const diagramContent   = document.getElementById('diagram-content')
const diagramZoomLevel = document.getElementById('diagram-zoom-level')

const DIAGRAM_EXPAND_ICON =
  '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6">' +
  '<path d="M6 2H2v4M10 2h4v4M6 14H2v-4M10 14h4v-4"/></svg>'

let diagramScale     = 1
let diagramBaseWidth = 0
let diagramSvg       = null

function attachDiagramZoomButtons(block) {
  if (!block.querySelector('svg') || block.querySelector('.mermaid-zoom-btn')) return
  const mk = pos => {
    const b = document.createElement('button')
    b.className = `mermaid-zoom-btn ${pos}`
    b.title = '다이어그램 크게 보기'
    b.innerHTML = DIAGRAM_EXPAND_ICON
    b.addEventListener('click', e => {
      e.stopPropagation()
      openDiagramViewer(block)
    })
    return b
  }
  block.appendChild(mk('top'))
  // 세로로 긴 다이어그램은 아래쪽에도 버튼을 둬서 스크롤 없이 접근 가능하게
  if (block.offsetHeight > 240) block.appendChild(mk('bottom'))
}

function diagramNaturalWidth(svg) {
  const vb = svg.viewBox && svg.viewBox.baseVal
  if (vb && vb.width) return vb.width
  const w = parseFloat(svg.getAttribute('width'))
  if (!isNaN(w) && w > 0) return w
  return svg.getBoundingClientRect().width || 600
}

function applyDiagramScale() {
  if (!diagramSvg) return
  diagramSvg.style.width = Math.round(diagramBaseWidth * diagramScale) + 'px'
  diagramZoomLevel.textContent = Math.round(diagramScale * 100) + '%'
}

// anchor(뷰포트 내 좌표)가 가리키는 지점이 줌 후에도 같은 자리에 오도록 스크롤 보정
function setDiagramScale(next, anchorX, anchorY) {
  const prev = diagramScale
  diagramScale = Math.min(6, Math.max(0.25, next))
  if (diagramScale === prev) return
  const rect = diagramViewport.getBoundingClientRect()
  const ax = (anchorX ?? rect.left + rect.width / 2) - rect.left
  const ay = (anchorY ?? rect.top + rect.height / 2) - rect.top
  const sx = diagramViewport.scrollLeft
  const sy = diagramViewport.scrollTop
  const ratio = diagramScale / prev
  applyDiagramScale()
  diagramViewport.scrollLeft = (sx + ax) * ratio - ax
  diagramViewport.scrollTop  = (sy + ay) * ratio - ay
}

function openDiagramViewer(block) {
  const svg = block.querySelector('svg')
  if (!svg) return
  diagramContent.innerHTML = ''
  // 원본 svg의 id/내부 <style>을 그대로 유지해야 mermaid 자체 스타일이 적용됨
  const clone = svg.cloneNode(true)
  clone.style.maxWidth = 'none'
  clone.style.height = 'auto'
  const stage = document.createElement('div')
  stage.className = 'diagram-stage'
  stage.appendChild(clone)
  diagramContent.appendChild(stage)
  diagramSvg = clone
  diagramBaseWidth = diagramNaturalWidth(clone)
  diagramOverlay.classList.add('visible')
  // 초기 배율: 뷰포트 가로를 채우되 최소 100% ~ 최대 300%
  const avail = diagramViewport.clientWidth - 80
  diagramScale = Math.min(3, Math.max(1, avail / diagramBaseWidth))
  applyDiagramScale()
  diagramViewport.scrollLeft = 0
  diagramViewport.scrollTop = 0
}

function closeDiagramViewer() {
  diagramOverlay.classList.remove('visible')
  diagramContent.innerHTML = ''
  diagramSvg = null
}

document.getElementById('diagram-zoom-in').addEventListener('click', () => setDiagramScale(diagramScale + 0.25))
document.getElementById('diagram-zoom-out').addEventListener('click', () => setDiagramScale(diagramScale - 0.25))
diagramZoomLevel.addEventListener('click', () => setDiagramScale(1))
document.getElementById('diagram-close').addEventListener('click', closeDiagramViewer)

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && diagramOverlay.classList.contains('visible')) {
    e.preventDefault()
    closeDiagramViewer()
  }
})

// Ctrl+휠 줌 (커서 위치 기준)
diagramViewport.addEventListener('wheel', e => {
  if (!e.ctrlKey) return
  e.preventDefault()
  setDiagramScale(diagramScale * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX, e.clientY)
}, { passive: false })

// 드래그 팬
let diagramPan = null
diagramViewport.addEventListener('mousedown', e => {
  if (e.button !== 0) return
  diagramPan = {
    x: e.clientX, y: e.clientY,
    sl: diagramViewport.scrollLeft, st: diagramViewport.scrollTop,
    moved: false
  }
  diagramViewport.classList.add('panning')
  e.preventDefault()
})
window.addEventListener('mousemove', e => {
  if (!diagramPan) return
  const dx = e.clientX - diagramPan.x
  const dy = e.clientY - diagramPan.y
  if (Math.abs(dx) > 3 || Math.abs(dy) > 3) diagramPan.moved = true
  diagramViewport.scrollLeft = diagramPan.sl - dx
  diagramViewport.scrollTop  = diagramPan.st - dy
})
window.addEventListener('mouseup', e => {
  if (!diagramPan) return
  const wasDrag = diagramPan.moved
  diagramPan = null
  diagramViewport.classList.remove('panning')
  // 드래그가 아닌 빈 배경 클릭이면 닫기
  if (!wasDrag && (e.target === diagramViewport || e.target === diagramContent)) closeDiagramViewer()
})

// ── KaTeX 렌더링 ─────────────────────────────────────────
function renderKatex() {
  try {
    renderMathInElement(preview, {
      delimiters: [
        { left: '$$', right: '$$', display: true  },
        { left: '$',  right: '$',  display: false },
        { left: '\\[', right: '\\]', display: true  },
        { left: '\\(', right: '\\)', display: false }
      ],
      throwOnError: false
    })
  } catch (_) {}
}

// ── TOC 생성 ─────────────────────────────────────────────
function slugifyHeading(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s+/g, '-')
}

function buildToc() {
  tocList.innerHTML = ''
  const headings = preview.querySelectorAll('h1,h2,h3,h4,h5,h6')

  if (!headings.length) {
    tocList.innerHTML = '<div style="padding:12px;color:var(--text-dim);font-size:12px">No headings</div>'
    return
  }

  const slugCounts = {}
  headings.forEach((h, i) => {
    if (!h.id) {
      let slug = slugifyHeading(h.textContent) || `heading-${i}`
      if (slugCounts[slug] !== undefined) {
        slugCounts[slug] += 1
        slug = `${slug}-${slugCounts[slug]}`
      } else {
        slugCounts[slug] = 0
      }
      h.id = slug
    }

    const level = parseInt(h.tagName[1])
    const item  = document.createElement('div')
    item.className = `toc-item toc-h${level}`
    item.textContent = h.textContent
    item.title = h.textContent
    item.dataset.target = h.id

    item.addEventListener('click', () => {
      h.scrollIntoView({ behavior: 'smooth', block: 'start' })
      document.querySelectorAll('.toc-item').forEach(t => t.classList.remove('active'))
      item.classList.add('active')
    })

    tocList.appendChild(item)
  })

  setupScrollSpy(headings)
}

// ── 스크롤 스파이 ────────────────────────────────────────
let scrollSpyObserver = null

function setupScrollSpy(headings) {
  if (scrollSpyObserver) scrollSpyObserver.disconnect()

  const tocItems = tocList.querySelectorAll('.toc-item')

  scrollSpyObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.id
        tocItems.forEach(item => {
          item.classList.toggle('active', item.dataset.target === id)
        })
        const activeItem = tocList.querySelector('.toc-item.active')
        if (activeItem) {
          activeItem.scrollIntoView({ block: 'nearest' })
        }
      }
    })
  }, {
    root: document.getElementById('preview-wrap'),
    rootMargin: '-10% 0px -80% 0px'
  })

  headings.forEach(h => scrollSpyObserver.observe(h))
}

// ── Drag & Drop (Tauri native event) ─────────────────────
const dropOverlay = document.getElementById('drop-overlay')

getCurrentWindow().onDragDropEvent(event => {
  const type = event.payload.type
  if (type === 'enter' || type === 'over') {
    dropOverlay.classList.add('visible')
  } else if (type === 'leave' || type === 'cancel') {
    dropOverlay.classList.remove('visible')
  } else if (type === 'drop') {
    dropOverlay.classList.remove('visible')
    const paths = event.payload.paths || []
    const mdFiles = paths.filter(p => {
      const ext = p.split('.').pop().toLowerCase()
      return ext === 'md' || ext === 'markdown'
    })
    if (!mdFiles.length) return
    const fileList = mdFiles.map(p => ({ name: p.split(/[\\/]/).pop(), path: p }))
    renderDroppedFiles(fileList)
    const firstItem = fileTree.querySelector('.tree-item[data-path]')
    if (firstItem) firstItem.click()
  }
})

function renderDroppedFiles(files) {
  clearFileSearch({ closePanel: true })
  setFileSearchEnabled(false)
  const groups = {}
  for (const f of files) {
    const dir = f.path.replace(/[\\/][^\\/]+$/, '')
    if (!groups[dir]) groups[dir] = []
    groups[dir].push(f)
  }

  const dirs = Object.keys(groups)
  const singleDir = dirs.length === 1

  if (singleDir) {
    sidebarRootName.textContent = dirs[0].split(/[\\/]/).pop()
  } else {
    sidebarRootName.textContent = `Files (${files.length})`
  }

  fileTree.innerHTML = ''

  for (const dir of dirs) {
    if (!singleDir) {
      const header = document.createElement('div')
      header.className = 'tree-dir-header'
      header.textContent = dir.split(/[\\/]/).pop()
      header.title = dir
      fileTree.appendChild(header)
    }

    for (const f of groups[dir]) {
      const el = document.createElement('div')
      el.className = 'tree-item'
      el.innerHTML = `<span class="icon">📄</span><span class="label">${f.name}</span>`
      el.dataset.path = f.path
      el.addEventListener('click', () => MDV.tabs.open(f.path, { pinned: true }))
      fileTree.appendChild(el)
    }
  }
}

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
    item.setAttribute('role', 'menuitem')
    item.title = e.path
    const nameSpan = document.createElement('span')
    nameSpan.className = 'recent-name'
    nameSpan.textContent = e.name || ''
    const pathSpan = document.createElement('span')
    pathSpan.className = 'recent-path'
    pathSpan.textContent = e.path
    item.appendChild(nameSpan)
    item.appendChild(pathSpan)
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
  const r = btnRecent.getBoundingClientRect()
  recentDropdown.style.top  = `${Math.round(r.bottom + 4)}px`
  recentDropdown.style.left = `${Math.round(r.left)}px`
  recentDropdown.classList.remove('hidden')
  btnRecent.setAttribute('aria-expanded', 'true')
}
function hideRecentDropdown() {
  recentDropdown.classList.add('hidden')
  btnRecent.setAttribute('aria-expanded', 'false')
}

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

// pickers — workspace entry triggers openWorkspaceByPath; file recents go through MDV.tabs.open
async function pickWorkspace(entry) {
  await openWorkspaceByPath(entry.path)
}
async function pickFile(entry) {
  await MDV.tabs.open(entry.path, { pinned: true })
}

// ── 리사이즈 핸들 ────────────────────────────────────────
setupResize('resize-sidebar', 'sidebar',   'width', 140, 480)
setupResize('resize-toc',     'toc-panel', 'width', 140, 360, true)

function setupResize(handleId, targetId, prop, min, max, reverse = false) {
  const handle = document.getElementById(handleId)
  const target = document.getElementById(targetId)
  if (!handle || !target) return

  let startX, startSize

  handle.addEventListener('mousedown', e => {
    startX    = e.clientX
    startSize = target.getBoundingClientRect()[prop]
    handle.classList.add('dragging')
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const onMove = e => {
      const delta = reverse ? startX - e.clientX : e.clientX - startX
      const newSize = Math.min(max, Math.max(min, startSize + delta))
      target.style[prop] = newSize + 'px'
    }
    const onUp = () => {
      handle.classList.remove('dragging')
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  })
}

// ── Session restore (last block before EOF) ──
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (MDV.session && MDV.session.restoreSession) {
      MDV.session.restoreSession().catch(err => console.warn('[restore] failed:', err))
    }
  })
} else {
  if (MDV.session && MDV.session.restoreSession) {
    MDV.session.restoreSession().catch(err => console.warn('[restore] failed:', err))
  }
}
