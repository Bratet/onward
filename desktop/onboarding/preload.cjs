// The onboarding window's API. Sandboxed preloads must be CommonJS.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('onboarding', {
  defaults: () => ipcRenderer.invoke('onboarding:defaults'),
  pickFolder: (purpose) => ipcRenderer.invoke('onboarding:pick-folder', purpose),
  checkTools: () => ipcRenderer.invoke('onboarding:check-tools'),
  openLink: (tool) => ipcRenderer.invoke('onboarding:open-link', tool),
  finish: (choice) => ipcRenderer.invoke('onboarding:finish', choice),
})
