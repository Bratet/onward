import { existsSync } from 'fs'
import { basename, dirname, join } from 'path'
import { CANDIDATE } from './candidate'
import { REPO_ROOT, WORKSPACE_ROOT, slugify } from './repoRoot'
import type { BaseCv } from './tailoring/baseCv'

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

function ownCvPaths(variant: string): { en: string; fr: string } {
  return {
    en: join(RESUMES, 'own', `${variant}-en`, `cv-${CANDIDATE.slug}.yaml`),
    fr: join(RESUMES, 'own', `${variant}-fr`, `cv-${CANDIDATE.slug}.yaml`),
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
  runs: join(STATE, 'runs'),
  chats: join(STATE, 'chats'),
  workspaces: join(STATE, 'workspaces'),
  applicationTrash: join(STATE, '.trash', 'applications'),
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
   * The general resumes: one folder per type and language (`ai-en/`, `general-fr/`...), each holding
   * its YAML and a `<Name>_CV.pdf`, so any of them can be attached as is.
   */
  ownCv: ownCvPaths('general'),
  /** Role-specific general resumes; tailoring starts from the one matching the JD archetype. */
  ownCvVariants: {
    ai: ownCvPaths('ai'),
    ml: ownCvPaths('ml'),
    ds: ownCvPaths('ds'),
  },
} as const

export type Lang = 'en' | 'fr'
export type CvVariant = keyof typeof PATHS.ownCvVariants

/** A resume source file: a master, the all-round general resume, or a role variant of it. */
export function resumeSourcePath(family: 'masters' | 'ownCv', lang: Lang, variant: CvVariant | null = null): string {
  if (family === 'ownCv' && variant) return PATHS.ownCvVariants[variant][lang]
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

export function isCvVariant(value: unknown): value is CvVariant {
  return value === 'ai' || value === 'ml' || value === 'ds'
}

/** The general resume a tailored CV starts from: a role variant, or the all-round one. */
export function baseCvPath(base: BaseCv, lang: Lang): string {
  if (base === 'general') return PATHS.ownCv[lang]
  // A variant is optional: without its file, tailoring starts from the all-round resume.
  const variant = PATHS.ownCvVariants[base][lang]
  return existsSync(variant) ? variant : PATHS.ownCv[lang]
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
