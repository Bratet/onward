import { readFile } from 'fs/promises'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getApplication, readDoc } from '@/lib/applications'
import { acceptHumanized, assertLetterBase, CoverLetterConflict, coverLetterSchema, humanizePrompt, humanizeSchema, letterAgentPrompt, letterAgentSchema, type CoverLetter } from '@/lib/coverLetter'
import { getEngine } from '@/lib/engine'
import { getSkillForRunner } from '@/lib/skills/registry'
import { APP_FILES, PATHS } from '@/lib/paths'
import { applicationLanguage, readWorkspace, updateWorkspace } from '@/lib/workspaces'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 900

const turnSchema = z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(20000) })

/**
 * Autosave the structured draft. The letter has its own field, so it never
 * races the resume, but it is refused when the stored letter is no longer the
 * `base` this client started from.
 */
export async function PUT(req: Request, { params }: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await params
    const body = await req.json()
    const letter = coverLetterSchema.parse(body.letter)
    const workspace = await readWorkspace(key)
    const saved = await updateWorkspace(key, workspace.revision, (current) => {
      assertLetterBase(current.coverLetter, body.base)
      return { ...current, coverLetter: letter }
    })
    return NextResponse.json({ letter: saved.coverLetter })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: error instanceof CoverLetterConflict ? 409 : 400 })
  }
}

/** One AI companion turn: draft the letter, or revise it as asked. Returns the whole letter. */
export async function POST(req: Request, { params }: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await params
    const body = z.object({
      letter: coverLetterSchema,
      message: z.string().trim().min(1).max(8000),
      conversation: z.array(turnSchema).max(100).default([]),
    }).parse(await req.json())
    const app = await getApplication(key)
    const yamlName = app?.folder?.docs.find((doc) => doc.key === 'yaml')?.name
    if (!app?.folder?.has.pdf || !yamlName) throw new Error('Finalize a resume before writing a cover letter')
    const [resumeYaml, jd, analysis, guidance, lang] = await Promise.all([
      readDoc(app.folder.folder, yamlName),
      readDoc(app.folder.folder, APP_FILES.jd),
      readDoc(app.folder.folder, APP_FILES.analysis),
      readFile(PATHS.candidateGuidance, 'utf-8').catch(() => ''),
      applicationLanguage(app.folder.folder),
    ])
    const masterYaml = await readFile(PATHS.masters[lang], 'utf-8').catch(() => null)
    const [engine, skill, humanizer] = await Promise.all([
      getEngine('editor-chat'),
      getSkillForRunner('write-cover-letter', 'text-artifact'),
      getSkillForRunner('humanize-text', 'text-artifact').catch((error: Error) => (console.error(`humanize-text skill unavailable: ${error.message}`), null)),
    ])
    const result = await engine.runStructured<{ reply: string; letter: CoverLetter }>({
      signal: req.signal,
      schema: letterAgentSchema,
      // The skill looks up the company's mission itself.
      webResearch: true,
      prompt: letterAgentPrompt({
        skill: skill.instructions,
        company: app.row?.company ?? app.folder.slug,
        role: app.row?.role ?? 'the advertised role',
        lang,
        resumeYaml: resumeYaml ?? '',
        jd,
        guidance,
        masterYaml,
        analysis,
        letter: body.letter,
        conversation: body.conversation,
        message: body.message,
      }),
    })
    const letter = coverLetterSchema.parse(result.letter)
    let reply = result.reply.trim()
    // Last step on every turn: the humanizer pass, so the letter reads as his.
    if (humanizer && letter.content.trim()) {
      const pass = await engine.runStructured<{ content: string; changes: string[] }>({
        signal: req.signal,
        schema: humanizeSchema,
        prompt: humanizePrompt({ skill: humanizer.instructions, content: letter.content, lang }),
      })
      if (acceptHumanized(letter.content, pass.content)) {
        letter.content = pass.content.trim()
        reply += pass.changes.length ? `\n\nHumanizer pass: ${pass.changes.join('; ')}.` : '\n\nHumanizer pass: nothing needed changing.'
      } else {
        reply += '\n\nThe humanizer pass changed too much, so this is the draft before it.'
      }
    } else if (!humanizer) {
      reply += '\n\nHumanizer pass skipped: the humanize-text skill could not be loaded.'
    }
    return NextResponse.json({ reply, letter })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 })
  }
}
