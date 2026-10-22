import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { existsSync } from 'fs'
import { basename, join } from 'path'
import { detectEngines, INSTALL_LINKS } from './environment.mjs'
import { createWorkspace, isEmptyFolder, looksLikeWorkspace, saveWorkspace } from './workspace.mjs'

/** What a folder the user picked means: their existing data, a fresh place, or a parent to create Onward/ in. */
function describeFolder(dir) {
  if (looksLikeWorkspace(dir)) return { path: dir, kind: 'existing' }
  if (!existsSync(dir) || isEmptyFolder(dir) || basename(dir) === 'Onward') return { path: dir, kind: 'new' }
  return { path: join(dir, 'Onward'), kind: 'new' }
}

/**
 * The first-launch walkthrough (desktop/onboarding/). Resolves with the chosen
 * workspace and whether it was just created, or null if the window was closed.
 */
export function runOnboarding({ here, serverDir, path }) {
  return new Promise((resolve) => {
    const window = new BrowserWindow({
      width: 760,
      height: 640,
      resizable: false,
      maximizable: false,
      title: 'Welcome to Onward',
      show: false,
      webPreferences: { contextIsolation: true, sandbox: true, preload: join(here, 'onboarding', 'preload.cjs') },
    })
    let result = null
    const handlers = {
      'onboarding:defaults': () => describeFolder(join(app.getPath('documents'), 'Onward')),
      'onboarding:pick-folder': async (_event, purpose) => {
        const { canceled, filePaths } = await dialog.showOpenDialog(window, {
          title: purpose === 'existing' ? 'Choose your Onward folder' : 'Choose where to save your documents',
          properties: ['openDirectory', 'createDirectory'],
        })
        return canceled || !filePaths[0] ? null : describeFolder(filePaths[0])
      },
      'onboarding:check-tools': () => detectEngines({ ...process.env, PATH: path }),
      'onboarding:open-link': (_event, tool) => {
        if (INSTALL_LINKS[tool]) shell.openExternal(INSTALL_LINKS[tool])
      },
      'onboarding:finish': (_event, { folder, fullName }) => {
        const chosen = describeFolder(String(folder))
        if (chosen.kind === 'existing') {
          result = { workspace: saveWorkspace(chosen.path), isNew: false }
        } else {
          const name = String(fullName ?? '').trim()
          if (!name) throw new Error('Your name is needed for your resume.')
          const workspace = createWorkspace(chosen.path, { fullName: name }, serverDir)
          result = { workspace, isNew: true }
        }
        return result
      },
    }
    for (const [channel, fn] of Object.entries(handlers)) {
      ipcMain.handle(channel, (event, ...args) => {
        if (event.sender !== window.webContents) throw new Error('not allowed')
        return fn(event, ...args)
      })
    }
    window.once('ready-to-show', () => window.show())
    window.on('closed', () => {
      for (const channel of Object.keys(handlers)) ipcMain.removeHandler(channel)
      resolve(result)
    })
    window.setMenuBarVisibility(false)
    window.loadFile(join(here, 'onboarding', 'index.html'))
  })
}
