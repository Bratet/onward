import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { detectEngines, INSTALL_LINKS, shellPath } from './lib/environment.mjs'
import { startServer } from './lib/server.mjs'
import { readDesktopSettings } from './lib/settings.mjs'
import {
  checkForUpdates,
  downloadUpdate,
  installUpdate,
  openDownload,
  RELEASES,
  setAutoUpdate,
  setupUpdates,
  updateState,
} from './lib/updater.mjs'
import { runOnboarding } from './lib/onboarding.mjs'
import { pickWorkspace, savedWorkspace } from './lib/workspace.mjs'

const here = dirname(fileURLToPath(import.meta.url))
// Linux takes the window icon from here; macOS and Windows read the one built into the app.
const icon = join(here, 'resources', 'icon.png')
// Packaged: resources/server. From source: desktop/build/server (npm run server).
const serverDir = app.isPackaged ? join(process.resourcesPath, 'server') : join(here, 'build', 'server')
const logFile = () => join(app.getPath('logs'), 'server.log')
// CI stamps the commit a release was built from into package.json.
const buildCommit = (() => {
  try {
    return JSON.parse(readFileSync(join(app.getAppPath(), 'package.json'), 'utf-8')).onwardCommit ?? null
  } catch {
    return null
  }
})()

let window = null
let server = null
let workspace = null
// Setup can be closed by hand while Onward starts; that must not quit the app.
let starting = true
// Closes the setup window, which waits on "Getting Onward ready" until the app's window is up.
let closeSetup = null
const path = shellPath()

/**
 * Onward does its AI work through the Claude Code and Codex CLIs signed in on
 * this computer. Onboarding walks a new user through them; on later launches,
 * say so if both have gone missing since.
 */
async function checkEngines() {
  for (;;) {
    const found = await detectEngines({ ...process.env, PATH: path })
    if (found.claude || found.codex) return true
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

function createWindow(page = '') {
  window = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 900,
    minHeight: 600,
    title: 'Onward',
    icon,
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true, preload: join(here, 'preload.cjs') },
  })
  window.once('ready-to-show', () => {
    window.show()
    closeSetup?.()
    closeSetup = null
  })
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
  window.loadURL(`${server.url}${page}`)
}

async function changeWorkspace() {
  const dir = await pickWorkspace(window)
  if (!dir || dir === workspace) return workspace
  workspace = dir
  server?.stop()
  if (await launchServer()) window?.loadURL(`${server.url}/settings`)
  else app.quit()
  return workspace
}

/** Settings is where the version and updates live; the menu item goes there. */
function openUpdateSettings() {
  if (!window) createWindow()
  const target = `${server.url}/settings#app`
  if (window.webContents.getURL() !== target) window.loadURL(target)
  window.focus()
  checkForUpdates()
}

/** Only the app's own pages may use the bridge, never a page opened from a link. */
function handle(channel, fn) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!isLocal(event.senderFrame?.url ?? '')) throw new Error('not allowed')
    return fn(...args)
  })
}

function registerBridge() {
  handle('onward:info', () => ({
    version: app.getVersion(),
    commit: buildCommit,
    platform: process.platform,
    arch: process.arch,
    packaged: app.isPackaged,
    workspace,
    autoUpdate: readDesktopSettings().autoUpdate,
    update: updateState(),
  }))
  handle('onward:check-updates', () => checkForUpdates())
  handle('onward:download-update', () => downloadUpdate())
  handle('onward:install-update', () => installUpdate())
  handle('onward:open-download', () => openDownload())
  handle('onward:release-notes', () => shell.openExternal(`${RELEASES}/tag/v${app.getVersion()}`))
  handle('onward:set-auto-update', (enabled) => setAutoUpdate(enabled))
  handle('onward:change-workspace', () => changeWorkspace())
  handle('onward:open-workspace', () => shell.openPath(workspace))
}

function buildMenu() {
  const isMac = process.platform === 'darwin'
  const onwardItems = [
    { label: 'Check for Updates…', click: openUpdateSettings },
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
        // The same tour Settings offers (src/components/Tour.tsx, TOUR_HREF).
        { label: 'Take the Tour', click: () => { if (window && server) window.loadURL(`${server.url}/?tour=1`) } },
        { type: 'separator' },
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
    // An unpackaged run (make desktop) would otherwise show Electron's icon in the Dock.
    if (!app.isPackaged && process.platform === 'darwin') app.dock.setIcon(icon)
    // ONWARD_DESKTOP_URL lets the shell wrap a running `make dev` while working on the UI.
    const devUrl = process.env.ONWARD_DESKTOP_URL
    workspace = savedWorkspace()
    let firstPage = ''
    if (!devUrl) {
      if (workspace) {
        if (!(await checkEngines())) return app.quit()
      } else {
        const onboarded = await runOnboarding({ here, serverDir, path })
        if (!onboarded) return app.quit()
        workspace = onboarded.workspace
        closeSetup = onboarded.close
        // A new user's first job is to replace the example resume with their own.
        if (onboarded.isNew) firstPage = '/welcome'
      }
      if (!(await launchServer())) return app.quit()
    } else {
      server = { url: devUrl.replace(/\/$/, ''), stop: () => {} }
    }
    registerBridge()
    buildMenu()
    createWindow(firstPage)
    starting = false
    setupUpdates()

    app.on('activate', () => {
      if (!window && server) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' && !starting) app.quit()
  })
  app.on('before-quit', () => server?.stop())
}
