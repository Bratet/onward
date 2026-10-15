import { mkdir, writeFile, access } from 'fs/promises'
import { join } from 'path'
import { NextResponse } from 'next/server'
import { APP_FILES, PATHS, slugify } from '@/lib/paths'
import { addRow } from '@/lib/tracker'
import { linkFolder } from '@/lib/appIndex'
import { seedYaml, requirementMap, jdMarkdown } from '@/lib/tailoring/seed'
import { isUnnamedCompany, jdAnalysisParser } from '@/lib/tailoring/jd'
import { attachSkillRunToApplication } from '@/lib/skills/runs'
import { createWorkspace } from '@/lib/workspaces'
import { findExistingApplications, isBlocking } from '@/lib/duplicates'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Create an application folder from an analyzed JD.
 *
 * Writes the folder first and the tracker row last: a folder with no row shows
 * up in the UI as unlinked and is easy to fix, whereas a row pointing at a
 * folder that was never created is a dangling reference.
 */
/**
 * The first unused folder name: two roles at one company on the same day, a
 * confirmed duplicate, get acme-2026-10-02, then acme-2-2026-10-02. The date
 * stays last because folder names are parsed as <slug>-<date>.
 */
async function freeFolderName(slug: string, date: string): Promise<string> {
  for (let n = 1; n < 100; n++) {
    const folder = n === 1 ? `${slug}-${date}` : `${slug}-${n}-${date}`
    try {
      await access(join(PATHS.applications, folder))
    } catch {
      return folder
    }
  }
  throw new Error(`too many ${slug} applications on ${date}`)
}

export async function POST(req: Request) {
  const body = (await req.json()) as { analysis: unknown; jd: string; url?: string; runId?: string; allowDuplicate?: boolean }

  const parsed = jdAnalysisParser.safeParse(body.analysis)
  if (!parsed.success) return NextResponse.json({ error: 'invalid analysis payload' }, { status: 400 })
  if (typeof body.jd !== 'string' || !body.jd.trim()) {
    return NextResponse.json({ error: 'the job posting text is required' }, { status: 400 })
  }

  const analysis = { ...parsed.data, company: parsed.data.company.trim() }
  if (isUnnamedCompany(analysis.company)) {
    return NextResponse.json({ error: 'the posting does not name the company: add it before creating the application' }, { status: 400 })
  }
  // The same job must not be tracked twice by accident; the form shows these
  // matches and only sends allowDuplicate once the candidate confirms.
  if (body.allowDuplicate !== true) {
    const duplicates = (await findExistingApplications({ company: analysis.company, role: analysis.role, jd: body.jd })).filter(isBlocking)
    if (duplicates.length) {
      return NextResponse.json({ error: 'this job looks like one you already have an application for', duplicates }, { status: 409 })
    }
  }
  const date = new Date().toISOString().slice(0, 10)
  const folder = await freeFolderName(slugify(analysis.company) || 'application', date)
  const dir = join(PATHS.applications, folder)

  await mkdir(dir)
  await Promise.all([
    writeFile(join(dir, 'jd.md'), jdMarkdown(body.jd, body.url ?? ''), 'utf-8'),
    // The editor's tailoring passes need the analysis back in structured form, and
    // tailoring-notes.md is lossy markdown. Without this the pass has to re-read
    // the posting with another model call before it can start.
    writeFile(join(dir, 'jd-analysis.json'), JSON.stringify(analysis, null, 2) + '\n', 'utf-8'),
    writeFile(join(dir, APP_FILES.yaml), await seedYaml(analysis), 'utf-8'),
    writeFile(join(dir, 'tailoring-notes.md'), requirementMap(analysis), 'utf-8'),
  ])

  let rowId: number | null = null
  let rowError: string | null = null
  let runLinkError: string | null = null
  try {
    const row = await addRow({
      date,
      company: analysis.company,
      role: analysis.role,
      score: 'N/A',
      status: 'Preparing',
      pdf: '❌',
      report: '—',
      notes: `Created in the app. ${analysis.summary ?? ''}`.trim().replace(/\|/g, '/'),
    })
    rowId = row.id
    await linkFolder(row.id, folder)
  } catch (err) {
    // The folder is on disk and usable; the row can be added by hand.
    rowError = (err as Error).message
  }

  if (typeof body.runId === 'string' && body.runId) {
    try {
      await attachSkillRunToApplication(body.runId, folder)
    } catch (err) {
      runLinkError = (err as Error).message
    }
  }

  let workspaceError: string | null = null
  try {
    await createWorkspace(folder)
  } catch (err) {
    workspaceError = (err as Error).message
  }

  return NextResponse.json({ folder, key: folder, rowId, rowError, runLinkError, workspaceError })
}
