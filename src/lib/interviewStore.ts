import { readFile } from 'fs/promises'
import { getApplication, readDoc } from './applications'
import { getEngine } from './engine'
import { letterBody } from './outreach'
import { APP_FILES, PATHS } from './paths'
import {
  answerFeedbackJsonSchema, answerFeedbackPrompt, answerFeedbackSchema, applyInterviewPatch, emptyInterviewState,
  interviewPackJsonSchema, interviewPackPrompt, interviewPackSchema,
  type AnswerFeedback, type InterviewPatch, type InterviewState,
} from './interviewPrep'
import { getSkillForRunner } from './skills/registry'
import { startSkillRun, type RunRecorder } from './skills/runs'
import { readWorkspace, updateWorkspace, WorkspaceRevisionConflict, type ApplicationWorkspace } from './workspaces'

const SKILL_ID = 'interview-prep'

export function interviewState(workspace: ApplicationWorkspace): InterviewState {
  return { ...emptyInterviewState(), ...workspace.interview }
}

/**
 * Interview state never touches the resume draft, so a write that lost a race
 * with an autosave or a fit run simply retries against the latest revision.
 */
async function updateInterview(key: string, mutate: (state: InterviewState) => InterviewState): Promise<InterviewState> {
  for (let attempt = 0; ; attempt++) {
    const current = await readWorkspace(key)
    try {
      const saved = await updateWorkspace(key, current.revision, (latest) => ({ ...latest, interview: mutate(interviewState(latest)) }))
      return interviewState(saved)
    } catch (error) {
      if (!(error instanceof WorkspaceRevisionConflict) || attempt >= 3) throw error
    }
  }
}

export function patchInterview(key: string, patch: InterviewPatch): Promise<InterviewState> {
  return updateInterview(key, (state) => applyInterviewPatch(state, patch))
}

/** The resume that was sent (the finalized YAML), the posting, and the letter. */
async function sentMaterial(key: string) {
  const app = await getApplication(key)
  const folder = app?.folder
  if (!app || !folder) throw new Error('this application has no folder')
  const yaml = folder.docs.find((doc) => doc.key === 'yaml')
  const [resume, jd, letterInput, guidance] = await Promise.all([
    yaml ? readDoc(folder.folder, yaml.name) : null,
    readDoc(folder.folder, APP_FILES.jd),
    readDoc(folder.folder, APP_FILES.letterInput),
    readFile(PATHS.candidateGuidance, 'utf-8').catch(() => ''),
  ])
  const draft = resume ?? (await readWorkspace(key)).draftYaml
  if (!draft.trim()) throw new Error('Finalize a resume first: interview prep works from the resume you sent')
  if (!jd?.trim()) throw new Error(`Interview prep needs the job posting (${APP_FILES.jd})`)
  return {
    app, resume: draft, jd, guidance, coverLetter: letterBody(letterInput),
    company: app.row?.company ?? folder.slug, role: app.row?.role ?? 'the advertised role',
  }
}

export async function generateInterviewPack(key: string, signal?: AbortSignal): Promise<InterviewState> {
  const material = await sentMaterial(key)
  const [engine, skill] = await Promise.all([getEngine('editor-chat'), getSkillForRunner(SKILL_ID, 'text-artifact')])
  let run: RunRecorder | null = null
  try {
    run = await startSkillRun({ feature: 'interview-prep', skill, engine: engine.id, applicationKey: key, inputSummary: { status: material.app.row?.status ?? null } })
    const raw = await engine.runStructured<unknown>({
      signal,
      schema: interviewPackJsonSchema,
      prompt: interviewPackPrompt({
        skill: skill.instructions, company: material.company, role: material.role, resume: material.resume, jd: material.jd,
        coverLetter: material.coverLetter, notes: material.app.row?.notes ?? '', guidance: material.guidance, status: material.app.row?.status ?? '',
      }),
    })
    const pack = interviewPackSchema.parse(dedupeIds(raw))
    await run.complete({ questions: pack.questions.length, stories: pack.stories.length })
    const runId = run.id
    return await updateInterview(key, (state) => ({ ...state, pack, packAt: new Date().toISOString(), runId }))
  } catch (error) {
    await run?.fail((error as Error).message).catch(() => {})
    throw error
  }
}

export async function reviewPracticeAnswer(key: string, questionId: string, answer: string, signal?: AbortSignal): Promise<AnswerFeedback> {
  if (!answer.trim()) throw new Error('Write your answer first')
  if (answer.length > 5000) throw new Error('Keep the answer under 5,000 characters')
  const workspace = await readWorkspace(key)
  const question = interviewState(workspace).pack?.questions.find((entry) => entry.id === questionId)
  if (!question) throw new Error('That question is not in the prep pack anymore')
  const material = await sentMaterial(key)
  const [engine, skill] = await Promise.all([getEngine('editor-chat'), getSkillForRunner(SKILL_ID, 'text-artifact')])
  const raw = await engine.runStructured<unknown>({
    signal,
    schema: answerFeedbackJsonSchema,
    prompt: answerFeedbackPrompt({ skill: skill.instructions, company: material.company, role: material.role, question: question.question, why: question.why, answer, resume: material.resume, jd: material.jd }),
  })
  const feedback = answerFeedbackSchema.parse(raw)
  await patchInterview(key, { answers: { [questionId]: answer } })
  return feedback
}

/** Models occasionally repeat a slug; ratings are keyed by id, so make them unique. */
function dedupeIds(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { questions?: unknown }).questions)) return raw
  const seen = new Set<string>()
  const questions = ((raw as { questions: { id?: unknown }[] }).questions).map((question, index) => {
    let id = typeof question.id === 'string' && question.id.trim() ? question.id.trim().slice(0, 36) : `q-${index + 1}`
    while (seen.has(id)) id = `${id.slice(0, 33)}-${index + 1}`
    seen.add(id)
    return { ...question, id }
  })
  return { ...(raw as object), questions }
}
