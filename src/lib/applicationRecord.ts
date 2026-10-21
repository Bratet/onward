import { stat } from 'fs/promises'
import { join } from 'path'
import { readDoc, type Application, type FolderDoc } from './applications'
import { APP_FILES, PATHS } from './paths'
import { parsePostingSource, postingHost, type PostingSource } from './postingSource'
import { listSkillRuns } from './skills/runs'
import type { ApplicationWorkspace } from './workspaces'

/**
 * Everything collected for one application, gathered for the "Job & record"
 * tab: the posting as it was saved, every file with its date, the readable
 * notes, and a timeline. Read-only; it never writes.
 */

export interface RecordFile extends FolderDoc {
  modifiedAt: string | null
  /** Inline text for small markdown files, so they can be reread without opening a new tab. */
  text: string | null
}

export interface TimelineEvent {
  at: string
  label: string
  detail?: string
}

export interface ApplicationRecord {
  posting: PostingSource & { savedAt: string | null }
  files: RecordFile[]
  timeline: TimelineEvent[]
  runs: { total: number; failed: number }
}

/** Files shown inline. jd.md has its own panel; the YAML and JSON are machine inputs. */
const INLINE_TEXT = /\.(md|txt)$/i
const INLINE_LIMIT = 200_000

export async function applicationRecord(app: Application, workspace: ApplicationWorkspace | null): Promise<ApplicationRecord> {
  const folder = app.folder?.folder
  const files: RecordFile[] = folder ? await Promise.all(app.folder!.docs.map(async (doc) => {
    let modifiedAt: string | null = null
    try { modifiedAt = (await stat(join(PATHS.applications, folder, doc.name))).mtime.toISOString() } catch {}
    const inline = doc.name !== APP_FILES.jd && INLINE_TEXT.test(doc.name) && doc.size <= INLINE_LIMIT
    return { ...doc, modifiedAt, text: inline ? await readDoc(folder, doc.name) : null }
  })) : []

  const jd = folder ? await readDoc(folder, APP_FILES.jd) : null
  const generalUrl = workspace?.generalDetails?.url || null
  const source = parsePostingSource(jd)
  const posting = {
    ...source,
    url: source.url ?? generalUrl,
    host: source.host ?? (generalUrl ? postingHost(generalUrl) : null),
    // A folder move resets file times, so the application's own date wins when it is earlier.
    savedAt: [files.find((file) => file.name === APP_FILES.jd)?.modifiedAt, app.row?.date || app.folder?.date, workspace?.createdAt]
      .filter((value): value is string => !!value).sort()[0] ?? null,
  }

  const runs = app.folder ? await listSkillRuns({ applicationKey: app.key, limit: 1000 }) : []
  return {
    posting,
    files,
    timeline: timeline(app, workspace, files),
    runs: { total: runs.length, failed: runs.filter((run) => run.status === 'failed').length },
  }
}

function timeline(app: Application, workspace: ApplicationWorkspace | null, files: RecordFile[]): TimelineEvent[] {
  const events: TimelineEvent[] = []
  // Workspaces were only created when an older application was first opened in
  // the app, so the tracker date wins when it is earlier.
  const created = [app.row?.date || app.folder?.date, workspace?.createdAt].filter((value): value is string => !!value).sort()[0]
  if (created) events.push({ at: created, label: 'Application created', detail: app.row ? `Tracker row #${app.row.id}` : undefined })
  if (workspace?.fit.completedAt && workspace.fit.report) {
    events.push({ at: workspace.fit.completedAt, label: 'Fit analysis', detail: `${workspace.fit.report.verdict} fit` })
  }
  // File times are when the PDF was last written, which a folder move or a
  // checkout also resets; one later than the applied date says nothing about
  // what was sent, so it is left out.
  const applied = workspace?.appliedAt ?? null
  for (const [key, label] of [['pdf', 'Resume PDF saved'], ['letterPdf', 'Cover letter PDF saved']] as const) {
    const file = files.find((entry) => entry.key === key && entry.name.endsWith('.pdf'))
    if (file?.modifiedAt && (!applied || file.modifiedAt <= applied)) events.push({ at: file.modifiedAt, label, detail: file.name })
  }
  if (applied) events.push({ at: applied, label: 'Marked as sent' })
  return events.sort((a, b) => a.at.localeCompare(b.at))
}
