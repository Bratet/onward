import { app, dialog, shell } from 'electron'
import updater from 'electron-updater'

const { autoUpdater } = updater
const RELEASES = 'https://github.com/Bratet/onward/releases/latest'
const EVERY_FOUR_HOURS = 4 * 60 * 60 * 1000

let manualCheck = false
let pendingVersion = null

/**
 * Every push to main publishes a GitHub release (.github/workflows/desktop.yml);
 * this downloads it in the background and offers a restart once it is ready.
 */
export function setupUpdates() {
  if (!app.isPackaged) return
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => { pendingVersion = info.version })
  autoUpdater.on('update-not-available', () => {
    if (manualCheck) dialog.showMessageBox({ message: 'Onward is up to date', detail: `You have version ${app.getVersion()}.` })
    manualCheck = false
  })
  autoUpdater.on('update-downloaded', async (info) => {
    manualCheck = false
    const { response } = await dialog.showMessageBox({
      type: 'info',
      message: `Onward ${info.version} is ready`,
      detail: 'Restart now to use it, or it installs the next time you quit.',
      buttons: ['Restart Now', 'Later'],
      defaultId: 0,
      cancelId: 1,
    })
    if (response === 0) autoUpdater.quitAndInstall()
  })
  autoUpdater.on('error', async (err) => {
    const wasManual = manualCheck
    manualCheck = false
    // An unsigned macOS build cannot replace itself, so hand over the download instead.
    if (pendingVersion) {
      const { response } = await dialog.showMessageBox({
        type: 'info',
        message: `Onward ${pendingVersion} is available`,
        detail: "It couldn't install itself on this computer. Download it and replace the app.",
        buttons: ['Download', 'Later'],
        defaultId: 0,
        cancelId: 1,
      })
      if (response === 0) shell.openExternal(RELEASES)
    } else if (wasManual) {
      dialog.showMessageBox({ type: 'warning', message: "Couldn't check for updates", detail: String(err?.message || err) })
    }
  })

  checkForUpdates(false)
  setInterval(() => checkForUpdates(false), EVERY_FOUR_HOURS)
}

export function checkForUpdates(manual = true) {
  if (!app.isPackaged) {
    if (manual) dialog.showMessageBox({ message: 'Updates only run in the installed app' })
    return
  }
  manualCheck = manual
  autoUpdater.checkForUpdates().catch(() => { /* reported through the 'error' event */ })
}
