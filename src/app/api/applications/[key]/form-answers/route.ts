import { readFile } from 'fs/promises'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getApplication, readDoc } from '@/lib/applications'
import { getEngine } from '@/lib/engine'
import { answerAgentPrompt, answerAgentSchema, formAnswersSchema } from '@/lib/formAnswers'
import { getSkillForRunner } from '@/lib/skills/registry'
import { APP_FILES, PATHS } from '@/lib/paths'
import { applicationLanguage, readWorkspace, updateWorkspace } from '@/lib/workspaces'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 900

const turnSchema = z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(20000) })

/** Autosave the whole form. It has its own field, so it never races the resume draft. */
export async function PUT(req: Request, { params }: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await params
    const questions = formAnswersSchema.parse((await req.json()).questions)
    const workspace = await readWorkspace(key)
    const saved = await updateWorkspace(key, workspace.revision, (current) => ({ ...current, formAnswers: questions }))
    return NextResponse.json({ questions: saved.formAnswers })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 })
  }
}

/** One AI turn: draft or revise answers. Returns the changed answers by question id; the form itself is never rewritten. */
export async function POST(req: Request, { params }: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await params
    const body = z.object({
      questions: formAnswersSchema.min(1, 'Add a question first'),
      message: z.string().trim().min(1).max(8000),
      focus: z.string().max(64).nullable().default(null),
      conversation: z.array(turnSchema).max(100).default([]),
    }).parse(await req.json())
    const app = await getApplication(key)
    if (!app?.folder) throw new Error('application not found')
    const [workspace, jd, guidance, lang] = await Promise.all([
      readWorkspace(key),
      readDoc(app.folder.folder, APP_FILES.jd),
      readFile(PATHS.candidateGuidance, 'utf-8').catch(() => ''),
      applicationLanguage(app.folder.folder),
    ])
    const masterYaml = await readFile(PATHS.masters[lang], 'utf-8').catch(() => null)
    const [engine, skill, humanizer] = await Promise.all([
      getEngine('editor-chat'),
      getSkillForRunner('write-form-answers', 'text-artifact'),
      getSkillForRunner('humanize-text', 'text-artifact').catch(() => null),
    ])
    const result = await engine.runStructured<{ reply: string; answers: { id: string; answer: string }[] }>({
      signal: req.signal,
      schema: answerAgentSchema,
      prompt: answerAgentPrompt({
        skill: skill.instructions,
        humanizer: humanizer?.instructions ?? null,
        company: app.row?.company ?? app.folder.slug,
        role: app.row?.role ?? 'the advertised role',
        language: lang === 'fr' ? 'French' : 'English',
        resumeYaml: workspace.draftYaml,
        masterYaml,
        guidance,
        jd,
        coverLetter: workspace.coverLetter?.content ?? null,
        questions: body.questions,
        focus: body.focus,
        conversation: body.conversation,
        message: body.message,
      }),
    })
    const known = new Set(body.questions.map((entry) => entry.id))
    const answers = result.answers.filter((entry) => known.has(entry.id)).map((entry) => ({ id: entry.id, answer: entry.answer.trim() }))
    return NextResponse.json({ reply: result.reply.trim(), answers })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 })
  }
}
