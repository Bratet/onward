import { app, dialog } from 'electron'
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const settingsFile = () => join(app.getPath('userData'), 'desktop.json')

function readSettings() {
  try {
    return JSON.parse(readFileSync(settingsFile(), 'utf-8'))
  } catch {
    return {}
  }
}

function saveWorkspace(workspace) {
  writeFileSync(settingsFile(), JSON.stringify({ ...readSettings(), workspace }, null, 2))
  return workspace
}

/** The folder holding the user's resumes, applications and state, or null before one is chosen. */
export function savedWorkspace() {
  const { workspace } = readSettings()
  return workspace && existsSync(workspace) ? workspace : null
}

function looksLikeWorkspace(dir) {
  return existsSync(join(dir, 'state')) || existsSync(join(dir, 'resumes'))
}

/** Lets the user point at an existing workspace (e.g. a clone of their data repo). */
export async function pickWorkspace(window) {
  const { canceled, filePaths } = await dialog.showOpenDialog(window, {
    title: 'Choose your Onward workspace folder',
    properties: ['openDirectory', 'createDirectory'],
  })
  if (canceled || !filePaths[0]) return null
  const dir = filePaths[0]
  if (!looksLikeWorkspace(dir)) {
    const { response } = await dialog.showMessageBox(window, {
      type: 'warning',
      message: 'This folder does not look like an Onward workspace',
      detail: `${dir} has no state/ or resumes/ folder. Onward will create what it needs there.`,
      buttons: ['Use It Anyway', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
    })
    if (response !== 0) return null
  }
  return saveWorkspace(dir)
}

/** First launch: reuse an existing workspace, or start from the bundled sample data. */
export async function chooseWorkspace(serverDir) {
  for (;;) {
    const { response } = await dialog.showMessageBox({
      type: 'question',
      message: 'Where is your Onward data?',
      detail:
        'Pick the folder that holds your resumes, applications and state (for example your private data repo), ' +
        'or start with sample data in Documents/Onward and replace it with your own later.',
      buttons: ['Choose Folder…', 'Start with Sample Data', 'Quit'],
      defaultId: 0,
      cancelId: 2,
    })
    if (response === 2) return null
    if (response === 0) {
      const dir = await pickWorkspace(null)
      if (dir) return dir
      continue
    }
    const dir = join(app.getPath('documents'), 'Onward')
    if (!existsSync(dir)) {
      cpSync(join(serverDir, 'examples', 'workspace'), dir, { recursive: true })
      // The installer drops empty folders.
      mkdirSync(join(dir, 'applications'), { recursive: true })
    }
    return saveWorkspace(dir)
  }
}
