import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { z } from 'zod'
import { PATHS, profileCvPaths, resumePdfPath, resumeSourcePath, slugify, type Lang } from './paths'
import { ARCHETYPES, GENERAL_BASE, isProfileId, type Archetype, type ResumeProfile } from './tailoring/baseCv'

const LANGS: readonly Lang[] = ['en', 'fr']
const NAME_MAX = 40

/**
 * Workspaces from before profiles could be managed had three fixed ones. Until
 * the first change writes `profiles.json`, those whose files exist stand in for it.
 */
const LEGACY_PROFILES: ResumeProfile[] = [
  { id: 'ai', name: 'AI Engineer', archetypes: ['ai-llm'] },
  { id: 'ml', name: 'ML Engineer', archetypes: ['ml-engineering', 'ml-performance'] },
  { id: 'ds', name: 'Data Scientist', archetypes: ['data-science'] },
]

const registrySchema = z.array(z.object({
  id: z.string().refine(isProfileId, 'invalid profile id'),
  name: z.string().trim().min(1).max(NAME_MAX),
  archetypes: z.array(z.enum(ARCHETYPES)),
}).strict())

/** A request the caller can fix; `status` is the HTTP status the API answers with. */
export class ResumeProfileError extends Error {
  constructor(message: string, readonly status: 400 | 404 | 409) {
    super(message)
    this.name = 'ResumeProfileError'
  }
}

/** Untrusted request fields; every one is validated here. */
export interface ProfileInput {
  name: unknown
  archetypes: unknown
}

export interface CreateProfileInput extends ProfileInput {
  /** The general resume whose files the new profile starts as a copy of: `general` or a profile id. */
  from: unknown
}

export async function readProfiles(): Promise<ResumeProfile[]> {
  let raw: string
  try { raw = await readFile(PATHS.resumeProfiles, 'utf-8') } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    return LEGACY_PROFILES.filter((profile) => LANGS.some((lang) => existsSync(profileCvPaths(profile.id)[lang])))
  }
  return registrySchema.parse(JSON.parse(raw))
}

async function writeProfiles(profiles: ResumeProfile[]): Promise<void> {
  const file = PATHS.resumeProfiles
  await mkdir(dirname(file), { recursive: true })
  const temp = `${file}.${randomUUID()}.tmp`
  try {
    await writeFile(temp, `${JSON.stringify(profiles, null, 2)}\n`, 'utf-8')
    await rename(temp, file)
  } finally { await rm(temp, { force: true }) }
}

/** One change at a time, so two requests never both read the same registry and drop each other's edit. */
let pending: Promise<unknown> = Promise.resolve()
function serialized<T>(operation: () => Promise<T>): Promise<T> {
  const next = pending.then(operation)
  pending = next.catch(() => {})
  return next
}

function validName(input: unknown, others: ResumeProfile[]): string {
  const name = typeof input === 'string' ? input.trim().replace(/\s+/g, ' ') : ''
  if (!name) throw new ResumeProfileError('Give the profile a name.', 400)
  if (name.length > NAME_MAX) throw new ResumeProfileError(`Keep the name under ${NAME_MAX} characters.`, 400)
  if (!slugify(name)) throw new ResumeProfileError('Use at least one letter or digit in the name.', 400)
  const lower = name.toLowerCase()
  if (lower === GENERAL_BASE.name.toLowerCase() || lower === 'master' || others.some((profile) => profile.name.toLowerCase() === lower)) {
    throw new ResumeProfileError(`A resume named ${name} already exists.`, 409)
  }
  return name
}

/** A role type leads to one starting resume, so two profiles cannot claim the same one. */
function validArchetypes(input: unknown, others: ResumeProfile[]): Archetype[] {
  if (!Array.isArray(input)) throw new ResumeProfileError('archetypes must be a list.', 400)
  const archetypes = ARCHETYPES.filter((archetype) => input.includes(archetype))
  if (archetypes.length !== new Set(input).size) throw new ResumeProfileError('Unknown role type.', 400)
  for (const archetype of archetypes) {
    const owner = others.find((profile) => profile.archetypes.includes(archetype))
    if (owner) throw new ResumeProfileError(`${owner.name} is already picked for that role type. Untick it there first.`, 409)
  }
  return archetypes
}

