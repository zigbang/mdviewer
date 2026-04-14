const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require('electron')
const fs   = require('fs')
const path = require('path')

let mainWindow

function getArgFiles() {
  // electron . file1.md file2.md 또는 portable exe file1.md file2.md
  // packaged: process.argv[0]=exe, args from [1]
  // dev:      process.argv[0]=electron, [1]='.', args from [2]
  const startIdx = app.isPackaged ? 1 : 2
  return process.argv.slice(startIdx).filter(arg => {
    if (arg.startsWith('-')) return false
    const ext = path.extname(arg).toLowerCase()
    return ['.md', '.markdown'].includes(ext)
  }).map(f => path.resolve(f))
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    icon: path.join(__dirname, 'icon.ico'),
    backgroundColor: '#1e1e1e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  mainWindow.loadFile('renderer/index.html')
  Menu.setApplicationMenu(null)

  // 커맨드라인으로 전달된 .md 파일 열기
  mainWindow.webContents.once('did-finish-load', () => {
    const files = getArgFiles()
    if (files.length) {
      mainWindow.webContents.send('files-opened', files)
      mainWindow.setTitle(`MD Viewer — ${files[0]}`)
    }
  })
}


function buildFileTree(dirPath) {
  try {
    const name = path.basename(dirPath)
    const stat  = fs.statSync(dirPath)

    if (stat.isFile()) {
      const ext = path.extname(dirPath).toLowerCase()
      if (!['.md', '.markdown'].includes(ext)) return null
      return { type: 'file', name, path: dirPath }
    }

    if (stat.isDirectory()) {
      if (name.startsWith('.') || name === 'node_modules') return null
      const children = fs.readdirSync(dirPath)
        .map(child => buildFileTree(path.join(dirPath, child)))
        .filter(Boolean)
        .sort((a, b) => {
          if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
          return a.name.localeCompare(b.name, 'ko')
        })
      if (!children.length) return null
      return { type: 'dir', name, path: dirPath, children }
    }
  } catch (_) {}
  return null
}

ipcMain.handle('open-folder-dialog', async () => {
  const { filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Markdown Folder',
    properties: ['openDirectory']
  })
  if (!filePaths.length) return null
  const rootPath = filePaths[0]
  const tree = buildFileTree(rootPath)
  if (mainWindow) mainWindow.setTitle(`MD Viewer — ${rootPath}`)
  return { rootPath, tree }
})

ipcMain.handle('read-file', (_, filePath) => {
  return fs.readFileSync(filePath, 'utf-8')
})

ipcMain.handle('toggle-fullscreen', () => {
  if (!mainWindow) return
  mainWindow.setFullScreen(!mainWindow.isFullScreen())
})

ipcMain.handle('open-external', (_, url) => {
  shell.openExternal(url)
})

ipcMain.handle('translate-markdown', async (_, { markdown, targetLang, apiToken }) => {
  const langNames = { 'zh-CN': 'Simplified Chinese', 'en': 'English', 'ko': 'Korean' }
  const langName = langNames[targetLang] || targetLang

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiToken,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      messages: [{
        role: 'user',
        content: `Translate the following Markdown document to ${langName}. Keep all Markdown formatting, code blocks, links, and mermaid diagrams intact. Only translate the human-readable text. Return ONLY the translated Markdown, no explanations.\n\n${markdown}`
      }]
    })
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`API error ${res.status}: ${err}`)
  }

  const data = await res.json()
  return data.content[0].text
})

app.whenReady().then(createWindow)
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
