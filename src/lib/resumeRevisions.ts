import { mkdir, readdir, rm, writeFile } from 'fs/promises'
import { isAbsolute, join, relative, sep } from 'path'
import { PATHS } from './paths'

/** How many earlier versions of each resume source are kept. */
export const KEPT_REVISIONS = 20

const REVISION_FILE = /^\d{4}-\d{2}-\d{2}T[\d-]+Z-\d{4}\.yaml$/

/** Orders two saves within the same millisecond, so the name alone says which is newer. */
let sequence = 0

/**
 * Where the earlier versions of one resume source live: its path under
 * `workspace/resumes/`, mirrored under `state/resume-revisions/` without the
 * extension, so the two masters, which share a folder, keep separate histories.
 */
export function revisionDir(file: string): string {
  const rel = relative(PATHS.resumes, file)
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel) || !rel.endsWith('.yaml')) {
    throw new Error(`${file} is not a resume source`)
  }
  return join(PATHS.resumeRevisions, rel.slice(0, -'.yaml'.length))
}

/** The kept versions of a resume source, newest first. */
export async function listRevisions(file: string): Promise<string[]> {
  try {
    return (await readdir(revisionDir(file))).filter((name) => REVISION_FILE.test(name)).sort().reverse()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}

/**
 * Keep `previous`, the text a save is about to replace, as the newest version
 * of `file`, then drop the oldest beyond `KEPT_REVISIONS`. Returns the kept
 * file's path.
 */
export async function keepRevision(file: string, previous: string): Promise<string> {
  const dir = revisionDir(file)
  await mkdir(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  sequence = (sequence + 1) % 10_000
  const kept = join(dir, `${stamp}-${String(sequence).padStart(4, '0')}.yaml`)
  await writeFile(kept, previous, { encoding: 'utf-8', flag: 'wx' })
  const older = (await listRevisions(file)).slice(KEPT_REVISIONS)
  await Promise.all(older.map((name) => rm(join(dir, name), { force: true })))
  return kept
}
