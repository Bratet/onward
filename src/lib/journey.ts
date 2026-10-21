/**
 * An application as a recruiting process rather than one status: the stage it
 * is in, the company's actual steps, the next thing to do, and a timeline of
 * every update with what it changed, so each one can be undone.
 *
 * Every change is a typed operation the candidate makes from the steps form;
 * each saved change is one timeline entry that can be undone. Client-safe.
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

export const STEP_STATES = ['expected', 'booked', 'done', 'passed', 'not-passed', 'cancelled'] as const
export type StepState = typeof STEP_STATES[number]

export const STEP_STATE_LABEL: Record<StepState, string> = {
  expected: 'Expected',
  booked: 'Booked',
  done: 'Done',
  passed: 'Passed',
  'not-passed': 'Not passed',
  cancelled: 'Aborted',
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

/** One change to the journey. Each is small enough to read on its own line. */
export const operationSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('set_stage'), stage: z.enum(STAGES), outcome: z.enum(OUTCOMES).nullable().default(null) }),
  z.object({ op: z.literal('add_step'), label: z.string().trim().min(1).max(80), date: date.nullable().default(null), with: z.string().trim().max(200).default(''), state: z.enum(STEP_STATES) }),
  z.object({ op: z.literal('update_step'), stepId: z.string().min(1).max(40), state: z.enum(STEP_STATES).nullable().default(null), date: date.nullable().default(null), with: z.string().trim().max(200).nullable().default(null), notes: z.string().trim().max(2000).nullable().default(null) }),
  z.object({ op: z.literal('remove_step'), stepId: z.string().min(1).max(40) }),
  z.object({ op: z.literal('set_next_action'), text: z.string().trim().min(1).max(200), due: date.nullable().default(null) }),
  z.object({ op: z.literal('clear_next_action') }),
  z.object({ op: z.literal('add_contact'), name: z.string().trim().min(1).max(120), role: z.string().trim().max(120).default(''), email: z.string().trim().max(200).default('') }),
  z.object({ op: z.literal('add_note'), text: z.string().trim().min(1).max(1000) }),
])
export type Operation = z.infer<typeof operationSchema>

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
export function initialJourney(opts: { status: string | null; appliedAt: string | null }): Journey {
  const { stage, outcome } = stageForStatus(opts.status)
  const steps: Step[] = []
  if (opts.appliedAt && stage !== 'preparing') steps.push({ id: 'applied', label: 'Application sent', date: opts.appliedAt.slice(0, 10), with: '', state: 'done', notes: '' })
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
      case 'remove_step': {
        if (operation.stepId === 'applied') throw new Error('The sent step comes from the tracker and cannot be removed')
        const index = next.steps.findIndex((entry) => entry.id === operation.stepId)
        if (index < 0) throw new Error(`No step "${operation.stepId}" in this application`)
        next.steps.splice(index, 1)
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
/** Whether the process went past sending the application: any step besides that one. */
export function hadInterviews(value: unknown): boolean {
  return parseJourney(value)?.steps.some((step) => step.id !== 'applied') ?? false
}

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

/** One line per operation, in the candidate's terms, for the timeline. */
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
    case 'remove_step': return `Remove step: ${step(operation.stepId)}`
    case 'set_next_action': return `Next: ${operation.text}${operation.due ? ` (by ${operation.due})` : ''}`
    case 'clear_next_action': return 'Clear the next action'
    case 'add_contact': return `Add contact: ${operation.name}${operation.role ? `, ${operation.role}` : ''}`
    case 'add_note': return `Note: ${operation.text}`
  }
}

/** Lists put live applications first, furthest along on top, and closed ones last. */
export const STAGE_ORDER: Record<Stage, number> = { offer: 0, interviewing: 1, applied: 2, preparing: 3, closed: 4 }

/** The stage a tracker status shows as in lists, with the outcome when closed: "Closed · Rejected". */
export function stageLabelForStatus(status: string | null | undefined): string {
  const { stage, outcome } = stageForStatus(status)
  return stage === 'closed' && outcome ? `Closed · ${OUTCOME_LABEL[outcome]}` : STAGE_LABEL[stage]
}
