import { dialog } from 'electron'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
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

/** Same as slugify in src/lib/repoRoot.ts: resume filenames are cv-<slug>.yaml. */
function slugify(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Puts the user's own name and email on a sample resume and drops the sample's
 * phone, website and profiles, so nothing invented ends up on a real CV.
 */
function personalize(yaml, fullName, email) {
  const lines = yaml.split('\n')
  const out = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^ {2}name: /.test(line)) out.push(`  name: ${JSON.stringify(fullName)}`)
    else if (/^ {2}email: /.test(line)) { if (email) out.push(`  email: ${JSON.stringify(email)}`) }
    else if (/^ {2}(phone|website): /.test(line)) continue
    else if (/^ {2}social_networks:/.test(line)) { while (/^ {4}/.test(lines[i + 1] ?? '')) i++ }
    else out.push(line)
  }
  return out.join('\n')
}

/**
 * A new workspace: the bundled sample's skills, empty tracker and starter
 * resumes, made out to the user. Their own resume replaces the starter in Profile.
 */
export function createWorkspace(dir, { fullName, email }, serverDir) {
  mkdirSync(dir, { recursive: true })
  cpSync(join(serverDir, 'examples', 'workspace'), dir, { recursive: true })
  // The installer drops empty folders.
  mkdirSync(join(dir, 'applications'), { recursive: true })
  writeFileSync(join(dir, 'config', 'candidate.json'), JSON.stringify({ fullName, confidentialTerms: [] }, null, 2) + '\n')

  const slug = slugify(fullName) || 'candidate'
  const masters = join(dir, 'resumes', 'masters')
  const own = join(dir, 'resumes', 'own')
  const folders = [masters, ...(existsSync(own) ? readdirSync(own).map((name) => join(own, name)) : [])]
  for (const folder of folders) {
    for (const name of readdirSync(folder).filter((file) => file.endsWith('.yaml'))) {
      const from = join(folder, name)
      writeFileSync(from, personalize(readFileSync(from, 'utf-8'), fullName, email))
      // General resumes are found by the candidate's slug; masters keep their fixed names.
      if (folder !== masters && name.startsWith('cv-')) renameSync(from, join(folder, `cv-${slug}.yaml`))
    }
  }
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
