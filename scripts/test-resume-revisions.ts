import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const original = process.cwd()
const root = await mkdtemp(join(tmpdir(), 'onward-revisions-test-'))
try {
  // The sandbox below the temp root is the workspace, not the example data. The
  // app modules resolve the workspace when they load, so they are imported after the switch.
  delete process.env.ONWARD_WORKSPACE
  process.chdir(root)
  const { PATHS } = await import('../src/lib/paths')
  const { KEPT_REVISIONS, keepRevision, listRevisions, revisionDir } = await import('../src/lib/resumeRevisions')
  const { PUT } = await import('../src/app/api/masters/[lang]/route')

  const put = async (yaml: string) => {
    const response = await PUT(
      new Request('http://localhost/api/masters/en?family=masters', { method: 'PUT', body: JSON.stringify({ yaml }) }),
      { params: Promise.resolve({ lang: 'en' }) },
    )
    assert.equal(response.status, 200)
    return (await response.json()) as { changed: boolean; revisionKept: boolean }
  }
  const master = PATHS.masters.en
  const first = 'cv:\n  name: First\n'
  const second = 'cv:\n  name: Second\n'

  // The first save creates the file: there is nothing earlier to keep.
  assert.deepEqual(await put(first).then(({ changed, revisionKept }) => ({ changed, revisionKept })), { changed: true, revisionKept: false })
  assert.deepEqual(await listRevisions(master), [])

  // A save that changes the master keeps the text it replaced.
  assert.deepEqual(await put(second).then(({ changed, revisionKept }) => ({ changed, revisionKept })), { changed: true, revisionKept: true })
  const [kept] = await listRevisions(master)
  assert.equal(await readFile(join(revisionDir(master), kept), 'utf-8'), first)
  assert.equal(await readFile(master, 'utf-8'), second)

  // Saving the same text leaves the file and its history alone.
  const before = (await stat(master)).mtimeMs
  assert.deepEqual(await put(second).then(({ changed, revisionKept }) => ({ changed, revisionKept })), { changed: false, revisionKept: false })
  assert.equal((await stat(master)).mtimeMs, before)
  assert.equal((await listRevisions(master)).length, 1)

  // The two masters share a folder but not a history.
  assert.notEqual(revisionDir(PATHS.masters.en), revisionDir(PATHS.masters.fr))
  assert.deepEqual(await listRevisions(PATHS.masters.fr), [])

  // Only the newest versions are kept, newest first, even within one millisecond.
  for (let n = 0; n < KEPT_REVISIONS + 5; n++) await keepRevision(master, `cv:\n  name: v${n}\n`)
  const names = await listRevisions(master)
  assert.equal(names.length, KEPT_REVISIONS)
  const contents = await Promise.all(names.map((name) => readFile(join(revisionDir(master), name), 'utf-8')))
  assert.deepEqual(contents, Array.from({ length: KEPT_REVISIONS }, (_, i) => `cv:\n  name: v${KEPT_REVISIONS + 4 - i}\n`))

  // Only files under workspace/resumes/ have a history.
  assert.throws(() => revisionDir(PATHS.tracker), /not a resume source/)
  assert.throws(() => revisionDir(join(PATHS.resumes, '..', 'escape.yaml')), /not a resume source/)

  console.log('Resume revisions: first save, kept on change, no-op save, per-file history, pruning order and path guard pass')
} finally {
  process.chdir(original)
  await rm(root, { recursive: true, force: true })
}
