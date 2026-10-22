import { z } from 'zod'
import { parse, stringify } from 'yaml'

/**
 * A new user's first resume, read from the one they already have.
 *
 * The model only sorts the text into fields; the YAML is built here, so the
 * result always has the shape RenderCV and the rest of the app expect. The same
 * content becomes both the master and the general resume: the user trims the
 * general one and grows the master from there.
 */

export type ImportLang = 'en' | 'fr'

const NETWORKS = ['LinkedIn', 'GitHub', 'GitLab', 'ORCID', 'Google Scholar', 'StackOverflow', 'ResearchGate'] as const

const entryDates = {
  start_date: z.string().nullable(),
  end_date: z.string().nullable(),
}

export const importedResumeParser = z.object({
  language: z.enum(['en', 'fr']),
  headline: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  website: z.string().nullable(),
  profiles: z.array(z.object({ network: z.enum(NETWORKS), username: z.string() })),
  summary: z.string().nullable(),
  experience: z.array(z.object({ company: z.string(), position: z.string(), ...entryDates, highlights: z.array(z.string()) })),
  education: z.array(z.object({
    institution: z.string(), area: z.string(), degree: z.string().nullable(), ...entryDates, highlights: z.array(z.string()),
  })),
  projects: z.array(z.object({ name: z.string(), date: z.string().nullable(), highlights: z.array(z.string()) })),
  skills: z.array(z.object({ label: z.string(), details: z.string() })),
  other: z.array(z.object({ title: z.string(), items: z.array(z.string()) })),
})

export type ImportedResume = z.infer<typeof importedResumeParser>

const text = { type: 'string' }
const maybe = { type: ['string', 'null'] }
const strings = { type: 'array', items: text }
const object = (properties: Record<string, unknown>) => ({
  type: 'object', additionalProperties: false, required: Object.keys(properties), properties,
})

export const importedResumeSchema = object({
  language: { type: 'string', enum: ['en', 'fr'] },
  headline: maybe,
  email: maybe,
  phone: maybe,
  website: maybe,
  profiles: { type: 'array', items: object({ network: { type: 'string', enum: NETWORKS }, username: text }) },
  summary: maybe,
  experience: { type: 'array', items: object({ company: text, position: text, start_date: maybe, end_date: maybe, highlights: strings }) },
  education: {
    type: 'array',
    items: object({ institution: text, area: text, degree: maybe, start_date: maybe, end_date: maybe, highlights: strings }),
  },
  projects: { type: 'array', items: object({ name: text, date: maybe, highlights: strings }) },
  skills: { type: 'array', items: object({ label: text, details: text }) },
  other: { type: 'array', items: object({ title: text, items: strings }) },
})

export const MIN_RESUME_CHARS = 200
export const MAX_RESUME_CHARS = 60_000

export function resumeImportPrompt(resume: string): string {
  return `You are moving a person's existing resume into Onward, a job application app. Sort the resume below into the JSON fields. You are a careful copy typist, not an editor.

Rules:
- Copy the wording exactly. Do not rewrite, shorten, merge, translate, or improve any sentence, and never add a fact, number, skill or date that is not in the text.
- Keep every role, degree, project, skill and bullet. Nothing is dropped: this becomes the person's complete record.
- Fix only what the text extraction broke: words split across lines, stray hyphenation, bullet symbols, page numbers, repeated headers and footers.
- language: "fr" if the resume is written in French, otherwise "en".
- headline: the job title written under the name, or null.
- phone: international format starting with "+" only when the country code is written or certain from the number; otherwise null.
- website: a personal site as a full URL, or null. profiles: only the listed networks, with the bare username or profile id, never a URL.
- Dates: "YYYY-MM" when the month is known, "YYYY" when only the year is, "present" for an ongoing role, null when there is none.
- summary: the profile or summary paragraph as one string, or null.
- experience: one item per role; highlights are its bullets, or its description split into sentences.
- skills: keep the resume's own groups as label/details; a flat list becomes one group labelled "Skills" (or "Compétences" in French).
- other: every remaining section (languages, certifications, awards, publications, volunteering, interests...) with its own title and lines.
- Leave out locations, street addresses, dates of birth, photos and references.
- Never use an em dash; use a comma or a hyphen.

The resume:
<resume>
${resume}
</resume>`
}

const SECTION_TITLES: Record<ImportLang, { summary: string; experience: string; projects: string; skills: string; education: string }> = {
  en: { summary: 'Summary', experience: 'Experience', projects: 'Projects', skills: 'Skills', education: 'Education' },
  fr: { summary: 'Résumé', experience: 'Expérience', projects: 'Projets', skills: 'Compétences', education: 'Formation' },
}

const DATE_RE = /^\d{4}(-\d{2})?$/

