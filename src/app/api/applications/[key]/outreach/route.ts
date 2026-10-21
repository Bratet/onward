import { NextResponse } from 'next/server'
import { getApplication, readDoc } from '@/lib/applications'
import { getEngine } from '@/lib/engine'
import { letterBody, outreachDraftSchema, outreachKindSchema, outreachPrompt } from '@/lib/outreach'
import { getSkillForRunner } from '@/lib/skills/registry'
import { APP_FILES } from '@/lib/paths'
import { readWorkspace, updateWorkspace } from '@/lib/workspaces'
import { wasSent } from '@/lib/applicationPhase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 900

export async function PUT(req: Request, { params }: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await params
    const { kind, text } = outreachDraftSchema.parse(await req.json())
    const workspace = await readWorkspace(key)
    const saved = await updateWorkspace(key, workspace.revision, (current) => ({
      ...current, outreach: { ...current.outreach, [kind]: text },
    }))
    return NextResponse.json({ drafts: saved.outreach })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 })
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await params
    const body = await req.json()
    const kind = outreachKindSchema.parse(body.kind)
    if (kind === 'cover-letter') throw new Error('Cover letters are written in the cover letter editor')
    if (typeof body.instructions !== 'string' || body.instructions.length > 8000) throw new Error('Instructions must be 8,000 characters or fewer')
    const app = await getApplication(key)
    const yaml = app?.folder?.docs.find((doc) => doc.key === 'yaml')
    if (!app?.folder?.has.pdf || !yaml) throw new Error('Finalize a resume before drafting a message')
    const [resume, jd] = await Promise.all([
      readDoc(app.folder.folder, yaml.name), readDoc(app.folder.folder, APP_FILES.jd),
    ])
    const letterInput = await readDoc(app.folder.folder, APP_FILES.letterInput)
    const [engine, skill] = await Promise.all([getEngine('editor-chat'), getSkillForRunner('write-outreach', 'text-artifact')])
    const result = await engine.runStructured<{ text: string }>({
      signal: req.signal,
      schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'], additionalProperties: false },
      prompt: outreachPrompt({
        kind,
        skill: skill.instructions,
        company: app.row?.company ?? app.folder.slug,
        role: app.row?.role ?? 'the advertised role',
        resume: resume ?? '',
        jd,
        coverLetter: letterBody(letterInput),
        instructions: await withApplicationStage(key, app.row?.status ?? '', body.instructions),
      }),
    })
    const draft = outreachDraftSchema.parse({ kind, text: result.text })
    return NextResponse.json(draft)
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 })
  }
}

/**
 * Once the application is out, say so, with the date, so the draft does not
 * re-apply from scratch; the candidate's own instructions come after and win.
 */
async function withApplicationStage(key: string, status: string, instructions: string): Promise<string> {
  if (!wasSent(status)) return instructions
  const appliedAt = (await readWorkspace(key).catch(() => null))?.appliedAt
  const when = appliedAt ? ` on ${appliedAt.slice(0, 10)}` : ''
  const stage = `He already applied${when}; the application status is now "${status}". Write the message for that stage, following his instructions below.`
  return [stage, instructions.trim()].filter(Boolean).join('\n\n')
}
