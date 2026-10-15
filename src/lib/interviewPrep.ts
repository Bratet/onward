import { z } from 'zod'

/**
 * Interview preparation: what replaces analysis and tailoring once an
 * application has been sent. The AI writes a prep pack from the posting and
 * the resume that was actually sent; the candidate's practice, checklist and interview
 * rounds are saved beside it in the application workspace. Client-safe.
 */

export const QUESTION_CATEGORIES = ['motivation', 'behavioral', 'technical', 'role', 'gap'] as const
export type QuestionCategory = typeof QUESTION_CATEGORIES[number]

export const CATEGORY_LABELS: Record<QuestionCategory, string> = {
  motivation: 'Motivation',
  behavioral: 'Behavioral',
  technical: 'Technical',
  role: 'Role-specific',
  gap: 'Weak spots',
}

const text = (max: number) => z.string().trim().min(1).max(max)

export const interviewPackSchema = z.object({
  pitch: text(2000),
  questions: z.array(z.object({
    id: z.string().trim().min(1).max(40),
    category: z.enum(QUESTION_CATEGORIES),
    question: text(500),
    why: text(600),
    answer: z.array(text(500)).min(1).max(6),
  })).min(4).max(30),
  stories: z.array(z.object({
    title: text(120),
    situation: text(600),
    action: text(800),
    result: text(600),
    useFor: z.array(text(120)).max(6),
  })).max(8),
  gaps: z.array(z.object({
    topic: text(160),
    answer: text(800),
    prepare: text(600),
  })).max(8),
  askThem: z.array(text(300)).min(1).max(10),
  refresh: z.array(text(200)).max(12),
})
export type InterviewPack = z.infer<typeof interviewPackSchema>

/** JSON Schema for the engine. Every key is required, which both CLIs accept. */
export const interviewPackJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['pitch', 'questions', 'stories', 'gaps', 'askThem', 'refresh'],
  properties: {
    pitch: { type: 'string', description: 'A 60 to 90 second "tell me about yourself" answer in the candidate\'s spoken voice, aimed at this role.' },
    questions: {
      type: 'array',
      description: 'The 12 to 20 questions this interviewer is most likely to ask, most likely first.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'category', 'question', 'why', 'answer'],
        properties: {
          id: { type: 'string', description: 'Short stable slug, e.g. "q-rag-eval".' },
          category: { type: 'string', enum: [...QUESTION_CATEGORIES] },
          question: { type: 'string' },
          why: { type: 'string', description: 'One sentence: what in the posting makes them ask this.' },
          answer: { type: 'array', items: { type: 'string' }, description: '2 to 5 short talking points drawn only from the resume and confirmed facts.' },
        },
      },
    },
    stories: {
      type: 'array',
      description: '3 to 6 STAR stories from the resume that cover the most questions.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'situation', 'action', 'result', 'useFor'],
        properties: {
          title: { type: 'string' },
          situation: { type: 'string' },
          action: { type: 'string' },
          result: { type: 'string' },
          useFor: { type: 'array', items: { type: 'string' }, description: 'Question themes this story answers.' },
        },
      },
    },
    gaps: {
      type: 'array',
      description: 'Requirements the resume does not show, with an honest answer and what to brush up before the interview.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['topic', 'answer', 'prepare'],
        properties: { topic: { type: 'string' }, answer: { type: 'string' }, prepare: { type: 'string' } },
      },
    },
    askThem: { type: 'array', items: { type: 'string' }, description: '5 to 8 sharp questions to ask the interviewer about this team and role.' },
    refresh: { type: 'array', items: { type: 'string' }, description: 'Concrete technical topics to revise, most important first.' },
  },
} as const

export const RATINGS = ['again', 'shaky', 'solid'] as const
export type Rating = typeof RATINGS[number]

export const ROUND_KINDS = ['Recruiter screen', 'Hiring manager', 'Technical', 'Take-home', 'Case study', 'Team / culture', 'Final', 'Other'] as const

const roundSchema = z.object({
  id: z.string().trim().min(1).max(40),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/, 'Use a date like 2026-10-20'),
  kind: z.string().trim().min(1).max(60),
  with: z.string().trim().max(200).default(''),
  notes: z.string().trim().max(5000).default(''),
})
export type InterviewRound = z.infer<typeof roundSchema>

export interface InterviewState {
  pack: InterviewPack | null
  packAt: string | null
  runId: string | null
  /** Self-rating per question id, from flashcard practice. */
  ratings: Record<string, Rating>
  /** The candidate's own written answers per question id. */
  answers: Record<string, string>
  checklist: Record<string, boolean>
  rounds: InterviewRound[]
}

export function emptyInterviewState(): InterviewState {
  return { pack: null, packAt: null, runId: null, ratings: {}, answers: {}, checklist: {}, rounds: [] }
}

/** The editable part of the state; the pack itself only changes through generation. */
export const interviewPatchSchema = z.object({
  /** null clears a rating, for starting a deck over. */
  ratings: z.record(z.string().max(40), z.enum(RATINGS).nullable()).optional(),
  answers: z.record(z.string().max(40), z.string().max(5000)).optional(),
  checklist: z.record(z.string().max(60), z.boolean()).optional(),
  rounds: z.array(roundSchema).max(30).optional(),
}).strict()
export type InterviewPatch = z.infer<typeof interviewPatchSchema>

