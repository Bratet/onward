'use client'

import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ChevronDown, ChevronRight, CircleCheck, CircleDot, CircleX, Copy, MessageSquareText, Search, X } from 'lucide-react'
import type { ApplicationRecord } from '@/lib/applicationRecord'
import type { ApplicationWorkspace } from '@/lib/workspaces'
import type { ProfileFitRow } from '@/lib/profileFit'
import { Empty, Spinner } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'

/**
 * The job, shared by the preparation steps and the sent page: the posting as
 * it was saved, and what it asks for with how the resume stands on each.
 */

const primary = 'inline-flex items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-xs font-semibold text-[var(--color-bg)] hover:opacity-90 disabled:opacity-40'
const input = 'w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)] disabled:opacity-60'

export type Requirement = Omit<ProfileFitRow, 'classification'> & { classification: ProfileFitRow['classification'] | null }
type Standing = ProfileFitRow['classification']

const STANDING: Record<Standing, { icon: ReactNode; text: string; card: string }> = {
  direct: { icon: <CircleCheck size={14} aria-hidden="true" />, text: 'text-[var(--color-ok)]', card: 'border-[var(--color-border)] bg-[var(--color-surface)]' },
  supporting: { icon: <CircleDot size={14} aria-hidden="true" />, text: 'text-[var(--color-warn)]', card: 'border-[var(--color-warn)]/30 bg-[var(--color-surface)]' },
  gap: { icon: <CircleX size={14} aria-hidden="true" />, text: 'text-[var(--color-bad)]', card: 'border-[var(--color-bad)]/40 bg-[var(--color-bad-soft)]' },
}

/** The coverage line and its bar: must-haves backed, by related experience, and the verdict. */
export function FitSummary({ rows, fit }: { rows: Requirement[]; fit: NonNullable<ApplicationWorkspace['fit']['report']> }) {
  const counts = (['direct', 'supporting', 'gap'] as const).map((key) => ({ key, count: rows.filter((row) => row.classification === key).length }))
  // Related experience is a partial match, so it is counted apart from what is backed.
  const mustDirect = rows.filter((row) => row.weight === 'must' && row.classification === 'direct').length
  const mustRelated = rows.filter((row) => row.weight === 'must' && row.classification === 'supporting').length
  return <div className="min-w-0">
    <p className="text-sm text-[var(--color-muted)]"><span className="font-semibold text-[var(--color-text)] tnum">{mustDirect} of {fit.coverage.must.total}</span> must-haves backed{mustRelated ? <>, <span className="tnum">{mustRelated}</span> by related experience</> : null} · {fit.verdict} fit</p>
    <div className="mt-2 flex h-1.5 max-w-md overflow-hidden rounded-full bg-[var(--color-surface-2)]" aria-hidden="true">
      {counts.map(({ key, count }) => count ? <span key={key} style={{ flexGrow: count }} className={cn(key === 'direct' ? 'bg-[var(--color-ok)]' : key === 'supporting' ? 'bg-[var(--color-warn)]' : 'bg-[var(--color-bad)]')} /> : null)}
    </div>
  </div>
}

const GROUP: Record<Standing, { title: string; hint: string }> = {
  gap: { title: 'Gaps', hint: 'Nothing on your resume shows these.' },
  supporting: { title: 'Related experience', hint: 'Your resume shows something close, not the thing itself.' },
  direct: { title: 'Backed by your resume', hint: '' },
}

const requirementGrid = 'grid gap-2.5 @min-[38rem]/requirements:grid-cols-2'

/**
 * What the posting asks for, grouped by how your resume stands: gaps first,
 * then related experience, each a card one click from the AI. Backed
 * requirements open into the same cards.
 * `summary` adds the coverage line above, for pages without one of their own.
 */
