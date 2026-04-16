const { contextBridge, ipcRenderer, webFrame } = require('electron')

contextBridge.exposeInMainWorld('api', {
  onFolderOpened:  (cb) => ipcRenderer.on('folder-opened', (_, data) => cb(data)),
  onFilesOpened:   (cb) => ipcRenderer.on('files-opened', (_, data) => cb(data)),
  openFolderDialog: ()  => ipcRenderer.invoke('open-folder-dialog'),
  readFile:    (p)      => ipcRenderer.invoke('read-file', p),
  openExternal:(url)    => ipcRenderer.invoke('open-external', url),
  resolveRelative: (from, rel) => ipcRenderer.invoke('resolve-relative', from, rel),
  openPath:     (p)     => ipcRenderer.invoke('open-path', p),
  zoomIn:       () => webFrame.setZoomLevel(webFrame.getZoomLevel() + 1),
  zoomOut:      () => webFrame.setZoomLevel(webFrame.getZoomLevel() - 1),
  zoomReset:    () => webFrame.setZoomLevel(0),
  getZoomLevel: () => webFrame.getZoomLevel(),
  setZoomLevel: (l) => webFrame.setZoomLevel(l),
  toggleFullscreen: () => ipcRenderer.invoke('toggle-fullscreen'),
  translateMarkdown: (opts) => ipcRenderer.invoke('translate-markdown', opts)
})
