/**
 * An application as a recruiting process rather than one status: the stage it
 * is in, the company's actual steps, the next thing to do, and a timeline of
 * every update with what it changed, so each one can be undone.
 *
 * The companion never edits this directly. It proposes typed operations; the
 * candidate reviews them and the app applies the ones they keep. Client-safe.
 */
import { z } from 'zod'

export const STAGES = ['preparing', 'applied', 'interviewing', 'offer', 'closed'] as const
export type Stage = typeof STAGES[number]

export const STAGE_LABEL: Record<Stage, string> = {
  preparing: 'Preparing',
  applied: 'Sent',
  interviewing: 'Interviewing',
  offer: 'Offer',
  closed: 'Closed',
}

export const OUTCOMES = ['hired', 'declined-offer', 'rejected', 'withdrew', 'no-reply', 'did-not-apply'] as const
export type Outcome = typeof OUTCOMES[number]

export const OUTCOME_LABEL: Record<Outcome, string> = {
  hired: 'Hired',
  'declined-offer': 'Declined the offer',
  rejected: 'Rejected',
  withdrew: 'Withdrew',
  'no-reply': 'No reply',
  'did-not-apply': 'Did not apply',
}

export const STEP_STATES = ['expected', 'booked', 'done', 'passed', 'not-passed'] as const
export type StepState = typeof STEP_STATES[number]

export const STEP_STATE_LABEL: Record<StepState, string> = {
  expected: 'Expected',
  booked: 'Booked',
  done: 'Done',
  passed: 'Passed',
  'not-passed': 'Not passed',
}

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/, 'Use a date like 2026-10-20')

export const stepSchema = z.object({
  id: z.string().min(1).max(40),
  label: z.string().trim().min(1).max(80),
  date: date.nullable().default(null),
  with: z.string().trim().max(200).default(''),
  state: z.enum(STEP_STATES),
  notes: z.string().trim().max(2000).default(''),
})
export type Step = z.infer<typeof stepSchema>

export const contactSchema = z.object({
  name: z.string().trim().min(1).max(120),
  role: z.string().trim().max(120).default(''),
  email: z.string().trim().max(200).default(''),
})
export type Contact = z.infer<typeof contactSchema>

export const nextActionSchema = z.object({ text: z.string().trim().min(1).max(200), due: date.nullable().default(null) })
export type NextAction = z.infer<typeof nextActionSchema>

/** One change the companion may propose. Each is small enough to review on its own line. */
export const operationSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('set_stage'), stage: z.enum(STAGES), outcome: z.enum(OUTCOMES).nullable().default(null) }),
  z.object({ op: z.literal('add_step'), label: z.string().trim().min(1).max(80), date: date.nullable().default(null), with: z.string().trim().max(200).default(''), state: z.enum(STEP_STATES) }),
  z.object({ op: z.literal('update_step'), stepId: z.string().min(1).max(40), state: z.enum(STEP_STATES).nullable().default(null), date: date.nullable().default(null), with: z.string().trim().max(200).nullable().default(null), notes: z.string().trim().max(2000).nullable().default(null) }),
  z.object({ op: z.literal('set_next_action'), text: z.string().trim().min(1).max(200), due: date.nullable().default(null) }),
  z.object({ op: z.literal('clear_next_action') }),
  z.object({ op: z.literal('add_contact'), name: z.string().trim().min(1).max(120), role: z.string().trim().max(120).default(''), email: z.string().trim().max(200).default('') }),
  z.object({ op: z.literal('add_note'), text: z.string().trim().min(1).max(1000) }),
])
export type Operation = z.infer<typeof operationSchema>

export const BASES = ['from-message', 'guessed', 'needs-you'] as const
export type Basis = typeof BASES[number]

/** An operation with the evidence for it, as the companion proposed it. */
export const proposalItemSchema = z.object({
  operation: operationSchema,
  /** The words in the candidate's message this came from; empty when guessed. */
  quote: z.string().max(400).default(''),
  basis: z.enum(BASES),
  why: z.string().max(300).default(''),
})
export type ProposalItem = z.infer<typeof proposalItemSchema>

export interface JourneyProposal {
  /** What the companion understood, in a sentence or two. */
  reply: string
  /** Asked when something it needs is missing, instead of guessing. */
  question: string | null
  items: ProposalItem[]
  runId: string | null
}

