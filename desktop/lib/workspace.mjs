import { dialog } from 'electron'
import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { readDesktopSettings, writeDesktopSettings } from './settings.mjs'

export function saveWorkspace(workspace) {
  writeDesktopSettings({ workspace })
  return workspace
}

/** The folder holding the user's resumes, applications and state, or null before one is chosen. */
export function savedWorkspace() {
  const { workspace } = readDesktopSettings()
  return workspace && existsSync(workspace) ? workspace : null
}

export function looksLikeWorkspace(dir) {
  return existsSync(join(dir, 'state')) || existsSync(join(dir, 'resumes'))
}

export function isEmptyFolder(dir) {
  try {
    return readdirSync(dir).every((name) => name.startsWith('.'))
  } catch {
    return true
  }
}

/**
 * A new workspace: the bundled skills, an empty tracker and the user's name.
 * It has no resume: the app opens on /welcome, where theirs becomes the master
 * and general resumes. The sample's fictional resumes and searches stay out.
 */
export function createWorkspace(dir, { fullName }, serverDir) {
  mkdirSync(dir, { recursive: true })
  const sample = join(serverDir, 'examples', 'workspace')
  cpSync(sample, dir, { recursive: true, filter: (from) => !from.startsWith(join(sample, 'resumes')) })
  // The installer drops empty folders.
  for (const folder of ['applications', join('resumes', 'masters'), join('resumes', 'own')]) mkdirSync(join(dir, folder), { recursive: true })
  writeFileSync(join(dir, 'config', 'candidate.json'), JSON.stringify({ fullName, confidentialTerms: [] }, null, 2) + '\n')
  writeFileSync(join(dir, 'state', 'saved-searches.json'), '[]\n')
  return saveWorkspace(dir)
}

/** Lets the user point at an existing workspace (e.g. a clone of their data repo). */
export async function pickWorkspace(window) {
  const { canceled, filePaths } = await dialog.showOpenDialog(window, {
    title: 'Choose your Onward folder',
    properties: ['openDirectory', 'createDirectory'],
  })
  if (canceled || !filePaths[0]) return null
  const dir = filePaths[0]
  if (!looksLikeWorkspace(dir)) {
    const { response } = await dialog.showMessageBox(window, {
      type: 'warning',
      message: 'This folder does not look like an Onward folder',
      detail: `${dir} has no state/ or resumes/ folder. Onward will create what it needs there.`,
      buttons: ['Use It Anyway', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
    })
    if (response !== 0) return null
  }
  return saveWorkspace(dir)
}
