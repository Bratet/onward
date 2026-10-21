// Request and response shapes for TypeSafe's Jev (a "System One" classifier),
// called through OpenRouter's System One endpoint, which takes TypeSafe's native
// body. Docs: https://openrouter.ai/docs/guides/community/typesafe-sdk and
// https://docs.typesafe.ai/api.md. Pure, so the repo tests can cover it.
export type VisaLabel = 'yes' | 'no' | 'likely-no' | 'unknown'

export const VISA_LABELS: Record<VisaLabel, string> = {
  yes: 'Sponsors visa',
  no: 'No sponsorship',
  'likely-no': 'Likely no sponsorship',
  unknown: 'Visa not mentioned',
}

export const JEV_ENDPOINT = 'https://openrouter.ai/api/v1/systemone'
// Pinned so MIN_CONFIDENCE keeps meaning the same thing across model updates.
export const JEV_MODEL = 'typesafe/jev-1.13'
// Bump when the questions change, so cached answers to old questions are dropped.
export const QUESTIONS_VERSION = 4
// Below this, a badge is shown as unsure.
export const MIN_CONFIDENCE = 0.6
// State limit is 32k tokens; job descriptions are far shorter, these are safety caps.
const MAX_DESCRIPTION = 40_000
const MAX_HEADER = 600

// Choice keys are what Jev returns; kept short because questions are billed as input.
const VISA_CHOICES: Record<string, VisaLabel> = {
  yes: 'yes',
  no: 'no',
  likely_no: 'likely-no',
  unknown: 'unknown',
}
export interface Answer<Label extends string> {
  label: Label
  confidence: number
  probabilities: Partial<Record<Label, number>>
}

export interface JevVerdict {
  visa: Answer<VisaLabel>
}

export interface JevUsage {
  model?: string
  provider?: string
  inputTokens?: number
  cost?: number
}

// `header` is LinkedIn's top card (title, company, location, workplace type).
export interface Posting {
  header: string
  description: string
}

export function jevRequest({ header, description }: Posting) {
  return {
    model: JEV_MODEL,
    state: {
      posting_header: header.slice(0, MAX_HEADER),
      job_description: description.slice(0, MAX_DESCRIPTION),
    },
    questions: {
      sponsorship: {
        type: 'choice',
        instructions: 'What does this job posting say about visa sponsorship?',
        criteria: {
          yes: 'Offers or supports visa sponsorship or work permit help for this role',
          no: 'Will not or cannot sponsor, or candidates needing sponsorship are not considered',
          likely_no: 'Sponsorship not addressed, but requires existing right to work, a valid permit, a specific citizenship, or security clearance',
          unknown: 'Says nothing about visas, sponsorship, work permits, or right to work',
        },
      },
    },
  }
}

type RawAnswer = { choice?: unknown; confidence?: unknown; probabilities?: Record<string, unknown> } | undefined

function parseAnswer<Label extends string>(answer: RawAnswer, choices: Record<string, Label>, name: string): Answer<Label> {
  const label = choices[String(answer?.choice)]
  const confidence = Number(answer?.confidence)
  if (!label || !Number.isFinite(confidence)) throw new Error(`Unexpected Jev response for "${name}"`)
  const probabilities: Partial<Record<Label, number>> = {}
  for (const [choice, value] of Object.entries(answer?.probabilities ?? {})) {
    const mapped = choices[choice]
    if (mapped && Number.isFinite(Number(value))) probabilities[mapped] = Number(value)
  }
  return { label, confidence, probabilities }
}

export function parseJevResponse(body: unknown): { verdict: JevVerdict; usage: JevUsage } {
  const root = body as {
    model?: unknown
    provider?: unknown
    usage?: { input_tokens?: unknown; cost?: unknown }
    answers?: { sponsorship?: RawAnswer }
  } | null
  const number = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : undefined)
  return {
    verdict: {
      visa: parseAnswer(root?.answers?.sponsorship, VISA_CHOICES, 'sponsorship'),
    },
    usage: {
      model: typeof root?.model === 'string' ? root.model : undefined,
      provider: typeof root?.provider === 'string' ? root.provider : undefined,
      inputTokens: number(root?.usage?.input_tokens),
      cost: number(root?.usage?.cost),
    },
  }
}
