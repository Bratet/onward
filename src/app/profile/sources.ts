/**
 * The resume sources shown on the Profile page: the all-round general resume,
 * one per profile, and the master, each in both languages.
 *
 * Not in shell.tsx: that file is a client component, and the page resolves the
 * source on the server to know which file to read.
 */
import { GENERAL_BASE, profileHint, type ResumeProfile } from '@/lib/tailoring/baseCv'

export type Lang = 'en' | 'fr'
export const LANGS: readonly Lang[] = ['en', 'fr']

/** A resume on the Profile page: a source minus its language. */
export interface Document {
  key: string
  name: string
  hint: string
  family: 'ownCv' | 'masters'
  /** The profile id, null for the all-round resume and the master. */
  variant: string | null
}

export interface Source {
  /** `general-en`, `master-fr`, or `<profile id>-<lang>`. */
  id: string
  label: string
  lang: Lang
  doc: Document
}

export interface Catalog {
  documents: Document[]
  sources: Source[]
  /** The source with this id; the all-round English resume when there is none. */
  source(id: string | undefined): Source
  sourceFor(doc: Document, lang: Lang): Source
}

export function resumeCatalog(profiles: readonly ResumeProfile[]): Catalog {
  const documents: Document[] = [
    { key: 'ownCv:', name: GENERAL_BASE.name, hint: 'Used when no profile fits the role', family: 'ownCv', variant: null },
    ...profiles.map((profile): Document => ({ key: `ownCv:${profile.id}`, name: profile.name, hint: profileHint(profile), family: 'ownCv', variant: profile.id })),
    { key: 'masters:', name: 'Master', hint: 'The full record. No page limit, never sent', family: 'masters', variant: null },
  ]
  const sources = documents.flatMap((doc) => LANGS.map((lang): Source => ({
    id: `${doc.variant ?? (doc.family === 'masters' ? 'master' : GENERAL_BASE.id)}-${lang}`,
    label: `${doc.name} ${lang.toUpperCase()}`,
    lang,
    doc,
  })))
  return {
    documents,
    sources,
    source: (id) => sources.find((s) => s.id === id) ?? sources[0],
    sourceFor: (doc, lang) => sources.find((s) => s.doc === doc && s.lang === lang)!,
  }
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