export function Requirements({ rows, fit, onAsk, summary = true, between }: { rows: Requirement[]; fit: ApplicationWorkspace['fit']['report']; onAsk?: (row: Requirement) => void; summary?: boolean; between?: ReactNode }) {
  const [backedOpen, setBackedOpen] = useState(false)
  const sorted = [...rows].sort((a, b) => (a.weight === b.weight ? 0 : a.weight === 'must' ? -1 : 1) || a.rank - b.rank)
  const group = (key: Standing) => sorted.filter((row) => row.classification === key)
  const backed = group('direct')

  return <section aria-labelledby="asked-title" className="@container/requirements min-w-0 space-y-6">
    {summary ? <header className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <h2 id="asked-title" className="mb-1 text-base font-semibold tracking-tight">What they asked for</h2>
      {fit ? <FitSummary rows={rows} fit={fit} /> : <p className="text-sm text-[var(--color-muted)]">Not checked against your resume yet.</p>}
    </header> : <h2 id="asked-title" className="sr-only">What they asked for</h2>}

    {!fit ? <ol className={requirementGrid}>{sorted.map((row) => <RequirementCard key={`${row.weight}-${row.rank}`} row={row} />)}</ol> : <>
      {(['gap', 'supporting'] as const).map((key, index) => {
        const list = group(key)
        return <Fragment key={key}>
          {list.length ? <div className="space-y-2.5">
            <GroupTitle standing={key} count={list.length} hint={GROUP[key].hint} />
            <ol className={requirementGrid}>{list.map((row, i) => <RequirementCard key={`${row.weight}-${row.rank}`} row={row} onAsk={onAsk} delay={i} />)}</ol>
          </div> : null}
          {index === 0 ? between : null}
        </Fragment>
      })}
      {backed.length ? <div className="space-y-2.5">
        <button type="button" aria-expanded={backedOpen} onClick={() => setBackedOpen((open) => !open)} className="flex w-full cursor-pointer items-center gap-2 rounded-lg py-1 text-left transition-colors hover:text-[var(--color-ok)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]">
          <span className="text-[var(--color-ok)]">{STANDING.direct.icon}</span>
          <span className="flex-1 text-sm font-semibold">{GROUP.direct.title} <span className="font-normal tnum text-[var(--color-muted)]">{backed.length}</span></span>
          <span className="text-xs text-[var(--color-muted)]">{backedOpen ? 'Hide' : 'Show'}</span>
          <ChevronDown size={14} aria-hidden="true" className={cn('text-[var(--color-muted)] transition-transform', !backedOpen && '-rotate-90')} />
        </button>
        {backedOpen ? <ol className={cn('anim-fade', requirementGrid)}>
          {backed.map((row, i) => <RequirementCard key={`${row.weight}-${row.rank}`} row={row} onAsk={onAsk} delay={i} />)}
        </ol> : null}
      </div> : null}
    </>}
  </section>
}

function GroupTitle({ standing, count, hint }: { standing: Standing; count: number; hint: string }) {
  return <div>
    <h3 className="flex items-center gap-2 text-sm font-semibold"><span className={STANDING[standing].text}>{STANDING[standing].icon}</span>{GROUP[standing].title}<span className="font-normal tnum text-[var(--color-muted)]">{count}</span></h3>
    {hint ? <p className="mt-0.5 pl-[22px] text-xs text-[var(--color-muted)]">{hint}</p> : null}
  </div>
}

/** A gap or related requirement: the text, then the evidence and the AI one click away on the same line. */
function RequirementCard({ row, onAsk, delay = 0 }: { row: Requirement; onAsk?: (row: Requirement) => void; delay?: number }) {
  const [open, setOpen] = useState(false)
  const standing = row.classification ? STANDING[row.classification] : null
  const link = 'group inline-flex cursor-pointer items-center gap-1 rounded text-xs font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]'
  return <li style={{ '--delay': `${Math.min(delay, 8) * 35}ms` } as CSSProperties} className={cn('anim-rise flex min-h-36 min-w-0 flex-col rounded-xl border px-4 pb-3 pt-3.5', standing?.card ?? 'border-[var(--color-border)] bg-[var(--color-surface)]')}>
    <p className="text-xs text-[var(--color-muted)]">{row.weight === 'must' ? 'Must-have' : 'Nice to have'}</p>
    <p className="mt-1 flex-1 break-words text-sm leading-relaxed">{row.requirement}</p>
    {open ? <Evidence items={row.evidence} /> : null}
    <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
      {row.evidence.length ? <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className={cn(link, 'text-[var(--color-muted)] hover:text-[var(--color-text)]')}>
        <ChevronDown size={13} aria-hidden="true" className={cn('transition-transform', !open && '-rotate-90')} />{row.classification === 'gap' ? 'What your resume shows' : 'What you can point to'}<span className="tnum opacity-70">{row.evidence.length}</span>
      </button> : <span />}
      {onAsk ? <button type="button" onClick={() => onAsk(row)} className={cn(link, 'text-[var(--color-accent)]')}>
        <MessageSquareText size={13} aria-hidden="true" />Have this? Tell the AI<ChevronRight size={13} aria-hidden="true" className="transition-transform group-hover:translate-x-0.5" />
      </button> : null}
    </div>
  </li>
}

function Evidence({ items }: { items: string[] }) {
  return <ul className="anim-fade mt-2.5 space-y-1.5 text-[13px] leading-relaxed text-[var(--color-muted)]">
    {items.map((item, index) => <li key={index} className="relative pl-3.5 before:absolute before:left-0 before:top-[0.6em] before:size-1 before:rounded-full before:bg-[var(--color-border-strong)]">{item}</li>)}
  </ul>
}

/**
 * The job as it was saved, set as a document: listings disappear within
 * weeks, so this copy stays. Searchable, with the posting's keywords marked.
 */
