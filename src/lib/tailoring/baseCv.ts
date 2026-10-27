/**
 * Which general resume a tailored CV starts from: the all-round one, or a
 * profile the candidate created on the Profile page. Kept free of Node imports
 * so the browser offers the same choices the server resolves.
 */

/** The role types the job analysis sorts a posting into. */
export const ARCHETYPES = ['data-science', 'ml-engineering', 'ai-llm', 'applied-research', 'ml-performance', 'software', 'other'] as const
export type Archetype = (typeof ARCHETYPES)[number]

/** Mid-sentence wording: "Picked for data science roles". */
export const ARCHETYPE_LABELS: Record<Archetype, string> = {
  'ai-llm': 'AI and LLM',
  'ml-engineering': 'ML engineering',
  'ml-performance': 'ML performance and inference',
  'data-science': 'data science',
  'applied-research': 'applied research',
  software: 'software engineering',
  other: 'other',
}

/** A general resume aimed at one kind of role, stored as `resumes/own/<id>-<lang>/`. */
export interface ResumeProfile {
  id: string
  name: string
  /** Postings of these types start from this profile unless the candidate picks another. */
  archetypes: Archetype[]
}

/** The all-round general resume. Always present and never a profile. */
export const GENERAL_BASE = { id: 'general', name: 'All-round' } as const

/** Profile ids are folder names; `general` and `master` already name the fixed sources. */
export const PROFILE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const RESERVED_PROFILE_IDS: readonly string[] = ['general', 'master']

export function isProfileId(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 48 && PROFILE_ID.test(value) && !RESERVED_PROFILE_IDS.includes(value)
}

export function isArchetype(value: unknown): value is Archetype {
  return (ARCHETYPES as readonly unknown[]).includes(value)
}

/** The profile the JD archetype suggests; the candidate can override it before creating the application. */
export function defaultBaseCv(archetype: string, profiles: readonly ResumeProfile[]): string {
  return profiles.find((profile) => (profile.archetypes as string[]).includes(archetype))?.id ?? GENERAL_BASE.id
}

/** When a profile gets picked, in the words of the new-application flow. */
export function profileHint(profile: ResumeProfile): string {
  if (!profile.archetypes.length) return 'Only when you pick it for an application'
  const labels = profile.archetypes.map((archetype) => ARCHETYPE_LABELS[archetype])
  const list = labels.length === 1 ? labels[0] : `${labels.slice(0, -1).join(', ')} and ${labels.at(-1)}`
  return `Picked for ${list} roles`
}