/** RenderCV rejects anything it cannot read as a date; a loose one goes in the free `date` field instead. */
function dates(start: string | null, end: string | null): Record<string, string> {
  const s = start?.trim() || null
  const e = end?.trim() || null
  const valid = (value: string | null) => value === null || DATE_RE.test(value) || value.toLowerCase() === 'present'
  if (s && DATE_RE.test(s) && valid(e)) return e ? { start_date: s, end_date: e.toLowerCase() === 'present' ? 'present' : e } : { start_date: s }
  const free = [s, e].filter(Boolean).join(' - ')
  return free ? { date: free } : {}
}

/** The one rule the app enforces on every recruiter-facing string that a resume can carry in by accident. */
function clean(value: string): string {
  return value.replace(/\s+—\s+/g, ', ').replace(/—/g, '-').replace(/\s+/g, ' ').trim()
}

function lines(values: string[]): string[] {
  return values.map(clean).filter(Boolean)
}

function url(value: string | null): string | null {
  const v = value?.trim()
  if (!v) return null
  const full = /^https?:\/\//i.test(v) ? v : `https://${v}`
  try {
    return new URL(full).toString()
  } catch {
    return null
  }
}

/**
 * The resume as RenderCV YAML, in Onward's one design. `design` is the parsed
 * `design:` block of templates/tailored-design.yaml.
 */
export function importedResumeYaml(resume: ImportedResume, fullName: string, design: unknown, fallbackEmail?: string): string {
  const titles = SECTION_TITLES[resume.language]
  const sections: Record<string, unknown[]> = {}
  if (resume.summary && clean(resume.summary)) sections[titles.summary] = [clean(resume.summary)]

  const experience = resume.experience
    .filter((e) => e.company.trim() || e.position.trim())
    .map((e) => ({
      company: clean(e.company) || clean(e.position),
      position: clean(e.position) || clean(e.company),
      ...dates(e.start_date, e.end_date),
      ...(lines(e.highlights).length ? { highlights: lines(e.highlights) } : {}),
    }))
  if (experience.length) sections[titles.experience] = experience

  const projects = resume.projects
    .filter((p) => p.name.trim())
    .map((p) => ({
      name: clean(p.name),
      ...(p.date?.trim() ? { date: clean(p.date) } : {}),
      ...(lines(p.highlights).length ? { highlights: lines(p.highlights) } : {}),
    }))
  if (projects.length) sections[titles.projects] = projects

  const skills = resume.skills
    .filter((s) => s.details.trim())
    .map((s) => ({ label: clean(s.label) || titles.skills, details: clean(s.details) }))
  if (skills.length) sections[titles.skills] = skills

  const education = resume.education
    .filter((e) => e.institution.trim())
    .map((e) => ({
      institution: clean(e.institution),
      area: clean(e.area) || clean(e.degree ?? '') || clean(e.institution),
      ...(e.degree?.trim() ? { degree: clean(e.degree) } : {}),
      ...dates(e.start_date, e.end_date),
      ...(lines(e.highlights).length ? { highlights: lines(e.highlights) } : {}),
    }))
  if (education.length) sections[titles.education] = education

  for (const section of resume.other) {
    const title = clean(section.title)
    const items = lines(section.items)
    if (title && items.length && !(title in sections)) sections[title] = items.map((bullet) => ({ bullet }))
  }

  const email = resume.email?.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(resume.email.trim()) ? resume.email.trim() : fallbackEmail
  // RenderCV formats phone numbers internationally and fails on one without a country code.
  const phone = resume.phone?.trim() && /^\+[\d\s().-]{7,}$/.test(resume.phone.trim()) ? resume.phone.trim() : null
  const website = url(resume.website)
  const profiles = resume.profiles
    .map((p) => ({ network: p.network, username: p.username.trim().replace(/^https?:\/\/\S+\/(?=[^/]+\/?$)/, '').replace(/\/$/, '') }))
    .filter((p) => p.username && !/\s/.test(p.username))

  const cv = {
    name: fullName,
    ...(resume.headline?.trim() ? { headline: clean(resume.headline) } : {}),
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
    ...(website ? { website } : {}),
    ...(profiles.length ? { social_networks: profiles } : {}),
    ...(Object.keys(sections).length ? { sections } : {}),
  }
  return stringify({ cv, design }, { lineWidth: 0 })
}

/** A resume with only a name, for someone who would rather write theirs in the editor. */
export function blankResumeYaml(fullName: string, design: unknown): string {
  return stringify({ cv: { name: fullName }, design }, { lineWidth: 0 })
}

/** The design block of templates/tailored-design.yaml, which every resume must carry. */
export function designBlock(templateYaml: string): unknown {
  return (parse(templateYaml) as { design: unknown }).design
}

/** What the import found, for the user to check before it is saved. */
export function importSummary(resume: ImportedResume) {
  return {
    language: resume.language,
    roles: resume.experience.length,
    bullets: resume.experience.reduce((n, e) => n + e.highlights.length, 0),
    education: resume.education.length,
    projects: resume.projects.length,
    skills: resume.skills.length,
    other: resume.other.map((s) => s.title),
  }
}

export type ImportSummary = ReturnType<typeof importSummary>