export function PostingDocument({ appKey, posting, keywords, hasJd, onCopy, extra }: { appKey: string; posting: ApplicationRecord['posting']; keywords: string[]; hasJd: boolean; onCopy: (text: string, what: string) => void; extra?: ReactNode }) {
  const [query, setQuery] = useState('')
  const [url, setUrl] = useState(posting.url)
  const body = posting.body
  const terms = useMemo(() => keywords.filter((word) => word.trim().length > 1), [keywords])
  const matches = useMemo(() => countMatches(body, query), [body, query])
  const text = useRef<HTMLDivElement>(null)
  // Bring the first match into view.
  useEffect(() => {
    text.current?.querySelector<HTMLElement>('mark[data-hit]')?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [query])

  return <article aria-labelledby="posting-title" className="min-w-0 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
    <header className="sticky top-16 z-10 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-t-xl border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 sm:px-6">
      <div className="min-w-0 flex-1">
        <h2 id="posting-title" className="text-base font-semibold tracking-tight">The job description</h2>
        {body && posting.savedAt ? <p className="text-xs text-[var(--color-faint)]">Saved <When iso={posting.savedAt} />, kept after the listing goes down</p> : null}
      </div>
      {body ? <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
        <label className="relative min-w-0 flex-1 sm:flex-none">
          <span className="sr-only">Find in the job description</span>
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-faint)]" aria-hidden="true" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find…" className="h-8 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] pl-8 pr-14 text-xs outline-none focus:border-[var(--color-accent)] sm:w-44 sm:transition-[width] sm:focus:w-60" />
          {query ? <span className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1 text-xs text-[var(--color-muted)] tnum">{matches}<button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="hover:text-[var(--color-text)]"><X size={12} /></button></span> : null}
        </label>
        <button type="button" onClick={() => onCopy(body, 'Job description')} aria-label="Copy the job description" title="Copy the text" className="grid size-8 shrink-0 place-items-center rounded-md border border-[var(--color-border)] text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"><Copy size={14} aria-hidden="true" /></button>
      </div> : null}
    </header>
    {!url && hasJd ? <PostingLink appKey={appKey} onSaved={setUrl} /> : null}
    {extra}
    {body
      ? <div ref={text} className="px-4 py-5 sm:px-8 sm:py-7"><PostingText text={body} terms={terms} query={query} /></div>
      : <Empty title="No job description saved" hint={hasJd ? 'The saved posting file is empty.' : 'This application was created without a posting, so there is nothing to show here.'} />}
  </article>
}

/** A posting saved without its link: paste it so the header can link back to the original listing. */
function PostingLink({ appKey, onSaved }: { appKey: string; onSaved: (url: string) => void }) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setBusy(true); setError(null)
    try {
      const response = await fetch(`/api/applications/${encodeURIComponent(appKey)}/posting-url`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: value }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'could not save the link')
      onSaved(data.url)
    } catch (reason) { setError((reason as Error).message) } finally { setBusy(false) }
  }

  return <form className="space-y-2 border-b border-[var(--color-border)] bg-[var(--color-bg)] px-6 py-3" onSubmit={(event) => { event.preventDefault(); void save() }}>
    <div className="flex flex-wrap gap-2">
      <input type="url" aria-label="Posting link" value={value} onChange={(event) => setValue(event.target.value)} placeholder="No link saved. Paste the posting link to keep it with the job" disabled={busy} className={cn(input, 'h-8 min-w-0 flex-1 py-1 text-xs')} />
      <button disabled={busy || !value.trim()} className={primary}>{busy ? <Spinner /> : null} Save link</button>
    </div>
    {error ? <p className="text-xs text-[var(--color-bad)]">{error}</p> : null}
  </form>
}

/**
 * Pasted postings come in loosely formatted: emoji-led heading lines, bullets
 * of every kind, and lists written as one sentence per paragraph. This reads
 * them as a document: headings, prose, and lists, including the run of short
 * one-line paragraphs that follows a line ending in a colon, until the next
 * section title.
 */
function PostingText({ text, terms, query }: { text: string; terms: string[]; query: string }) {
  const pattern = useMemo(() => highlightPattern(query ? [query, ...terms] : terms), [query, terms])
  const mark = (line: string) => highlightParts(line.replace(/\*\*(.+?)\*\*/g, '$1'), pattern, query)
  const blocks = useMemo(() => postingBlocks(text), [text])

  return <div className="mx-auto max-w-[70ch] break-words text-[15px] leading-[1.7] text-[var(--color-text)]">
    {blocks.map((block, index) => block.kind === 'heading'
      ? <h3 key={index} className={cn('text-base font-semibold tracking-tight', index ? 'mb-2 mt-8' : 'mb-2')}>{mark(block.text)}</h3>
      : block.kind === 'list'
        ? <ul key={index} className="mb-4 space-y-1.5 pl-1">{block.items.map((item, i) => <li key={i} className="relative pl-5 before:absolute before:left-1 before:top-[0.75em] before:size-1.5 before:rounded-full before:bg-[var(--color-accent)]">{mark(item)}</li>)}</ul>
        : <p key={index} className={cn('mb-4', block.strong && 'font-semibold')}>{mark(block.text)}</p>)}
  </div>
}

