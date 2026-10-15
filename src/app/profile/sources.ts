/**
 * The general and master resume sources shown on the Profile page.
 *
 * Not in shell.tsx: that file is a client component, and the page resolves the
 * source on the server to know which file to read.
 */
const GENERAL_VARIANTS = [
  { variant: null, name: 'All-round' },
  { variant: 'ai', name: 'AI Engineer' },
  { variant: 'ml', name: 'ML Engineer' },
  { variant: 'ds', name: 'Data Scientist' },
] as const

export const SOURCES = [
  ...GENERAL_VARIANTS.flatMap(({ variant, name }) => (['en', 'fr'] as const).map((lang) => ({
    id: `${variant ?? 'general'}-${lang}`,
    label: `${name} ${lang.toUpperCase()}`,
    name,
    family: 'ownCv' as const,
    variant,
    lang,
  }))),
  { id: 'master-en', label: 'Master EN', name: 'Master', family: 'masters' as const, variant: null, lang: 'en' as const },
  { id: 'master-fr', label: 'Master FR', name: 'Master', family: 'masters' as const, variant: null, lang: 'fr' as const },
]

export type Source = (typeof SOURCES)[number]

export function sourceById(id: string | undefined): Source {
  return SOURCES.find((s) => s.id === id) ?? SOURCES[0]
}

/** The documents on the Profile page: a source minus its language. */
export const DOCUMENTS = [...new Map(SOURCES.map((s) => [`${s.family}:${s.variant ?? ''}`, s])).values()].map((s) => ({
  key: `${s.family}:${s.variant ?? ''}`,
  name: s.name,
  family: s.family,
  variant: s.variant,
}))

export type Document = (typeof DOCUMENTS)[number]

export function documentOf(source: Source): Document {
  return DOCUMENTS.find((d) => d.family === source.family && d.variant === source.variant)!
}

export function sourceFor(doc: Document, lang: 'en' | 'fr'): Source {
  return SOURCES.find((s) => s.family === doc.family && s.variant === doc.variant && s.lang === lang)!
}

/** What the page knows about each source file, without opening it in the editor. */
export interface SourceMeta {
  id: string
  missing: boolean
  /** Last YAML save, epoch ms. */
  edited: number | null
  /** Whether the PDF beside the YAML was rendered after its last save. */
  pdf: 'synced' | 'stale' | 'missing'
  bullets: number | null
  /** Where this file and its other-language twin fall out of step, or null. */
  parity: string | null
}
