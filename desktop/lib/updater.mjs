import { app, BrowserWindow, dialog, shell } from 'electron'
import updater from 'electron-updater'
import { readDesktopSettings, writeDesktopSettings } from './settings.mjs'

const { autoUpdater } = updater
export const RELEASES = 'https://github.com/Bratet/onward/releases'
const EVERY_FOUR_HOURS = 4 * 60 * 60 * 1000

/**
 * What Settings shows. status is one of: unsupported (running from source),
 * idle, checking, up-to-date, available, downloading, ready, manual (an
 * unsigned macOS build that can't replace itself), error.
 */
let state = { status: app.isPackaged ? 'idle' : 'unsupported', version: null, progress: null, error: null, checkedAt: null }
// A check started from Settings reports in Settings; a background one may raise a dialog.
let fromSettings = false
let timer = null

function update(patch) {
  state = { ...state, ...patch }
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send('onward:update-state', state)
}

export const updateState = () => state

/**
 * Every push to main publishes a GitHub release (.github/workflows/desktop.yml).
 * With automatic updates on, the app checks on launch and every four hours and
 * downloads in the background; otherwise it only checks when asked to.
 */
export function setupUpdates() {
  if (!app.isPackaged) return
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => update({ status: 'checking', error: null }))
  autoUpdater.on('update-not-available', () => update({ status: 'up-to-date', version: null, checkedAt: Date.now() }))
  autoUpdater.on('update-available', (info) => {
    update({ status: autoUpdater.autoDownload ? 'downloading' : 'available', version: info.version, progress: 0, checkedAt: Date.now() })
  })
  autoUpdater.on('download-progress', (progress) => update({ status: 'downloading', progress: Math.round(progress.percent) }))
  autoUpdater.on('update-downloaded', async (info) => {
    update({ status: 'ready', version: info.version, progress: 100 })
    if (fromSettings) return
    const { response } = await dialog.showMessageBox({
      type: 'info',
      message: `Onward ${info.version} is ready`,
      detail: 'Restart now to use it, or it installs the next time you quit.',
      buttons: ['Restart Now', 'Later'],
      defaultId: 0,
      cancelId: 1,
    })
    if (response === 0) installUpdate()
  })
  autoUpdater.on('error', async (err) => {
    // An unsigned macOS build cannot replace itself, so hand over the download instead.
    if (state.version && (state.status === 'downloading' || state.status === 'available')) {
      update({ status: 'manual', error: null })
      if (fromSettings) return
      const { response } = await dialog.showMessageBox({
        type: 'info',
        message: `Onward ${state.version} is available`,
        detail: "It couldn't install itself on this computer. Download it and replace the app.",
        buttons: ['Download', 'Later'],
        defaultId: 0,
        cancelId: 1,
      })
      if (response === 0) openDownload()
      return
    }
    update({ status: 'error', error: String(err?.message || err).split('\n')[0] })
  })

  scheduleChecks()
}

function scheduleChecks() {
  clearInterval(timer)
  timer = null
  if (!readDesktopSettings().autoUpdate) return
  checkForUpdates(false)
  timer = setInterval(() => checkForUpdates(false), EVERY_FOUR_HOURS)
}

export function checkForUpdates(manual = true) {
  if (!app.isPackaged || ['checking', 'downloading', 'ready'].includes(state.status)) return state
  fromSettings = manual
  autoUpdater.autoDownload = readDesktopSettings().autoUpdate
  autoUpdater.checkForUpdates().catch(() => { /* reported through the 'error' event */ })
  return state
}

export function downloadUpdate() {
  if (state.status !== 'available') return state
  fromSettings = true
  update({ status: 'downloading', progress: 0 })
  autoUpdater.downloadUpdate().catch(() => { /* reported through the 'error' event */ })
  return state
}

export function installUpdate() {
  if (state.status === 'ready') autoUpdater.quitAndInstall()
}

export function openDownload() {
  shell.openExternal(state.version ? `${RELEASES}/tag/v${state.version}` : `${RELEASES}/latest`)
}

export function setAutoUpdate(enabled) {
  writeDesktopSettings({ autoUpdate: Boolean(enabled) })
  if (app.isPackaged) scheduleChecks()
  return Boolean(enabled)
}