type Block = { kind: 'heading'; text: string } | { kind: 'paragraph'; text: string; strong: boolean } | { kind: 'list'; items: string[] }

const BULLET = /^\s*(?:[-*•·▪◦–]|\d{1,2}[.)])\s+/
const LEADING_EMOJI = /^(?:[\p{Extended_Pictographic}‍️]+\s*)+/u

/** A short line with no closing punctuation that starts with a capital: "Job requirements", "The Offer". */
function isHeading(line: string): boolean {
  const trimmed = line.trim()
  return (trimmed.length <= 60 && !/[.!?,;:]$/.test(trimmed) && !BULLET.test(trimmed) && /^[\p{Lu}#*]/u.test(trimmed) && !/^\*\*.*\*\*$/.test(trimmed))
}

/** Lines to headings, paragraphs and lists, as `PostingText` describes. */
function postingBlocks(text: string): Block[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n').map((line) => line.trim())
  const blocks: Block[] = []
  let paragraph: string[] = []
  // After a line ending in a colon, short sentences on their own lines are list items.
  let listing = false
  const flush = () => {
    if (paragraph.length) blocks.push({ kind: 'paragraph', text: paragraph.join(' '), strong: paragraph.length === 1 && /^\*\*.*\*\*$/.test(paragraph[0]) })
    paragraph = []
  }
  const item = (value: string) => {
    const last = blocks.at(-1)
    if (last?.kind === 'list') last.items.push(value); else blocks.push({ kind: 'list', items: [value] })
  }
  const heading = (line: string) => { flush(); listing = false; blocks.push({ kind: 'heading', text: line.replace(/^#{1,6}\s*/, '').replace(LEADING_EMOJI, '') }) }
  for (const line of lines) {
    if (!line) { flush(); continue }
    if (/^(?:\.{3}|…)$/.test(line)) continue
    if (BULLET.test(line)) { flush(); item(line.replace(BULLET, '')); continue }
    // A markdown heading, or a short line led by an emoji, is a section title even inside a list.
    if (/^#{1,6}\s/.test(line) || (LEADING_EMOJI.test(line) && line.length <= 80)) { heading(line); continue }
    if (listing && line.length <= 220 && !line.endsWith(':')) { flush(); item(line.replace(/^\*\*(.+)\*\*$/, '$1')); continue }
    if (isHeading(line)) { heading(line); continue }
    paragraph.push(line)
    if (line.endsWith(':')) { flush(); listing = true }
  }
  flush()
  return blocks
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
/** One case-insensitive pattern for every term, longest first so "PyTorch Lightning" wins over "PyTorch". */
function highlightPattern(terms: string[]): RegExp | null {
  const unique = [...new Set(terms.map((term) => term.trim()).filter(Boolean))].sort((a, b) => b.length - a.length)
  if (!unique.length) return null
  return new RegExp(`(${unique.map((term) => /^\w/.test(term) ? `(?<![\\w])${escapeRegex(term)}` : escapeRegex(term)).join('|')})`, 'giu')
}
function highlightParts(line: string, pattern: RegExp | null, query: string): ReactNode {
  if (!pattern) return line
  const parts = line.split(pattern)
  return parts.map((part, index) => {
    if (index % 2 === 0) return <Fragment key={index}>{part}</Fragment>
    const hit = !!query && part.toLowerCase() === query.trim().toLowerCase()
    return <mark key={index} data-hit={hit ? '' : undefined} className={cn('rounded-[3px] px-0.5', hit ? 'bg-[var(--color-warn-soft)] text-[var(--color-warn)] ring-1 ring-[var(--color-warn)]' : 'bg-[var(--color-accent-soft)] text-[var(--color-text)]')}>{part}</mark>
  })
}
function countMatches(text: string, query: string): number {
  const needle = query.trim().toLowerCase()
  if (!needle || !text) return 0
  let count = 0
  for (let at = text.toLowerCase().indexOf(needle); at !== -1; at = text.toLowerCase().indexOf(needle, at + needle.length)) count++
  return count
}

/** Server and browser can sit in different timezones; the browser's reading wins. */
export function When({ iso }: { iso: string }) {
  return <time dateTime={iso} suppressHydrationWarning>{fmtDay(iso)}</time>
}

function fmtDay(iso: string): string {
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00` : iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
