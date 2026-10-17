import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { daysSince, normalizePostingUrl, parsePostingSource, withPostingUrl } from '../src/lib/postingSource'
import { jdMarkdown } from '../src/lib/tailoring/seed'

// The convention jdMarkdown writes: the URL on line 1, then the posting.
const linked = jdMarkdown('Enterprise AI Engineer II\n\n- Build LLM apps', 'https://www.linkedin.com/jobs/view/4439095562/')
assert.deepEqual(parsePostingSource(linked), {
  url: 'https://www.linkedin.com/jobs/view/4439095562/',
  host: 'linkedin.com',
  body: 'Enterprise AI Engineer II\n\n- Build LLM apps',
})

// The placeholder line, and the older hand-written one, are dropped from the text.
assert.deepEqual(parsePostingSource(jdMarkdown('Role text', '')), { url: null, host: null, body: 'Role text' })
assert.deepEqual(parsePostingSource('Source URL: not provided; posting pasted by the candidate.\n\nRole text'), { url: null, host: null, body: 'Role text' })

// A posting with no source line keeps every line.
assert.deepEqual(parsePostingSource('Senior Data Scientist\nAmsterdam'), { url: null, host: null, body: 'Senior Data Scientist\nAmsterdam' })
assert.deepEqual(parsePostingSource(null), { url: null, host: null, body: '' })
assert.deepEqual(parsePostingSource('\r\nhttps://jobs.example.com/1\r\n\r\nText'), { url: 'https://jobs.example.com/1', host: 'jobs.example.com', body: 'Text' })

// Only http(s) links are accepted.
assert.equal(normalizePostingUrl('  https://jobs.sagacify.com/jobs/aiml?utm_source=linkedin  '), 'https://jobs.sagacify.com/jobs/aiml?utm_source=linkedin')
for (const bad of ['javascript:alert(1)', 'mailto:hr@acme.io', 'not a url', 'https://a b.com', '', 42, null]) {
  assert.equal(normalizePostingUrl(bad), null, String(bad))
}
assert.equal(parsePostingSource('javascript:alert(1)\n\nText').url, null)

// Adding a link replaces the placeholder or the old link and leaves the posting byte-identical.
const placeholder = jdMarkdown('Role text\n\n- one\n- two', '')
const added = withPostingUrl(placeholder, 'https://www.linkedin.com/jobs/view/1/')
assert.equal(added, jdMarkdown('Role text\n\n- one\n- two', 'https://www.linkedin.com/jobs/view/1/'))
assert.equal(withPostingUrl(added, 'https://jobs.example.com/2'), jdMarkdown('Role text\n\n- one\n- two', 'https://jobs.example.com/2'))
assert.equal(withPostingUrl('Source URL: not provided.\n\nRole', 'https://x.io/j'), 'https://x.io/j\n\nRole')
// No source line at all: the link goes above the posting.
assert.equal(withPostingUrl('Role text\n', 'https://x.io/j'), 'https://x.io/j\n\nRole text\n')
assert.throws(() => withPostingUrl(placeholder, 'ftp://x.io/j'), /http\(s\) URL/)

// Days since applying, for the follow-up nudge.
const now = new Date('2026-10-15T12:00:00')
assert.equal(daysSince('2026-10-08', now), 7)
assert.equal(daysSince('2026-10-15T09:00:00', now), 0)
assert.equal(daysSince('2026-10-20', now), 0)
assert.equal(daysSince(null, now), null)
assert.equal(daysSince('garbage', now), null)

// Every saved posting on disk parses, and none of them leaks its source line into the text.
const root = join(process.env.ONWARD_WORKSPACE || 'workspace', 'applications')
let checked = 0
try {
  for (const folder of readdirSync(root)) {
    let jd: string
    try { jd = readFileSync(join(root, folder, 'jd.md'), 'utf-8') } catch { continue }
    const parsed = parsePostingSource(jd)
    assert.ok(parsed.body.length > 0, `${folder}: empty posting body`)
    assert.ok(!/^(?:\(no source url given\)|source url:)/i.test(parsed.body), `${folder}: placeholder left in body`)
    if (parsed.url) assert.ok(!parsed.body.startsWith(parsed.url), `${folder}: URL left in body`)
    checked++
  }
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
}

console.log(`Posting source: link line, placeholders, link edits, follow-up days, ${checked} saved postings pass`)
