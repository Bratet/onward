import { app } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

/** The desktop shell's own settings; the app's settings stay in the workspace. */
const file = () => join(app.getPath('userData'), 'desktop.json')

const DEFAULTS = { workspace: null, autoUpdate: true }

export function readDesktopSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(readFileSync(file(), 'utf-8')) }
  } catch {
    return { ...DEFAULTS }
  }
}

export function writeDesktopSettings(patch) {
  const next = { ...readDesktopSettings(), ...patch }
  writeFileSync(file(), JSON.stringify(next, null, 2))
  return next
}
