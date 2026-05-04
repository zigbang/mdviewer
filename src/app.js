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

// ── 네비게이션 히스토리 (링크 클릭으로만 push) ─────────────
const navHistory = []
let navIndex = -1

function resetHistory() {
  navHistory.length = 0
  navIndex = -1
}

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
  if (!currentFilePath) return
  const content = await invoke('read_file', { filePath: currentFilePath })
  originalMarkdown = content
  renderMarkdown(content)
}
document.getElementById('btn-refresh').addEventListener('click', refreshFile)

// ── 전체 화면 ───────────────────────────────────────────
document.getElementById('btn-fullscreen').addEventListener('click', () => {
  invoke('toggle_fullscreen')
})

// ── About 모달 ──────────────────────────────────────────
const aboutOverlay = document.getElementById('about-overlay')
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
    renderMarkdown(translated)
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
  if (rerender && originalMarkdown) renderMarkdown(originalMarkdown)
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

// 단축키
document.addEventListener('keydown', e => {
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
  // 네비게이션 back/forward
  if (e.altKey && e.key === 'ArrowLeft')  { e.preventDefault(); navBack() }
  if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); navForward() }
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
  MDV.recents.saveSession({ scrollTop: previewWrapEl.scrollTop })
})

// ── 폴더 열기 ────────────────────────────────────────────
async function openWorkspaceByPath(rootPath, prebuiltTree) {
  const tree = prebuiltTree != null ? prebuiltTree : await invoke('build_file_tree', { dirPath: rootPath })
  if (!tree) return
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

btnOpenFolder.addEventListener('click', async () => {
  const result = await invoke('open_folder_dialog')
  if (!result) return
  await openWorkspaceByPath(result.rootPath, result.tree)
})

const btnOpenFolderEmpty = document.getElementById('btn-open-folder-empty')
if (btnOpenFolderEmpty) {
  btnOpenFolderEmpty.addEventListener('click', () => btnOpenFolder.click())
}

// ── 확장 디렉터리 목록 저장 ──────────────────────────────
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

// ── 파일트리 렌더링 ─────────────────────────────────────
function renderFileTree(tree, rootPath) {
  currentWorkspaceRoot = rootPath
  if (!tree) {
    fileTree.innerHTML = '<div class="empty-hint"><p>📭</p><p>No .md files found</p></div>'
    return
  }
  sidebarRootName.textContent = tree.name || rootPath.split(/[\\/]/).pop()
  fileTree.innerHTML = ''
  if (tree.type === 'dir') {
    tree.children.forEach(node => fileTree.appendChild(createTreeNode(node, 0)))
  } else {
    fileTree.appendChild(createTreeNode(tree, 0))
  }
}

function createTreeNode(node, depth) {
  if (node.type === 'file') {
    const el = document.createElement('div')
    el.className = 'tree-item'
    el.style.paddingLeft = `${8 + depth * 12}px`
    el.innerHTML = `<span class="icon">📄</span><span class="label">${node.name}</span>`
    el.dataset.path = node.path
    el.addEventListener('click', () => openFile(node.path, el))
    return el
  }

  const wrap = document.createElement('div')

  const row = document.createElement('div')
  row.className = 'tree-item tree-dir-row'
  row.style.paddingLeft = `${8 + depth * 12}px`
  row.innerHTML = `<span class="arrow">▶</span><span class="icon">📁</span><span class="label">${node.name}</span>`
  row.dataset.path = node.path

  const children = document.createElement('div')
  children.className = 'tree-dir-children collapsed'
  node.children.forEach(child => children.appendChild(createTreeNode(child, depth + 1)))

  row.addEventListener('click', () => {
    const collapsed = children.classList.toggle('collapsed')
    row.classList.toggle('open', !collapsed)
    saveExpandedDirs()
  })

  wrap.appendChild(row)
  wrap.appendChild(children)
  return wrap
}

// ── 파일 열기 ────────────────────────────────────────────
async function openFile(filePath, treeEl, { resetNav = true, pushRecent = true } = {}) {
  if (resetNav) resetHistory()

  document.querySelectorAll('.tree-item.active').forEach(e => e.classList.remove('active'))
  if (treeEl) treeEl.classList.add('active')

  let content
  try {
    content = await invoke('read_file', { filePath: filePath })
  } catch (err) {
    currentFilePath = null
    const missingName = filePath.split(/[\\/]/).pop()
    fileNameText.textContent = missingName + ' (not found)'
    setWindowTitle(missingName + ' (not found)', filePath)
    previewEmpty.classList.add('hidden')
    preview.style.display = 'block'
    preview.innerHTML = `<div style="padding:40px;color:var(--text-dim);text-align:center">
      <p style="font-size:32px;margin-bottom:16px">📄</p>
      <p>File not found</p>
      <p style="font-size:12px;margin-top:8px;opacity:0.6">${filePath}</p></div>`
    tocList.innerHTML = '<div style="padding:12px;color:var(--text-dim);font-size:12px">No headings</div>'
    return
  }
  currentFilePath = filePath
  originalMarkdown = content
  const name = filePath.split(/[\\/]/).pop()
  fileNameText.textContent = name
  setWindowTitle(name, filePath)
  zoomControls.classList.add('visible')

  // Reset scroll position before rendering so the new content starts at top.
  // Without this, an in-flight scroll event from the innerHTML swap can write a stale value into the session.
  const previewWrap = document.getElementById('preview-wrap')
  if (previewWrap) previewWrap.scrollTop = 0

  if (pushRecent) MDV.recents.pushRecentFile(filePath)
  MDV.recents.saveSession({ activeFile: filePath, scrollTop: 0 })

  await renderMarkdown(content)
}

// ── 네비게이션 진입점 ────────────────────────────────────
async function navigateByLink(targetPath, targetHash) {
  const previewWrap = document.getElementById('preview-wrap')

  if (navIndex < 0 && currentFilePath) {
    navHistory.push({ path: currentFilePath, hash: null, scrollTop: previewWrap.scrollTop })
    navIndex = 0
  } else if (navIndex >= 0) {
    navHistory[navIndex].scrollTop = previewWrap.scrollTop
  }

  navHistory.length = navIndex + 1
  navHistory.push({ path: targetPath, hash: targetHash || null, scrollTop: 0 })
  navIndex++

  await applyNavEntry(navHistory[navIndex])
}

async function applyNavEntry(entry) {
  const previewWrap = document.getElementById('preview-wrap')
  if (entry.path !== currentFilePath) {
    const treeEl = Array.from(fileTree.querySelectorAll('.tree-item[data-path]'))
      .find(el => el.dataset.path === entry.path)
    await openFile(entry.path, treeEl, { resetNav: false, pushRecent: false })
  }
  requestAnimationFrame(() => {
    if (entry.hash) {
      const target = preview.querySelector(`#${CSS.escape(entry.hash)}`) ||
                     preview.querySelector(`[id="${entry.hash}"]`)
      if (target) { target.scrollIntoView({ behavior: 'smooth', block: 'start' }); return }
    }
    previewWrap.scrollTo(0, entry.scrollTop || 0)
  })
}

async function navBack() {
  if (navIndex <= 0) return
  navHistory[navIndex].scrollTop = document.getElementById('preview-wrap').scrollTop
  navIndex--
  await applyNavEntry(navHistory[navIndex])
}

async function navForward() {
  if (navIndex >= navHistory.length - 1) return
  navHistory[navIndex].scrollTop = document.getElementById('preview-wrap').scrollTop
  navIndex++
  await applyNavEntry(navHistory[navIndex])
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

  // 2) 페이지 내 앵커 (#id) — history에 push
  if (href.startsWith('#')) {
    e.preventDefault()
    if (!currentFilePath) return
    const id = decodeURIComponent(href.slice(1))
    await navigateByLink(currentFilePath, id)
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

  // 존재하지 않으면 확장자 무관 navigateByLink로 → File not found 프리뷰 + history 포함
  if (!exists) {
    await navigateByLink(resolved, null)
    return
  }

  if (ext === 'md' || ext === 'markdown') {
    await navigateByLink(resolved, hashPart ? decodeURIComponent(hashPart) : null)
  } else {
    invoke('open_path_cmd', { path: resolved })
  }
})

// ── 마우스 back/forward 버튼 ─────────────────────────────
window.addEventListener('mouseup', e => {
  if (e.button === 3) { e.preventDefault(); navBack() }
  if (e.button === 4) { e.preventDefault(); navForward() }
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
}

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
function buildToc() {
  tocList.innerHTML = ''
  const headings = preview.querySelectorAll('h1,h2,h3,h4,h5,h6')

  if (!headings.length) {
    tocList.innerHTML = '<div style="padding:12px;color:var(--text-dim);font-size:12px">No headings</div>'
    return
  }

  headings.forEach((h, i) => {
    if (!h.id) h.id = `heading-${i}`

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
      el.addEventListener('click', () => openFile(f.path, el))
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

// pickers — implementations land in Task 5 (workspace) and use existing openFile (file)
async function pickWorkspace(entry) {
  await openWorkspaceByPath(entry.path)
}
async function pickFile(entry) {
  // If the picked file is in the current workspace tree, find its row to highlight it.
  // If it's cross-workspace, treeEl will be null and tree highlight stays on the prior file
  // (known limitation — see spec §14).
  const treeEl = fileTree.querySelector(`.tree-item[data-path="${CSS.escape(entry.path)}"]`)
  await openFile(entry.path, treeEl)
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
