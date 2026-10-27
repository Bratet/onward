import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'

const original = process.cwd()
const root = await mkdtemp(join(tmpdir(), 'onward-profiles-test-'))
try {
  // The sandbox below the temp root is the workspace, not the example data. The
  // app modules resolve the workspace when they load, so they are imported after the switch.
  delete process.env.ONWARD_WORKSPACE
  process.chdir(root)
  const { PATHS, profileCvPaths, resumePdfPath, baseCvPath } = await import('../src/lib/paths')
  const { createProfile, deleteProfile, readProfiles, updateProfile, ResumeProfileError } = await import('../src/lib/resumeProfiles')
  const { defaultBaseCv } = await import('../src/lib/tailoring/baseCv')
  const { PUT } = await import('../src/app/api/masters/[lang]/route')
  const { POST } = await import('../src/app/api/profile/resumes/route')
  const { DELETE, PATCH } = await import('../src/app/api/profile/resumes/[id]/route')

  const rejects = async (operation: Promise<unknown>, status: number) => {
    await assert.rejects(operation, (error) => error instanceof ResumeProfileError && error.status === status)
  }
  const general = { en: 'cv:\n  name: General en\n', fr: 'cv:\n  name: General fr\n' }
  for (const lang of ['en', 'fr'] as const) {
    await mkdir(dirname(PATHS.ownCv[lang]), { recursive: true })
    await writeFile(PATHS.ownCv[lang], general[lang])
  }
  await writeFile(resumePdfPath(PATHS.ownCv.en), 'pdf en')

  // A workspace from before profiles were managed keeps the fixed ones whose files exist.
  assert.deepEqual(await readProfiles(), [])
  await mkdir(dirname(profileCvPaths('ml').fr), { recursive: true })
  await writeFile(profileCvPaths('ml').fr, 'cv:\n  name: ML fr\n')
  assert.deepEqual((await readProfiles()).map((profile) => profile.id), ['ml'])
  assert.equal(defaultBaseCv('ml-performance', await readProfiles()), 'ml')

  // Creating copies both languages of the starting resume, PDF included, and registers the profile.
  const backend = await createProfile({ name: '  Backend   Engineer ', archetypes: ['software'], from: 'general' })
  assert.deepEqual(backend, { id: 'backend-engineer', name: 'Backend Engineer', archetypes: ['software'] })
  for (const lang of ['en', 'fr'] as const) assert.equal(await readFile(profileCvPaths(backend.id)[lang], 'utf-8'), general[lang])
  assert.equal(await readFile(resumePdfPath(profileCvPaths(backend.id).en), 'utf-8'), 'pdf en')
  assert.ok(!existsSync(resumePdfPath(profileCvPaths(backend.id).fr)), 'no PDF is invented for a language without one')
  assert.deepEqual((await readProfiles()).map((profile) => profile.id), ['ml', 'backend-engineer'], 'the first write keeps the legacy profile')
  assert.equal(defaultBaseCv('software', await readProfiles()), 'backend-engineer')
  assert.equal(defaultBaseCv('data-science', await readProfiles()), 'general')
  assert.equal(baseCvPath('backend-engineer', 'fr'), profileCvPaths('backend-engineer').fr)

  // A profile with one language starts a copy with only that language.
  const research = await createProfile({ name: 'Research', archetypes: [], from: 'ml' })
  assert.ok(existsSync(profileCvPaths(research.id).fr) && !existsSync(profileCvPaths(research.id).en))
  assert.equal(baseCvPath(research.id, 'en'), PATHS.ownCv.en, 'a missing language falls back to the all-round resume')

  // Names, role types and starting points are validated; nothing is written on rejection.
  const before = await readFile(PATHS.resumeProfiles, 'utf-8')
  await rejects(createProfile({ name: 'backend engineer', archetypes: [], from: 'general' }), 409)
  await rejects(createProfile({ name: 'All-round', archetypes: [], from: 'general' }), 409)
  await rejects(createProfile({ name: 'Master', archetypes: [], from: 'general' }), 409)
  await rejects(createProfile({ name: '   ', archetypes: [], from: 'general' }), 400)
  await rejects(createProfile({ name: '!!!', archetypes: [], from: 'general' }), 400)
  await rejects(createProfile({ name: 'x'.repeat(41), archetypes: [], from: 'general' }), 400)
  await rejects(createProfile({ name: 'Platform', archetypes: ['software'], from: 'general' }), 409)
  await rejects(createProfile({ name: 'Platform', archetypes: ['astrology'], from: 'general' }), 400)
  await rejects(createProfile({ name: 'Platform', archetypes: [], from: '../general' }), 400)
  await rejects(createProfile({ name: 'Platform', archetypes: [], from: 'missing' }), 400)
  assert.equal(await readFile(PATHS.resumeProfiles, 'utf-8'), before)
  assert.ok(!existsSync(join(PATHS.ownCvRoot, 'platform-en')))

  // A name that slugs to a reserved or occupied folder gets a fresh id.
  const generalNamed = await createProfile({ name: 'General', archetypes: [], from: 'general' })
  assert.equal(generalNamed.id, 'general-2')
  await mkdir(join(PATHS.ownCvRoot, 'ops-en'))
  assert.equal((await createProfile({ name: 'Ops', archetypes: [], from: 'general' })).id, 'ops-2')

  // Concurrent creations both land.
  await Promise.all([
    createProfile({ name: 'Alpha', archetypes: ['ai-llm'], from: 'general' }),
    createProfile({ name: 'Beta', archetypes: ['data-science'], from: 'general' }),
  ])
  assert.equal((await readProfiles()).filter((profile) => profile.id === 'alpha' || profile.id === 'beta').length, 2)

  // Updating renames and moves role types; the folder keeps its id.
  const renamed = await updateProfile('backend-engineer', { name: 'Platform Engineer', archetypes: ['software', 'other'] })
  assert.deepEqual(renamed, { id: 'backend-engineer', name: 'Platform Engineer', archetypes: ['software', 'other'] })
  await rejects(updateProfile('backend-engineer', { name: 'Alpha', archetypes: [] }), 409)
  await rejects(updateProfile('backend-engineer', { name: 'Platform Engineer', archetypes: ['ai-llm'] }), 409)
  await rejects(updateProfile('nope', { name: 'Nope', archetypes: [] }), 404)

  // The editor saves into a registered profile, and refuses one that is not.
  const saved = 'cv:\n  name: Platform en\n'
  const put = (query: string) => PUT(new Request(`http://localhost/api/masters/en?${query}`, { method: 'PUT', body: JSON.stringify({ yaml: saved }) }), { params: Promise.resolve({ lang: 'en' }) })
  assert.equal((await put('family=ownCv&variant=backend-engineer')).status, 200)
  assert.equal(await readFile(profileCvPaths('backend-engineer').en, 'utf-8'), saved)
  assert.equal(await readFile(PATHS.ownCv.en, 'utf-8'), general.en, 'a profile save leaves the all-round resume alone')
  for (const query of ['family=ownCv&variant=unregistered', 'family=ownCv&variant=../x', 'family=masters&variant=backend-engineer']) {
    assert.equal((await put(query)).status, 400, query)
  }

  // Deleting unregisters the profile and moves its folders to the trash.
  const deleted = await deleteProfile('backend-engineer')
  assert.equal(deleted.trashedAs.length, 2)
  assert.ok(!existsSync(dirname(profileCvPaths('backend-engineer').en)) && !existsSync(dirname(profileCvPaths('backend-engineer').fr)))
  const trashed = await readdir(PATHS.profileTrash)
  assert.deepEqual(trashed.sort(), [...deleted.trashedAs].sort())
  const trashedEn = deleted.trashedAs.find((name) => name.startsWith('backend-engineer-en--deleted-'))!
  assert.equal(await readFile(join(PATHS.profileTrash, trashedEn, basename(profileCvPaths('backend-engineer').en)), 'utf-8'), saved)
  assert.ok(!(await readProfiles()).some((profile) => profile.id === 'backend-engineer'))
  assert.equal(baseCvPath('backend-engineer', 'en'), PATHS.ownCv.en, 'an application pointing at a deleted profile starts from the all-round resume')
  await rejects(deleteProfile('backend-engineer'), 404)
  await rejects(deleteProfile('../general'), 404)

  // The API maps validation to status codes and refuses cross-origin writes.
  const json = (method: string, url: string, body?: unknown, origin?: string) => new Request(url, {
    method, body: body === undefined ? undefined : JSON.stringify(body), headers: origin ? { origin } : {},
  })
  const created = await POST(json('POST', 'http://localhost/api/profile/resumes', { name: 'Gamma', archetypes: [] }))
  assert.equal(created.status, 201)
  assert.equal((await created.json()).profile.id, 'gamma')
  assert.equal((await POST(json('POST', 'http://localhost/api/profile/resumes', { name: 'Gamma', archetypes: [] }))).status, 409)
  assert.equal((await POST(json('POST', 'http://localhost/api/profile/resumes', { name: 'Delta' }, 'http://evil.test'))).status, 403)
  const params = (id: string) => ({ params: Promise.resolve({ id }) })
  assert.equal((await PATCH(json('PATCH', 'http://localhost/api/profile/resumes/gamma', { name: 'Gamma Ray', archetypes: ['applied-research'] }), params('gamma'))).status, 200)
  assert.equal((await DELETE(json('DELETE', 'http://localhost/api/profile/resumes/gamma', undefined, 'http://evil.test'), params('gamma'))).status, 403)
  assert.equal((await DELETE(json('DELETE', 'http://localhost/api/profile/resumes/gamma'), params('gamma'))).status, 200)
  assert.equal((await DELETE(json('DELETE', 'http://localhost/api/profile/resumes/gamma'), params('gamma'))).status, 404)

  console.log('Resume profiles: legacy defaults, create, copy, validation, fresh ids, concurrency, update, editor saves, delete to trash and API status codes pass')
} finally {
  process.chdir(original)
  await rm(root, { recursive: true, force: true })
}
