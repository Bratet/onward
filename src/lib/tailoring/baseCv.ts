/**
 * Which general resume a tailored CV starts from. Kept free of Node imports so
 * the new-application form can offer the same choices the server resolves.
 */
export const BASE_CVS = [
  { id: 'general', label: 'All-round' },
  { id: 'ai', label: 'AI Engineer' },
  { id: 'ml', label: 'ML Engineer' },
  { id: 'ds', label: 'Data Scientist' },
] as const

export type BaseCv = (typeof BASE_CVS)[number]['id']

/** The variant the JD archetype suggests; the candidate can override it before creating the application. */
export function defaultBaseCv(archetype: string): BaseCv {
  if (archetype === 'ai-llm') return 'ai'
  if (archetype === 'ml-engineering' || archetype === 'ml-performance') return 'ml'
  if (archetype === 'data-science') return 'ds'
  return 'general'
}
