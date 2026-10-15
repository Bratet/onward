import { randomUUID } from 'crypto'
import { rename, writeFile } from 'fs/promises'
import { join } from 'path'
import { getApplication, readDoc } from './applications'
import { APP_FILES, PATHS } from './paths'
import { normalizePostingUrl, withPostingUrl } from './postingSource'
import { contentHash, readWorkspace, updateWorkspace } from './workspaces'

/**
 * Puts the posting's link on line 1 of jd.md, for applications created before
 * the link was known. Only the source line changes, so a fit report computed
 * for the old text is carried over to the new hash instead of going stale.
 */
export async function setPostingUrl(key: string, input: unknown): Promise<string> {
  const url = normalizePostingUrl(input)
  if (!url) throw new Error('Paste the full posting link, starting with https://')
  const app = await getApplication(key)
  const folder = app?.folder?.folder
  if (!folder) throw new Error('this application has no folder')
  const before = await readDoc(folder, APP_FILES.jd)
  if (before === null) throw new Error(`this application has no ${APP_FILES.jd} to attach the link to`)

  const after = withPostingUrl(before, url)
  if (after === before) return url
  const workspace = await readWorkspace(key)
  const path = join(PATHS.applications, folder, APP_FILES.jd)
  const temp = `${path}.${process.pid}.${randomUUID()}.tmp`
  await writeFile(temp, after, 'utf-8')
  await rename(temp, path)

  const oldHash = contentHash(before)
  if (workspace.fit.jdHash === oldHash) {
    const newHash = contentHash(after)
    await updateWorkspace(key, workspace.revision, (current) => current.fit.jdHash !== oldHash ? current : {
      ...current,
      fit: { ...current.fit, jdHash: newHash, stale: false, basis: current.fit.basis ? { ...current.fit.basis, jdHash: newHash } : current.fit.basis },
    }).catch(() => { /* a concurrent write moved on; the report shows as stale, which is still correct */ })
  }
  return url
}