export const timelineEntrySchema = z.object({
  id: z.string().min(1).max(40),
  at: z.string(),
  summary: z.string().max(400),
  /** What the candidate wrote or pasted, kept so later updates have context. */
  source: z.string().max(20000).default(''),
  operations: z.array(operationSchema),
  /** The journey and tracker row before this entry, for undo. */
  before: z.object({ journey: z.unknown(), status: z.string().nullable(), notes: z.string().nullable().default(null) }).nullable().default(null),
  undoneAt: z.string().nullable().default(null),
})
export type TimelineEntry = z.infer<typeof timelineEntrySchema>

export interface Journey {
  stage: Stage
  outcome: Outcome | null
  steps: Step[]
  next: NextAction | null
  contacts: Contact[]
  /** Newest first. */
  timeline: TimelineEntry[]
}

/** The coarse tracker status a stage maps to; applications.md keeps only this. */
export function statusForStage(stage: Stage, outcome: Outcome | null, current: string | null): string {
  switch (stage) {
    case 'preparing': return 'Preparing'
    case 'applied': return 'Applied'
    case 'interviewing': return 'Interview'
    case 'offer': return 'Offer'
    case 'closed':
      if (outcome === 'did-not-apply') return current === 'SKIP' ? 'SKIP' : 'Discarded'
      if (outcome === 'hired' || outcome === 'declined-offer') return 'Offer'
      return 'Rejected'
  }
}

export function stageForStatus(status: string | null | undefined): { stage: Stage; outcome: Outcome | null } {
  switch (status) {
    case 'Applied': return { stage: 'applied', outcome: null }
    case 'Responded':
    case 'Interview': return { stage: 'interviewing', outcome: null }
    case 'Offer': return { stage: 'offer', outcome: null }
    case 'Rejected': return { stage: 'closed', outcome: 'rejected' }
    case 'Discarded':
    case 'SKIP': return { stage: 'closed', outcome: 'did-not-apply' }
    default: return { stage: 'preparing', outcome: null }
  }
}

/** A first journey for an application that has none yet, from what the app already knows. */
export function initialJourney(opts: { status: string | null; appliedAt: string | null; rounds: { id: string; date: string; kind: string; with: string; notes: string }[] }): Journey {
  const { stage, outcome } = stageForStatus(opts.status)
  const today = new Date().toISOString().slice(0, 10)
  const steps: Step[] = []
  if (opts.appliedAt && stage !== 'preparing') steps.push({ id: 'applied', label: 'Application sent', date: opts.appliedAt.slice(0, 10), with: '', state: 'done', notes: '' })
  for (const round of opts.rounds) {
    steps.push({ id: `round-${round.id}`.slice(0, 40), label: round.kind, date: round.date, with: round.with, state: round.date.slice(0, 10) >= today ? 'booked' : 'done', notes: round.notes })
  }
  return { stage, outcome, steps, next: null, contacts: [], timeline: [] }
}

export function parseJourney(value: unknown): Journey | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Partial<Journey>
  if (!STAGES.includes(raw.stage as Stage)) return null
  return {
    stage: raw.stage as Stage,
    outcome: OUTCOMES.includes(raw.outcome as Outcome) ? raw.outcome as Outcome : null,
    steps: z.array(stepSchema).catch([]).parse(raw.steps ?? []),
    next: nextActionSchema.nullable().catch(null).parse(raw.next ?? null),
    contacts: z.array(contactSchema).catch([]).parse(raw.contacts ?? []),
    timeline: z.array(timelineEntrySchema).catch([]).parse(raw.timeline ?? []),
  }
}

