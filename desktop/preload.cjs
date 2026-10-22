// Gives the app's pages a narrow window.onwardDesktop API, used by Settings.
// Sandboxed preloads must be CommonJS and may only require 'electron'.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('onwardDesktop', {
  info: () => ipcRenderer.invoke('onward:info'),
  checkForUpdates: () => ipcRenderer.invoke('onward:check-updates'),
  downloadUpdate: () => ipcRenderer.invoke('onward:download-update'),
  installUpdate: () => ipcRenderer.invoke('onward:install-update'),
  openDownload: () => ipcRenderer.invoke('onward:open-download'),
  openReleaseNotes: () => ipcRenderer.invoke('onward:release-notes'),
  setAutoUpdate: (enabled) => ipcRenderer.invoke('onward:set-auto-update', Boolean(enabled)),
  changeWorkspace: () => ipcRenderer.invoke('onward:change-workspace'),
  openWorkspace: () => ipcRenderer.invoke('onward:open-workspace'),
  onUpdateState: (listener) => {
    const handler = (_event, state) => listener(state)
    ipcRenderer.on('onward:update-state', handler)
    return () => ipcRenderer.removeListener('onward:update-state', handler)
  },
})
