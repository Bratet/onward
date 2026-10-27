import { existsSync, readdirSync } from 'fs'
import { basename, dirname, join } from 'path'
import { CANDIDATE } from './candidate'
import { REPO_ROOT, WORKSPACE_ROOT, slugify } from './repoRoot'
import { isProfileId } from './tailoring/baseCv'

export { REPO_ROOT, slugify }

/**
 * Everything the app reads or writes lives under workspace/, grouped by role
 * rather than by source-vs-generated: resumes/ (hand-maintained masters + the
 * general CV, each paired with its own rendered PDF), applications/ (one
 * folder per tailored application, entirely reproducible from resumes/), and
 * state/ (the tracker database, run logs, chats, skills, in-progress drafts).
 */
const WORKSPACE = WORKSPACE_ROOT
const STATE = join(WORKSPACE, 'state')
const RESUMES = join(WORKSPACE, 'resumes')

const OWN = join(RESUMES, 'own')

/** A general resume's two language files: `own/<id>-en/` and `own/<id>-fr/`. */
function ownCvPaths(id: string): { en: string; fr: string } {
  return {
    en: join(OWN, `${id}-en`, `cv-${CANDIDATE.slug}.yaml`),
    fr: join(OWN, `${id}-fr`, `cv-${CANDIDATE.slug}.yaml`),
  }
}

export const PATHS = {
  root: REPO_ROOT,
  workspace: WORKSPACE,
  state: STATE,
  tracker: join(STATE, 'applications.md'),
  appIndex: join(STATE, 'app-index.json'),
  settings: join(STATE, 'settings.json'),
  claudeModels: join(STATE, 'claude-models.json'),
  codexModels: join(STATE, 'codex-models.json'),
  goal: join(STATE, 'goal.json'),
  savedSearches: join(STATE, 'saved-searches.json'),
  candidateEligibility: join(STATE, 'candidate-eligibility.json'),
  candidateGuidance: join(STATE, 'candidate-guidance.md'),
  skills: join(STATE, 'skills'),
  skillRevisions: join(STATE, 'skill-revisions'),
  /** Earlier versions of each resume source, kept on every save that changes it. */
  resumeRevisions: join(STATE, 'resume-revisions'),
  runs: join(STATE, 'runs'),
  chats: join(STATE, 'chats'),
  workspaces: join(STATE, 'workspaces'),
  applicationTrash: join(STATE, '.trash', 'applications'),
  /** Deleted resume profiles, one folder per language, kept rather than erased. */
  profileTrash: join(STATE, '.trash', 'resume-profiles'),
  applications: join(WORKSPACE, 'applications'),
  templates: join(REPO_ROOT, 'templates'),
  tailoredDesign: join(REPO_ROOT, 'templates', 'tailored-design.yaml'),
  coverLetterTemplate: join(REPO_ROOT, 'templates', 'cover-letter.typ'),
  /** Personal settings and files that belong with the data, not the code. */
  candidateConfig: join(WORKSPACE, 'config', 'candidate.json'),
  /** Handwritten signature, rendered above the typed name on every cover letter. */
  signature: join(WORKSPACE, 'config', 'signature.png'),
  patches: join(REPO_ROOT, 'patches'),
  pdfWorker: join(REPO_ROOT, 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.min.mjs'),
  resumes: RESUMES,
  masters: {
    en: join(RESUMES, 'masters', 'master-resume-english.yaml'),
    fr: join(RESUMES, 'masters', 'master-resume-french.yaml'),
  },
  /**
   * The general resumes: one folder per type and language (`general-en/`, `backend-fr/`...), each holding
   * its YAML and a `<Name>_CV.pdf`, so any of them can be attached as is.
   */
  ownCvRoot: OWN,
  ownCv: ownCvPaths('general'),
  /** The names and role types of the profiles: general resumes aimed at one kind of role. */
  resumeProfiles: join(OWN, 'profiles.json'),
} as const

export type Lang = 'en' | 'fr'

/** A profile's general resume files. Throws on an id that is not a safe folder name. */
export function profileCvPaths(id: string): { en: string; fr: string } {
  if (!isProfileId(id)) throw new Error(`invalid resume profile id: '${id}'`)
  return ownCvPaths(id)
}

/** A resume source file: a master, the all-round general resume, or a profile of it. */
export function resumeSourcePath(family: 'masters' | 'ownCv', lang: Lang, profile: string | null = null): string {
  if (family === 'ownCv' && profile) return profileCvPaths(profile)[lang]
  return PATHS[family][lang]
}

/**
 * Every resume source sits beside its rendered PDF. A sendable resume (a
 * general one, like a tailored copy) renders to `<Name>_CV.pdf`; a master
 * is never sent and keeps its own basename.
 */
export function resumePdfPath(yamlPath: string): string {
  return basename(yamlPath) === APP_FILES.yaml ? join(dirname(yamlPath), APP_FILES.pdf) : yamlPath.replace(/\.yaml$/, '.pdf')
}

/** Whether the user has any resume yet. A new workspace starts without one, and the app opens on /welcome. */
export function hasResumes(): boolean {
  if ([PATHS.masters, PATHS.ownCv].some((pair) => existsSync(pair.en) || existsSync(pair.fr))) return true
  let folders: string[] = []
  try { folders = readdirSync(OWN) } catch {}
  return folders.some((folder) => existsSync(join(OWN, folder, `cv-${CANDIDATE.slug}.yaml`)))
}

/** The general resume a tailored CV starts from: a profile, or the all-round one. */
export function baseCvPath(base: string, lang: Lang): string {
  if (!isProfileId(base)) return PATHS.ownCv[lang]
  // A deleted profile, or one without this language, falls back to the all-round resume.
  const profile = ownCvPaths(base)[lang]
  return existsSync(profile) ? profile : PATHS.ownCv[lang]
}

/** Canonical filenames inside an application folder. */
export const APP_FILES = {
  general: 'general-application.json',
  jd: 'jd.md',
  analysis: 'jd-analysis.json',
  yaml: `cv-${CANDIDATE.slug}.yaml`,
  pdf: `${CANDIDATE.pascalName}_CV.pdf`,
  notes: 'tailoring-notes.md',
  letterInput: 'cover-letter-input.json',
  letterPdf: `${CANDIDATE.pascalName}_cover_letter.pdf`,
} as const