function stepId(label: string, taken: Set<string>): string {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'step'
  let id = base
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`
  return id
}

/**
 * Apply reviewed operations in order. Throws on an operation that cannot apply
 * (an unknown step), so a bad proposal never half-lands. Notes come back
 * separately: they belong on the tracker row, not in the journey.
 */
export function applyOperations(journey: Journey, operations: Operation[]): { journey: Journey; notes: string[] } {
  const next: Journey = { ...journey, steps: journey.steps.map((step) => ({ ...step })), contacts: [...journey.contacts] }
  const notes: string[] = []
  for (const operation of operations) {
    switch (operation.op) {
      case 'set_stage':
        next.stage = operation.stage
        next.outcome = operation.stage === 'closed' ? operation.outcome ?? 'rejected' : null
        break
      case 'add_step': {
        const id = stepId(operation.label, new Set(next.steps.map((step) => step.id)))
        next.steps.push({ id, label: operation.label, date: operation.date, with: operation.with, state: operation.state, notes: '' })
        break
      }
      case 'update_step': {
        const step = next.steps.find((entry) => entry.id === operation.stepId)
        if (!step) throw new Error(`No step "${operation.stepId}" in this application`)
        if (operation.state) step.state = operation.state
        if (operation.date) step.date = operation.date
        if (operation.with !== null) step.with = operation.with
        if (operation.notes !== null) step.notes = operation.notes
        break
      }
      case 'set_next_action':
        next.next = { text: operation.text, due: operation.due }
        break
      case 'clear_next_action':
        next.next = null
        break
      case 'add_contact':
        if (!next.contacts.some((contact) => contact.name.toLowerCase() === operation.name.toLowerCase())) {
          next.contacts.push({ name: operation.name, role: operation.role, email: operation.email })
        }
        break
      case 'add_note':
        notes.push(operation.text)
        break
    }
  }
  next.steps.sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'))
  return { journey: next, notes }
}

/** The step to look at now: the first one not finished, else the last one. */
export function currentStep(journey: Journey): Step | null {
  return journey.steps.find((step) => step.state === 'booked' || step.state === 'expected') ?? journey.steps.at(-1) ?? null
}

export type JourneyFocus =
  | { kind: 'step'; step: Step & { date: string } }
  | { kind: 'next'; next: NextAction; overdue: boolean }

/**
 * What the Overview leads with: a booked step still ahead, else the next action.
 * Null when the journey has neither, so the status-based view stays in charge.
 */
export function journeyFocus(journey: Journey | null, today: string): JourneyFocus | null {
  if (!journey || journey.stage === 'closed') return null
  const step = journey.steps.find((entry) => entry.state === 'booked' && entry.date && entry.date.slice(0, 10) >= today)
  if (step) return { kind: 'step', step: step as Step & { date: string } }
  if (journey.next) return { kind: 'next', next: journey.next, overdue: Boolean(journey.next.due && journey.next.due < today) }
  return null
}

/** Steps finished and recorded, for the Overview's count. */
export function stepProgress(journey: Journey): { finished: number; total: number } {
  return { finished: journey.steps.filter((step) => step.state === 'done' || step.state === 'passed' || step.state === 'not-passed').length, total: journey.steps.length }
}

/** One line per operation, in the candidate's terms, for the proposal card and the timeline. */
export function describeOperation(operation: Operation, journey: Journey): string {
  const step = (id: string) => journey.steps.find((entry) => entry.id === id)?.label ?? id
  const when = (value: string | null) => value ? `, ${value.replace('T', ' at ')}` : ''
  switch (operation.op) {
    case 'set_stage': return operation.stage === 'closed'
      ? `Close it: ${OUTCOME_LABEL[operation.outcome ?? 'rejected'].toLowerCase()}`
      : `Move to ${STAGE_LABEL[operation.stage]}`
    case 'add_step': return `Add step: ${operation.label}${when(operation.date)}${operation.with ? `, with ${operation.with}` : ''} (${STEP_STATE_LABEL[operation.state].toLowerCase()})`
    case 'update_step': {
      const parts = [
        operation.state ? STEP_STATE_LABEL[operation.state].toLowerCase() : '',
        operation.date ? `on ${operation.date.replace('T', ' at ')}` : '',
        operation.with ? `with ${operation.with}` : '',
        operation.notes ? 'notes updated' : '',
      ].filter(Boolean)
      return `${step(operation.stepId)}: ${parts.join(', ') || 'updated'}`
    }
    case 'set_next_action': return `Next: ${operation.text}${operation.due ? ` (by ${operation.due})` : ''}`
    case 'clear_next_action': return 'Clear the next action'
    case 'add_contact': return `Add contact: ${operation.name}${operation.role ? `, ${operation.role}` : ''}`
    case 'add_note': return `Note: ${operation.text}`
  }
}

/**
 * What the model returns. Every field is present (null when unused) so the same
 * schema works under both CLIs' strict structured output.
 */
export const companionJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['reply', 'question', 'items'],
  properties: {
    reply: { type: 'string' },
    question: { type: ['string', 'null'] },
    items: {
      type: 'array',
      maxItems: 12,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['op', 'stage', 'outcome', 'stepId', 'label', 'date', 'with', 'state', 'text', 'due', 'name', 'role', 'email', 'quote', 'basis', 'why'],
        properties: {
          op: { type: 'string', enum: ['set_stage', 'add_step', 'update_step', 'set_next_action', 'clear_next_action', 'add_contact', 'add_note'] },
          stage: { type: ['string', 'null'], enum: [...STAGES, null] },
          outcome: { type: ['string', 'null'], enum: [...OUTCOMES, null] },
          stepId: { type: ['string', 'null'] },
          label: { type: ['string', 'null'] },
          date: { type: ['string', 'null'] },
          with: { type: ['string', 'null'] },
          state: { type: ['string', 'null'], enum: [...STEP_STATES, null] },
          text: { type: ['string', 'null'] },
          due: { type: ['string', 'null'] },
          name: { type: ['string', 'null'] },
          role: { type: ['string', 'null'] },
          email: { type: ['string', 'null'] },
          quote: { type: 'string' },
          basis: { type: 'string', enum: [...BASES] },
          why: { type: 'string' },
        },
      },
    },
  },
} as const

type RawItem = Record<string, unknown>

/** Turn the model's flat items into typed operations, dropping any that do not validate. */
export function parseCompanionOutput(raw: unknown): { reply: string; question: string | null; items: ProposalItem[]; dropped: number } {
  const value = (raw && typeof raw === 'object' ? raw : {}) as { reply?: unknown; question?: unknown; items?: unknown }
  const items: ProposalItem[] = []
  let dropped = 0
  for (const item of Array.isArray(value.items) ? value.items as RawItem[] : []) {
    const clean = Object.fromEntries(Object.entries(item).filter(([, entry]) => entry !== null))
    const operation = operationSchema.safeParse(clean)
    const parsed = operation.success ? proposalItemSchema.safeParse({ operation: operation.data, quote: clean.quote ?? '', basis: clean.basis, why: clean.why ?? '' }) : null
    if (parsed?.success) items.push(parsed.data)
    else dropped++
  }
  return {
    reply: typeof value.reply === 'string' ? value.reply.trim() : '',
    question: typeof value.question === 'string' && value.question.trim() ? value.question.trim() : null,
    items,
    dropped,
  }
}

export function companionPrompt(opts: {
  skill: string
  company: string
  role: string
  status: string | null
  today: string
  journey: Journey
  notes: string
  message: string
}): string {
  const steps = opts.journey.steps.length
    ? opts.journey.steps.map((step) => `- id "${step.id}": ${step.label}${step.date ? `, ${step.date}` : ''}${step.with ? `, with ${step.with}` : ''}, ${STEP_STATE_LABEL[step.state].toLowerCase()}`).join('\n')
    : '(no steps yet)'
  const history = opts.journey.timeline.filter((entry) => !entry.undoneAt).slice(0, 8)
    .map((entry) => `- ${entry.at.slice(0, 10)}: ${entry.summary}`).join('\n') || '(none)'
  return [
    opts.skill.trim(),
    '',
    '## This application',
    `Company: ${opts.company}`,
    `Role: ${opts.role}`,
    `Today: ${opts.today}`,
    `Stage: ${STAGE_LABEL[opts.journey.stage]}${opts.journey.outcome ? ` (${OUTCOME_LABEL[opts.journey.outcome]})` : ''}; tracker status ${opts.status ?? 'none'}`,
    `Next action: ${opts.journey.next ? `${opts.journey.next.text}${opts.journey.next.due ? ` by ${opts.journey.next.due}` : ''}` : '(none)'}`,
    '',
    '## Steps so far',
    steps,
    '',
    '## Contacts',
    opts.journey.contacts.map((contact) => `- ${contact.name}${contact.role ? `, ${contact.role}` : ''}`).join('\n') || '(none)',
    '',
    '## Earlier updates',
    history,
    '',
    '## Tracker notes',
    opts.notes.trim() || '(none)',
    '',
    '## What the candidate just told you',
    opts.message.trim(),
  ].join('\n')
}

/** Lists put live applications first, furthest along on top, and closed ones last. */
export const STAGE_ORDER: Record<Stage, number> = { offer: 0, interviewing: 1, applied: 2, preparing: 3, closed: 4 }

/** The stage a tracker status shows as in lists, with the outcome when closed: "Closed · Rejected". */
export function stageLabelForStatus(status: string | null | undefined): string {
  const { stage, outcome } = stageForStatus(status)
  return stage === 'closed' && outcome ? `Closed · ${OUTCOME_LABEL[outcome]}` : STAGE_LABEL[stage]
}
