import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const originalCwd = process.cwd()
const root = await mkdtemp(join(tmpdir(), 'onward-cli-'))

try {
  // The sandbox below the temp root is the workspace, not the example data.
  delete process.env.ONWARD_WORKSPACE
  process.chdir(root)
  const { PATHS } = await import('../src/lib/paths')
  const { runCli } = await import('../src/lib/cli')
  await mkdir(PATHS.state, { recursive: true })
  await mkdir(join(PATHS.applications, 'acme-2026-09-02'), { recursive: true })

  const untouched = '| 1 | 2026-09-01 | Kept | Data Scientist | 4/5 | Applied | ✅ | — | untouched row |'
  await writeFile(
    PATHS.tracker,
    [
      '# Applications',
      '',
      '| # | Date | Company | Role | Score | Status | PDF | Report | Notes |',
      '|---|------|---------|------|-------|--------|-----|--------|-------|',
      '| 2 | 2026-09-02 | Acme | AI Engineer | N/A | Evaluated | ❌ | — | first note |',
      untouched,
      '',
    ].join('\n'),
  )
  await writeFile(PATHS.appIndex, JSON.stringify({ 2: 'acme-2026-09-02' }, null, 2) + '\n')
  await writeFile(join(PATHS.applications, 'acme-2026-09-02', 'jd.md'), 'job description')

  const now = new Date('2026-09-03T12:00:00')
  async function run(...argv: string[]) {
    const out: string[] = []
    const err: string[] = []
    const code = await runCli(argv, { out: (l) => out.push(l), err: (l) => err.push(l), now })
    return { code, out: out.join('\n'), err: err.join('\n') }
  }
  const tracker = () => readFile(PATHS.tracker, 'utf-8')

  // Reading
  assert.match((await run('help')).out, /apps list/)
  let r = await run('apps', 'list')
  assert.equal(r.code, 0)
  assert.match(r.out, /#2 .*Acme — AI Engineer/)
  assert.match(r.out, /2 applications/)
  r = await run('apps', 'list', '--status', 'applied', '--json')
  assert.deepEqual(JSON.parse(r.out).map((row: { id: number }) => row.id), [1], 'Status filter ignores case')
  r = await run('apps', 'list', '--since', '2026-09-02', '--json')
  assert.deepEqual(JSON.parse(r.out).map((row: { id: number }) => row.id), [2])
  assert.match((await run('apps', 'list', '--search', 'nothing-like-this')).out, /No applications match/)
  r = await run('apps', 'show', '2')
  assert.match(r.out, /Folder: +workspace\/applications\/acme-2026-09-02/)
  assert.match(r.out, /jd\.md/)
  assert.match((await run('apps', 'show', 'acme-2026-09-02')).out, /#2 Acme/, 'Folder keys work too')
  assert.equal((await run('apps', 'show', '99')).code, 1)

  // Rejected writes leave the tracker byte-identical
  const before = await tracker()
  for (const argv of [
    ['apps', 'update', '2', '--status', 'Tailored'],
    ['apps', 'update', '2', '--notes', 'a | b'],
    ['apps', 'update', '2', '--notes', 'line\nbreak'],
    ['apps', 'update', '2'],
    ['apps', 'add', '--company', 'NoRole'],
    ['apps', 'add', '--company', 'Acme', '--role', 'AI Engineer'],
    ['apps', 'add', '--company', 'New', '--role', 'ML', '--date', '2026-13-45'],
    ['apps', 'delete', '2'],
    ['nonsense'],
  ]) {
    r = await run(...argv)
    assert.equal(r.code, 1, `should reject: ${argv.join(' ')}`)
    assert.match(r.err, /^error: /)
  }
  assert.equal(await tracker(), before)
  assert.match((await run('apps', 'add', '--company', 'acme', '--role', 'AI engineer')).err, /already have.*--force/)

  // Adding and updating
  r = await run('apps', 'add', '--company', 'Globex', '--role', 'ML Engineer', '--notes', 'Found on LinkedIn.')
  assert.equal(r.code, 0, r.err)
  let text = await tracker()
  assert.ok(text.includes('| 3 | 2026-09-03 | Globex | ML Engineer | N/A | Applied | ❌ | — | Found on LinkedIn. |'))
  assert.ok(text.indexOf('| 3 |') < text.indexOf('| 2 |'), 'New rows go on top')

  r = await run('apps', 'update', '2', '--status', 'interview', '--append-note', 'Call booked.')
  assert.equal(r.code, 0, r.err)
  text = await tracker()
  assert.ok(text.includes('| 2 | 2026-09-02 | Acme | AI Engineer | N/A | Interview | ❌ | — | first note Call booked. |'))
  assert.ok(text.includes(untouched + '\n'), 'Untouched rows stay byte-identical')
  assert.ok(text.endsWith('\n'))

  // Deleting keeps the folder in the trash
  r = await run('apps', 'delete', '2', '--yes')
  assert.equal(r.code, 0, r.err)
  assert.match(r.out, /\.trash\/applications\/acme-2026-09-02--deleted-/)
  assert.ok(!(await tracker()).includes('| 2 |'))
  assert.deepEqual(JSON.parse(await readFile(PATHS.appIndex, 'utf-8')), {})

  // Stats and goal
  r = await run('stats', '--json')
  assert.equal(JSON.parse(r.out).total, 2)
  assert.match((await run('goal')).out, /No goal set/)
  assert.equal((await run('goal', 'set', '0', 'week')).code, 1)
  assert.equal((await run('goal', 'set', '5', 'year')).code, 1)
  assert.equal((await run('goal', 'set', '5', 'week')).code, 0)
  assert.deepEqual(JSON.parse(await readFile(PATHS.goal, 'utf-8')), { amount: 5, unit: 'week' })
  assert.match((await run('goal')).out, /Week +2\/5/)
  assert.equal((await run('goal', 'clear')).code, 0)
  assert.match((await run('goal')).out, /No goal set/)

  // Saved searches
  const url = 'https://www.linkedin.com/jobs/search/?keywords=ML&location=Ireland&f_TPR=r86400'
  assert.match((await run('searches')).out, /No saved searches/)
  r = await run('searches', 'add', '--title', 'Ireland', '--url', url, '--track', 'Europe')
  assert.equal(r.code, 0, r.err)
  for (const bad of ['javascript:alert(1)', 'not a url', 'https://user:pass@example.com']) {
    assert.equal((await run('searches', 'add', '--title', 'Bad', '--url', bad)).code, 1)
  }
  assert.equal((await run('searches', 'add', '--url', url)).code, 1, 'Title is required')
  assert.equal((await run('searches', 'update', 'ireland', '--notes', 'Past 24 hours')).code, 0)
  let saved = JSON.parse(await readFile(PATHS.savedSearches, 'utf-8'))
  assert.equal(saved.length, 1)
  assert.equal(saved[0].url, url, 'Filters are kept verbatim')
  assert.equal(saved[0].notes, 'Past 24 hours')
  assert.equal((await run('searches', 'remove', 'Nowhere')).code, 1)
  assert.equal((await run('searches', 'remove', saved[0].id)).code, 0)
  saved = JSON.parse(await readFile(PATHS.savedSearches, 'utf-8'))
  assert.deepEqual(saved, [])

  console.log('cli: listing, filters, add, update, delete, stats, goal, saved searches and rejected inputs passed')
} finally {
  process.chdir(originalCwd)
  await rm(root, { recursive: true, force: true })
}