export function applyInterviewPatch(state: InterviewState, patch: InterviewPatch): InterviewState {
  return {
    ...state,
    ratings: patch.ratings ? pruneRecord<Rating | null>({ ...state.ratings, ...patch.ratings }, (value) => value !== null) as Record<string, Rating> : state.ratings,
    answers: patch.answers ? pruneRecord({ ...state.answers, ...patch.answers }, (value) => value.trim() !== '') : state.answers,
    checklist: patch.checklist ? { ...state.checklist, ...patch.checklist } : state.checklist,
    rounds: patch.rounds ? [...patch.rounds].sort((a, b) => a.date.localeCompare(b.date)) : state.rounds,
  }
}

function pruneRecord<T>(record: Record<string, T>, keep: (value: T) => boolean = () => true): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => keep(value)))
}

/** The fixed checklist; its ids are what the saved booleans refer to. */
export const PREP_CHECKLIST = [
  { id: 'reread-posting', label: 'Reread the posting and highlight what they repeat' },
  { id: 'reread-cv', label: 'Reread the exact resume you sent' },
  { id: 'pitch', label: 'Say your 60-second pitch out loud twice' },
  { id: 'stories', label: 'Rehearse three stories end to end' },
  { id: 'gaps', label: 'Prepare honest answers for the weak spots' },
  { id: 'questions', label: 'Pick three questions to ask them' },
  { id: 'logistics', label: 'Check the time, link or address, and your setup' },
] as const

export interface PrepProgress {
  practiced: number
  solid: number
  total: number
  checklist: number
  checklistTotal: number
  /** 0 to 100, weighting practice and the checklist equally. */
  percent: number
}

export function prepProgress(state: InterviewState): PrepProgress {
  const ids = state.pack?.questions.map((question) => question.id) ?? []
  const practiced = ids.filter((id) => state.ratings[id]).length
  const solid = ids.filter((id) => state.ratings[id] === 'solid').length
  const checklist = PREP_CHECKLIST.filter((item) => state.checklist[item.id]).length
  const practiceShare = ids.length ? (solid + 0.5 * (practiced - solid)) / ids.length : 0
  const percent = Math.round(((ids.length ? practiceShare : 0) * 0.5 + (checklist / PREP_CHECKLIST.length) * 0.5) * 100)
  return { practiced, solid, total: ids.length, checklist, checklistTotal: PREP_CHECKLIST.length, percent }
}

/** The next upcoming round on or after `today` (YYYY-MM-DD), if any. */
export function nextRound(rounds: InterviewRound[], today: string): InterviewRound | null {
  return [...rounds].sort((a, b) => a.date.localeCompare(b.date)).find((round) => round.date.slice(0, 10) >= today) ?? null
}

export function interviewPackPrompt(opts: {
  skill: string
  company: string
  role: string
  resume: string
  jd: string
  coverLetter: string | null
  notes: string
  guidance: string
  status: string
}): string {
  return [
    opts.skill.trim(),
    '',
    '## This application',
    `Company: ${opts.company}`,
    `Role: ${opts.role}`,
    `Current status: ${opts.status}`,
    '',
    '## Tracker notes (replies, contacts, interview details the candidate logged)',
    opts.notes.trim() || '(none)',
    '',
    '## Confirmed facts and guidance about the candidate',
    opts.guidance.trim() || '(none)',
    '',
    '## The resume they sent (RenderCV YAML)',
    opts.resume.trim(),
    '',
    opts.coverLetter ? `## The cover letter they sent\n${opts.coverLetter.trim()}\n` : '',
    '## The job posting',
    opts.jd.trim(),
  ].join('\n')
}

export const answerFeedbackJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['verdict', 'strengths', 'improve', 'stronger'],
  properties: {
    verdict: { type: 'string', enum: ['solid', 'shaky', 'again'] },
    strengths: { type: 'array', items: { type: 'string' }, description: 'Up to 3 things that work in the answer.' },
    improve: { type: 'array', items: { type: 'string' }, description: 'Up to 3 concrete fixes.' },
    stronger: { type: 'string', description: 'A tighter version of their answer in their own voice, using only facts they gave or the resume shows.' },
  },
} as const

export const answerFeedbackSchema = z.object({
  verdict: z.enum(RATINGS),
  strengths: z.array(z.string()).max(5),
  improve: z.array(z.string()).max(5),
  stronger: z.string().max(4000),
})
export type AnswerFeedback = z.infer<typeof answerFeedbackSchema>

export function answerFeedbackPrompt(opts: { skill: string; company: string; role: string; question: string; why: string; answer: string; resume: string; jd: string }): string {
  return [
    opts.skill.trim(),
    '',
    '## Task',
    'The candidate is practicing one interview question. Review their answer as a fair, demanding interviewer for this role would, then return the verdict, strengths, fixes and a stronger version.',
    'The stronger version must stay in their spoken voice, run under 150 words, and use only facts from their answer or the resume. Never invent numbers, clients or tools.',
    '',
    `Company: ${opts.company}`,
    `Role: ${opts.role}`,
    `Question: ${opts.question}`,
    `Why they ask it: ${opts.why}`,
    '',
    '## His answer',
    opts.answer.trim(),
    '',
    '## The resume they sent (RenderCV YAML)',
    opts.resume.trim(),
    '',
    '## The job posting',
    opts.jd.trim(),
  ].join('\n')
}