/** A folder id from the name, numbered when an earlier profile's files still occupy it. */
function freshId(name: string, profiles: ResumeProfile[]): string {
  const base = slugify(name).slice(0, 40).replace(/-+$/, '')
  const taken = (id: string) => !isProfileId(id) || profiles.some((profile) => profile.id === id) || LANGS.some((lang) => existsSync(dirname(profileCvPaths(id)[lang])))
  if (!taken(base)) return base
  for (let n = 2; ; n++) if (!taken(`${base}-${n}`)) return `${base}-${n}`
}

/** Copy the starting resume's files, both languages where they exist, into the new profile's folders. */
export async function createProfile(input: CreateProfileInput): Promise<ResumeProfile> {
  return serialized(async () => {
    const profiles = await readProfiles()
    const name = validName(input.name, profiles)
    const archetypes = validArchetypes(input.archetypes, profiles)
    const from = input.from === GENERAL_BASE.id ? null : profiles.find((profile) => profile.id === input.from)?.id
    if (from === undefined) throw new ResumeProfileError('Start from the all-round resume or an existing profile.', 400)
    const sources = LANGS.filter((lang) => existsSync(resumeSourcePath('ownCv', lang, from)))
    if (!sources.length) throw new ResumeProfileError('That resume has no files to copy yet. Write it first, or start from another.', 409)

    const profile: ResumeProfile = { id: freshId(name, profiles), name, archetypes }
    const target = profileCvPaths(profile.id)
    const made: string[] = []
    try {
      for (const lang of sources) {
        const folder = dirname(target[lang])
        await mkdir(folder, { recursive: true })
        made.push(folder)
        const source = resumeSourcePath('ownCv', lang, from)
        await copyFile(source, target[lang])
        // The PDF is copied after the YAML so it reads as up to date, which it is.
        if (existsSync(resumePdfPath(source))) await copyFile(resumePdfPath(source), resumePdfPath(target[lang]))
      }
      await writeProfiles([...profiles, profile])
    } catch (error) {
      await Promise.all(made.map((folder) => rm(folder, { recursive: true, force: true })))
      throw error
    }
    return profile
  })
}

export async function updateProfile(id: string, input: ProfileInput): Promise<ResumeProfile> {
  return serialized(async () => {
    const profiles = await readProfiles()
    const current = profiles.find((profile) => profile.id === id)
    if (!current) throw new ResumeProfileError(`No resume profile '${id}'.`, 404)
    const others = profiles.filter((profile) => profile !== current)
    const updated: ResumeProfile = { id, name: validName(input.name, others), archetypes: validArchetypes(input.archetypes, others) }
    await writeProfiles(profiles.map((profile) => profile === current ? updated : profile))
    return updated
  })
}

export interface DeletedProfile {
  id: string
  /** The trashed folders under `state/.trash/resume-profiles/`. */
  trashedAs: string[]
}

/** Unregister a profile and move its folders to the trash; applications already made keep their own copies. */
export async function deleteProfile(id: string): Promise<DeletedProfile> {
  return serialized(async () => {
    const profiles = await readProfiles()
    if (!profiles.some((profile) => profile.id === id)) throw new ResumeProfileError(`No resume profile '${id}'.`, 404)
    const stamp = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`
    const moved: { from: string; to: string }[] = []
    try {
      for (const lang of LANGS) {
        const folder = dirname(profileCvPaths(id)[lang])
        if (!existsSync(folder)) continue
        await mkdir(PATHS.profileTrash, { recursive: true })
        const to = join(PATHS.profileTrash, `${basename(folder)}--deleted-${stamp}`)
        await rename(folder, to)
        moved.push({ from: folder, to })
      }
      await writeProfiles(profiles.filter((profile) => profile.id !== id))
    } catch (error) {
      await Promise.all(moved.map(({ from, to }) => rename(to, from).catch(() => {})))
      throw error
    }
    return { id, trashedAs: moved.map(({ to }) => basename(to)) }
  })
}
