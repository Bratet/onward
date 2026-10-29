import { app, BrowserWindow, dialog, ipcMain, nativeTheme, screen, shell } from 'electron'
import { execFile } from 'child_process'
import { existsSync } from 'fs'
import { userInfo } from 'os'
import { basename, join } from 'path'
import { detectEngines, INSTALL_LINKS } from './environment.mjs'
import { createWorkspace, isEmptyFolder, looksLikeWorkspace, saveWorkspace } from './workspace.mjs'

/** The setup page's --bg and --surface (onboarding.css), for the parts of the window the page doesn't paint. */
function theme() {
  const dark = nativeTheme.shouldUseDarkColors
  const background = dark ? '#110d0a' : '#f3f0ea'
  return { background, overlay: { color: background, symbolColor: dark ? '#ede7de' : '#282019', height: 40 } }
}

/**
 * The page draws its own title bar so the window reads as one surface instead of
 * a white system bar over a dark page. Windows keeps its buttons as an overlay,
 * macOS its traffic lights; Linux keeps the system frame.
 */
function titleBar() {
  if (process.platform === 'win32') return { titleBarStyle: 'hidden', titleBarOverlay: theme().overlay }
  if (process.platform === 'darwin') return { titleBarStyle: 'hiddenInset' }
  return {}
}

/** What a folder the user picked means: their existing data, a fresh place, or a parent to create Onward/ in. */
function describeFolder(dir) {
  if (looksLikeWorkspace(dir)) return { path: dir, kind: 'existing' }
  if (!existsSync(dir) || isEmptyFolder(dir) || basename(dir) === 'Onward') return { path: dir, kind: 'new' }
  return { path: join(dir, 'Onward'), kind: 'new' }
}

/**
 * The account's full name, to fill in the name field: macOS keeps it in the
 * directory service, Linux in the passwd comment. Windows has no quick source,
 * so the field starts empty there.
 */
function accountName() {
  const command = process.platform === 'darwin' ? ['id', ['-F']] : process.platform === 'linux' ? ['getent', ['passwd', userInfo().username]] : null
  if (!command) return Promise.resolve('')
  return new Promise((resolve) => {
    execFile(command[0], command[1], { timeout: 2000 }, (error, stdout) => {
      if (error) return resolve('')
      const text = String(stdout).trim()
      const name = process.platform === 'linux' ? (text.split(':')[4] ?? '').split(',')[0] : text
      // A login name ("jdoe") is no better than an empty field.
      resolve(/\s/.test(name.trim()) ? name.trim() : '')
    })
  })
}

/**
 * The first-launch setup (desktop/onboarding/). Resolves as soon as the user
 * has chosen, with the workspace, whether it was just created, and `close`:
 * the window stays on "Getting Onward ready" until the caller's own window is
 * up and closes it. Resolves with null if the window is closed before that.
 */
export function runOnboarding({ here, serverDir, path }) {
  return new Promise((resolve) => {
    // Never larger than the screen: at 150% scaling a laptop has well under 720 points of height.
    const { width: wide, height: tall } = screen.getPrimaryDisplay().workAreaSize
    const window = new BrowserWindow({
      width: Math.min(1040, wide - 40),
      height: Math.min(700, tall - 40),
      minWidth: Math.min(820, wide - 40),
      minHeight: Math.min(560, tall - 40),
      maximizable: false,
      fullscreenable: false,
      title: 'Welcome to Onward',
      icon: join(here, 'resources', 'icon.png'),
      show: false,
      backgroundColor: theme().background,
      ...titleBar(),
      webPreferences: { contextIsolation: true, sandbox: true, preload: join(here, 'onboarding', 'preload.cjs') },
    })
    const retheme = () => {
      window.setBackgroundColor(theme().background)
      if (process.platform === 'win32') window.setTitleBarOverlay(theme().overlay)
    }
    nativeTheme.on('updated', retheme)
    const close = () => { if (!window.isDestroyed()) window.close() }
    let result = null
    const handlers = {
      'onboarding:defaults': async () => ({ folder: describeFolder(join(app.getPath('documents'), 'Onward')), fullName: await accountName() }),
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
        resolve({ ...result, close })
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
      nativeTheme.off('updated', retheme)
      for (const channel of Object.keys(handlers)) ipcMain.removeHandler(channel)
      resolve(null)
    })
    window.setMenuBarVisibility(false)
    window.loadFile(join(here, 'onboarding', 'index.html'))
  })
}
