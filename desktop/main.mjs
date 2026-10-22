import { app, BrowserWindow, dialog, Menu, shell } from 'electron'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { detectEngines, INSTALL_LINKS, shellPath } from './lib/environment.mjs'
import { startServer } from './lib/server.mjs'
import { checkForUpdates, setupUpdates } from './lib/updater.mjs'
import { chooseWorkspace, pickWorkspace, savedWorkspace } from './lib/workspace.mjs'

const here = dirname(fileURLToPath(import.meta.url))
// Packaged: resources/server. From source: desktop/build/server (npm run server).
const serverDir = app.isPackaged ? join(process.resourcesPath, 'server') : join(here, 'build', 'server')
const logFile = () => join(app.getPath('logs'), 'server.log')

let window = null
let server = null
let workspace = null
const path = shellPath()

/**
 * Onward does its AI work through the Claude Code and Codex CLIs signed in on
 * this computer. Without either one it cannot tailor anything, so say how to
 * get one before opening the app.
 */
async function checkEngines() {
  for (;;) {
    const found = detectEngines({ ...process.env, PATH: path })
    if (found.claude || found.codex) {
      if (!found.rendercv) {
        const { response } = await dialog.showMessageBox({
          type: 'warning',
          message: 'RenderCV is not installed',
          detail: 'Onward needs RenderCV 2.8 or newer to make PDFs. Install it with:\n\npip install "rendercv>=2.8"',
          buttons: ['Continue', 'Open RenderCV Docs'],
          defaultId: 0,
        })
        if (response === 1) shell.openExternal(INSTALL_LINKS.rendercv)
      }
      return true
    }
    const { response } = await dialog.showMessageBox({
      type: 'warning',
      message: 'Install Claude Code or Codex to use Onward',
      detail:
        'Onward uses the Claude Code or Codex command-line tool on this computer, signed in with your own subscription. ' +
        'Neither was found.\n\nInstall one, sign in once in a terminal (claude, or codex login), then choose Check Again.',
      buttons: ['Check Again', 'Get Claude Code', 'Get Codex', 'Continue Anyway', 'Quit'],
      defaultId: 0,
      cancelId: 4,
    })
    if (response === 1) shell.openExternal(INSTALL_LINKS.claude)
    if (response === 2) shell.openExternal(INSTALL_LINKS.codex)
    if (response === 3) return true
    if (response === 4) return false
  }
}

async function launchServer() {
  try {
    server = await startServer({ serverDir, workspace, path, logFile: logFile() })
    return true
  } catch (err) {
    const { response } = await dialog.showMessageBox({
      type: 'error',
      message: "Onward couldn't start",
      detail: `${err.message}.\n\nThe server log is at ${logFile()}`,
      buttons: ['Show Log', 'Quit'],
    })
    if (response === 0) await shell.openPath(logFile())
    return false
  }
}

function isLocal(url) {
  return server && url.startsWith(server.url)
}

function createWindow() {
  window = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 900,
    minHeight: 600,
    title: 'Onward',
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true },
  })
  window.once('ready-to-show', () => window.show())
  // Postings, company pages and docs open in the user's browser, not inside the app.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isLocal(url)) return { action: 'allow' }
    shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    if (isLocal(url)) return
    event.preventDefault()
    shell.openExternal(url)
  })
  window.on('closed', () => { window = null })
  window.loadURL(server.url)
}

async function changeWorkspace() {
  const dir = await pickWorkspace(window)
  if (!dir || dir === workspace) return
  workspace = dir
  server?.stop()
  if (await launchServer()) window?.loadURL(server.url)
  else app.quit()
}

function buildMenu() {
  const isMac = process.platform === 'darwin'
  const onwardItems = [
    { label: 'Check for Updates…', click: () => checkForUpdates() },
    { type: 'separator' },
    { label: 'Change Workspace Folder…', click: changeWorkspace },
    { label: 'Open Workspace Folder', click: () => shell.openPath(workspace) },
    { label: 'Show Server Log', click: () => shell.openPath(logFile()) },
  ]
  const template = [
    ...(isMac
      ? [{
          label: app.name,
          submenu: [
            { role: 'about' },
            ...onwardItems,
            { type: 'separator' },
            { role: 'hide' },
            { role: 'hideOthers' },
            { role: 'unhide' },
            { type: 'separator' },
            { role: 'quit' },
          ],
        }]
      : [{ label: 'File', submenu: [...onwardItems, { type: 'separator' }, { role: 'quit' }] }]),
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        { label: 'Onward on GitHub', click: () => shell.openExternal('https://github.com/Bratet/onward') },
        { label: 'Get Claude Code', click: () => shell.openExternal(INSTALL_LINKS.claude) },
        { label: 'Get Codex', click: () => shell.openExternal(INSTALL_LINKS.codex) },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!window) return
    if (window.isMinimized()) window.restore()
    window.focus()
  })

  app.whenReady().then(async () => {
    // ONWARD_DESKTOP_URL lets the shell wrap a running `make dev` while working on the UI.
    const devUrl = process.env.ONWARD_DESKTOP_URL
    workspace = savedWorkspace()
    if (!devUrl) {
      if (!workspace) workspace = await chooseWorkspace(serverDir)
      if (!workspace || !(await checkEngines()) || !(await launchServer())) return app.quit()
    } else {
      server = { url: devUrl.replace(/\/$/, ''), stop: () => {} }
    }
    buildMenu()
    createWindow()
    setupUpdates()

    app.on('activate', () => {
      if (!window && server) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
  app.on('before-quit', () => server?.stop())
}
