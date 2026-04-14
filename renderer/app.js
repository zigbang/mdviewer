/* ════════════════════════════════════════════════════════
   MD Viewer — app.js
   ════════════════════════════════════════════════════════ */

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
let currentFilePath = null
let sidebarVisible  = true
let tocVisible      = true

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
  window.api.openExternal('https://smarthome.zigbang.com/')
})

// ── 전체 화면 ───────────────────────────────────────────
document.getElementById('btn-fullscreen').addEventListener('click', () => {
  window.api.toggleFullscreen()
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

// 저장된 토큰 복원
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
    const translated = await window.api.translateMarkdown({
      markdown: originalMarkdown,
      targetLang: translateLang.value,
      apiToken: token
    })
    translateOverlay.classList.remove('visible')

    const name = currentFilePath.split(/[\\/]/).pop()
    fileNameText.textContent = name + ' (Translated)'
    renderMarkdown(translated)
  } catch (err) {
    translateStatus.textContent = err.message
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
    window.api.toggleFullscreen()
  }
  // Page Up / Page Down / Home / End → 미리보기 스크롤
  const pw = document.getElementById('preview-wrap')
  if (e.key === 'PageDown')  { e.preventDefault(); pw.scrollBy(0, pw.clientHeight * 0.85) }
  if (e.key === 'PageUp')    { e.preventDefault(); pw.scrollBy(0, -pw.clientHeight * 0.85) }
  if (e.key === 'Home')      { e.preventDefault(); pw.scrollTo(0, 0) }
  if (e.key === 'End')       { e.preventDefault(); pw.scrollTo(0, pw.scrollHeight) }
})

// ── 폴더 열기 ────────────────────────────────────────────
btnOpenFolder.addEventListener('click', async () => {
  const result = await window.api.openFolderDialog()
  if (!result) return
  renderFileTree(result.tree, result.rootPath)
})

window.api.onFolderOpened(({ tree, rootPath }) => {
  renderFileTree(tree, rootPath)
})

// ── 커맨드라인 파일 열기 (파일 연결 프로그램) ────────────────
window.api.onFilesOpened(filePaths => {
  const fileList = filePaths.map(fp => ({
    name: fp.split(/[\\/]/).pop(),
    path: fp
  }))
  renderDroppedFiles(fileList)
  const firstItem = fileTree.querySelector('.tree-item[data-path]')
  if (firstItem) firstItem.click()
})

function renderFileTree(tree, rootPath) {
  if (!tree) {
    fileTree.innerHTML = '<div class="empty-hint"><p>📭</p><p>No .md files found</p></div>'
    return
  }
  sidebarRootName.textContent = tree.name || rootPath.split(/[\\/]/).pop()
  fileTree.innerHTML = ''
  // 루트가 파일이면 바로, 디렉토리면 children 렌더
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

  // 디렉토리
  const wrap = document.createElement('div')

  const row = document.createElement('div')
  row.className = 'tree-item tree-dir-row'
  row.style.paddingLeft = `${8 + depth * 12}px`
  row.innerHTML = `<span class="arrow">▶</span><span class="icon">📁</span><span class="label">${node.name}</span>`

  const children = document.createElement('div')
  children.className = 'tree-dir-children collapsed'
  node.children.forEach(child => children.appendChild(createTreeNode(child, depth + 1)))

  row.addEventListener('click', () => {
    const collapsed = children.classList.toggle('collapsed')
    row.classList.toggle('open', !collapsed)
  })

  wrap.appendChild(row)
  wrap.appendChild(children)
  return wrap
}

// ── 파일 열기 ────────────────────────────────────────────
async function openFile(filePath, treeEl) {
  // 파일트리 active 표시
  document.querySelectorAll('.tree-item.active').forEach(e => e.classList.remove('active'))
  if (treeEl) treeEl.classList.add('active')

  const content = await window.api.readFile(filePath)
  currentFilePath = filePath
  originalMarkdown = content
  const name = filePath.split(/[\\/]/).pop()
  fileNameText.textContent = name
  zoomControls.classList.add('visible')

  renderMarkdown(content)
}

// ── Markdown 렌더링 ──────────────────────────────────────
async function renderMarkdown(mdText) {
  // 빈 화면 숨기기
  previewEmpty.classList.add('hidden')
  preview.style.display = 'block'

  // HTML 변환
  preview.innerHTML = marked.parse(mdText)

  // mermaid 렌더링
  await renderMermaid()

  // KaTeX 수식 렌더링
  renderKatex()

  // TOC 생성
  buildToc()

  // 외부 링크 처리
  preview.querySelectorAll('a[href]').forEach(a => {
    const href = a.getAttribute('href')
    if (href.startsWith('http://') || href.startsWith('https://')) {
      a.addEventListener('click', e => {
        e.preventDefault()
        window.api.openExternal(href)
      })
    }
  })
}

// ── Mermaid 렌더링 ───────────────────────────────────────
async function renderMermaid() {
  const blocks = preview.querySelectorAll('.mermaid')
  if (!blocks.length) return

  // mermaid 11.x API
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

  // 각 heading에 id 부여
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
      // active 표시
      document.querySelectorAll('.toc-item').forEach(t => t.classList.remove('active'))
      item.classList.add('active')
    })

    tocList.appendChild(item)
  })

  // 스크롤 시 active TOC 아이템 업데이트
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
        // active 아이템이 TOC 뷰포트 안에 오도록 스크롤
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

// ── Drag & Drop ─────────────────────────────────────────
const dropOverlay = document.getElementById('drop-overlay')
let dragCounter = 0

document.addEventListener('dragenter', e => {
  e.preventDefault()
  dragCounter++
  dropOverlay.classList.add('visible')
})

document.addEventListener('dragleave', e => {
  e.preventDefault()
  dragCounter--
  if (dragCounter <= 0) {
    dragCounter = 0
    dropOverlay.classList.remove('visible')
  }
})

document.addEventListener('dragover', e => {
  e.preventDefault()
})

document.addEventListener('drop', e => {
  e.preventDefault()
  dragCounter = 0
  dropOverlay.classList.remove('visible')

  const files = Array.from(e.dataTransfer.files)
  const mdFiles = files.filter(f => {
    const ext = f.name.split('.').pop().toLowerCase()
    return ext === 'md' || ext === 'markdown'
  })
  if (!mdFiles.length) return

  const fileList = mdFiles.map(f => ({ name: f.name, path: f.path }))
  renderDroppedFiles(fileList)
  // 첫 번째 파일 자동 표시
  const firstItem = fileTree.querySelector('.tree-item[data-path]')
  if (firstItem) firstItem.click()
})

function renderDroppedFiles(files) {
  // 디렉토리별 그룹핑
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
    // 디렉토리가 여러 개이면 디렉토리 헤더 표시
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
