'use client'

import { statusLabel } from '@/lib/statuses'
import Link from 'next/link'
import { Fragment, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { CalendarCheck, CalendarDays, Clock, Copy, ExternalLink, FileText, FolderOpen, Highlighter, Linkedin, Mail, Search, Send, Trophy, X } from 'lucide-react'
import type { Standing } from '@/lib/applicationPhase'
import { currentStep, journeyFocus, STEP_STATE_LABEL, stepProgress, type Journey, type JourneyFocus } from '@/lib/journey'
import type { Application } from '@/lib/applications'
import type { ApplicationRecord, RecordFile } from '@/lib/applicationRecord'
import type { CoverLetter } from '@/lib/coverLetter'
import type { PostingContact } from '@/lib/postingContact'
import { daysSince, QUIET_AFTER_DAYS } from '@/lib/postingSource'
import type { JdAnalysis } from '@/lib/tailoring/jd'
import type { ApplicationWorkspace } from '@/lib/workspaces'
import { Badge, Card, CardHeader, Empty, Spinner, statusTone } from '@/components/ui/primitives'
import { ErrorNotice } from '@/components/ErrorNotice'
import { cn } from '@/lib/utils'

const button = 'inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] px-2.5 py-1.5 text-xs text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)] disabled:opacity-40'
const primary = 'inline-flex items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-xs font-semibold text-[var(--color-bg)] hover:opacity-90 disabled:opacity-40'
const input = 'w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)] disabled:opacity-60'

/** Copy and reveal, with a small toast; shared by the home and record views. */
function useRecordActions(appKey: string) {
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const base = `/api/applications/${encodeURIComponent(appKey)}`
  function flash(message: string) {
    setNotice(message)
    window.setTimeout(() => setNotice((current) => current === message ? null : current), 2200)
  }
  async function copy(text: string, what: string) {
    try { await navigator.clipboard.writeText(text); flash(`${what} copied`) } catch { setError('The clipboard is not available in this browser.') }
  }
  async function reveal(doc: 'pdf' | 'letterPdf') {
    setError(null)
    try {
      const response = await fetch(`${base}/reveal`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ doc, reveal: true }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'could not reveal the file')
      flash(data.revealed ? 'Revealed in Finder' : data.path)
    } catch (reason) { setError((reason as Error).message) }
  }
  const feedback = <>
    {error ? <Card className="overflow-hidden border-[var(--color-bad-soft)]"><ErrorNotice error={error} onDismiss={() => setError(null)} /></Card> : null}
    {notice ? <p role="status" className="anim-rise fixed bottom-5 right-5 z-50 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs text-[var(--color-accent)] shadow-lg">{notice}</p> : null}
  </>
  return { base, copy, reveal, flash, feedback }
}

/**
 * The job as it was saved (listings disappear within weeks) and everything
 * that was prepared and sent for it.
 */
export function ApplicationRecordView({ app, record, analysis, workspace, contact, letter, onGoToAnalysis }: {
  app: Application
  record: ApplicationRecord
  analysis: JdAnalysis | null
  workspace: ApplicationWorkspace
  contact: PostingContact
  /** The finalized letter's text, else the saved draft. */
  letter: CoverLetter | null
  onGoToAnalysis: () => void
}) {
  const { base, copy, reveal, feedback } = useRecordActions(app.key)
  return <div className="space-y-4">
    {feedback}
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0 space-y-4">
        <div className="anim-rise"><PostingCard appKey={app.key} record={record} keywords={analysis?.keywords ?? []} hasJd={!!app.folder?.has.jd} onCopy={copy} /></div>
        <div className="anim-rise" style={{ ['--delay' as string]: '80ms' }}><SentCard app={app} base={base} workspace={workspace} letter={letter} files={record.files} onCopy={copy} onReveal={reveal} /></div>
      </div>
      <aside className="anim-rise space-y-4 lg:sticky lg:top-4" style={{ ['--delay' as string]: '120ms' }}>
        <DetailsCard app={app} analysis={analysis} contact={contact} record={record} onCopy={copy} onGoToAnalysis={onGoToAnalysis} />
        <FilesCard app={app} base={base} files={record.files} onCopy={copy} />
      </aside>
    </div>
  </div>
}

export interface HomeAction { label: string; icon: ReactNode; onClick: (event: MouseEvent<HTMLButtonElement>) => void; primary?: boolean }

/**
 * The landing view once an application is out: where it stands, the one or
 * two things worth doing now, notes to log replies, and the timeline.
 */
export function PostHome({ app, record, workspace, journey, companion, status, phase, contact, analysis, onGo, onStatus, onNotesSaved }: {
  app: Application
  record: ApplicationRecord
  workspace: ApplicationWorkspace
  journey: Journey | null
  /** The companion, shown under the hero so the next action reads first. */
  companion?: ReactNode
  status: string
  phase: Standing
  contact: PostingContact
  analysis: JdAnalysis | null
  onGo: (view: 'next' | 'record') => void
  /** A status move from the hero, with where the click was for the celebration. */
  onStatus: (status: string, origin?: { x: number; y: number }) => void
  onNotesSaved: () => void
}) {
  const { base, copy, flash, feedback } = useRecordActions(app.key)
  const days = daysSince(workspace.appliedAt ?? app.row?.date)
  const today = new Date().toISOString().slice(0, 10)
  const focus = journeyFocus(journey, today)
  const hero = homeHero({ phase, status, days, focus, onGo, onStatus })
  const steps = journey && journey.steps.length > 1 ? stepProgress(journey) : null
  const step = journey ? currentStep(journey) : null

  return <div className="space-y-4">
    {feedback}
    <Card className="hero-wash anim-rise overflow-hidden">
      <div className="flex flex-wrap items-center gap-5 p-6">
        <span className={cn('grid size-14 shrink-0 place-items-center rounded-2xl', hero.tone === 'warn' ? 'bg-[var(--color-warn-soft)] text-[var(--color-warn)]' : hero.tone === 'ok' ? 'bg-[var(--color-ok-soft)] text-[var(--color-ok)]' : hero.tone === 'muted' ? 'bg-[var(--color-surface-2)] text-[var(--color-muted)]' : 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]', hero.pulse && 'anim-pulse')}>{hero.icon}</span>
        <div className="min-w-56 flex-1">
          <h2 className="text-lg font-semibold tracking-tight" suppressHydrationWarning>{hero.title}</h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[var(--color-muted)]" suppressHydrationWarning>{hero.body}</p>
        </div>
        <div className="flex flex-wrap gap-2">{hero.actions.map((action) => <button key={action.label} type="button" onClick={action.onClick} className={action.primary ? cn(primary, 'px-4 py-2') : cn(button, 'px-3 py-2')}>{action.icon}{action.label}</button>)}</div>
      </div>
    </Card>

    {companion}

    <div className="grid grid-cols-2 gap-3">
      {steps && step ? <Stat delay={90} label="Steps done" value={`${steps.finished}/${steps.total}`} hint={`${step.label}: ${STEP_STATE_LABEL[step.state].toLowerCase()}`} /> : null}
      <Stat delay={190} label="Fit" value={workspace.fit.report?.verdict ?? '—'} hint={workspace.fit.report ? `${workspace.fit.report.coverage.must.evidenced} of ${workspace.fit.report.coverage.must.total} must-haves backed` : 'Not analyzed'} />
    </div>

    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0 space-y-4">
        <div className="anim-rise" style={{ ['--delay' as string]: '120ms' }}><NotesCard app={app} base={base} onSaved={() => { flash('Notes saved'); onNotesSaved() }} /></div>
        <div className="anim-rise" style={{ ['--delay' as string]: '180ms' }}>
          <Card className="overflow-hidden">
            <CardHeader title="Jump back in" />
            <div className="grid gap-px bg-[var(--color-border)] sm:grid-cols-2">
              {([
                ['record', 'The job posting', record.posting.url ? `Saved copy plus the live link on ${record.posting.host ?? 'the site'}` : 'The saved copy, searchable', <FileText key="i" size={16} />],
                ['next', 'Messages & status', 'Email, LinkedIn note, cover letter', <Mail key="i" size={16} />],
              ] as const).map(([view, title, hint, icon]) => <button key={view} type="button" onClick={() => onGo(view)} className="group flex items-start gap-3 bg-[var(--color-surface)] p-4 text-left transition-colors hover:bg-[var(--color-surface-2)]">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--color-accent-soft)] text-[var(--color-accent)] transition-transform group-hover:scale-110">{icon}</span>
                <span className="min-w-0"><span className="block text-sm font-medium">{title}</span><span className="mt-0.5 block text-xs leading-relaxed text-[var(--color-muted)]">{hint}</span></span>
              </button>)}
            </div>
          </Card>
        </div>
      </div>
      <aside className="anim-rise space-y-4" style={{ ['--delay' as string]: '160ms' }}>
        <TimelineCard app={app} record={record} status={status} />
        <DetailsCard app={app} analysis={analysis} contact={contact} record={record} onCopy={copy} onGoToAnalysis={() => onGo('record')} compact />
      </aside>
    </div>
  </div>
}

function Stat({ label, value, hint, delay }: { label: string; value: string; hint?: string; delay: number }) {
  const body = <>
    <span className="text-xs text-[var(--color-muted)]">{label}</span>
    <span className="mt-1 block text-xl font-semibold tracking-tight tnum" suppressHydrationWarning>{value}</span>
    {hint ? <span className="mt-0.5 block truncate text-xs text-[var(--color-muted)]" suppressHydrationWarning>{hint}</span> : null}
  </>
  return <div className="anim-rise block rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-left" style={{ ['--delay' as string]: `${delay}ms` }}>{body}</div>
}

function homeHero({ phase, status, days, focus, onGo, onStatus }: {
  phase: Standing; status: string; days: number | null; focus: JourneyFocus | null
  onGo: (view: 'next' | 'record') => void; onStatus: (status: string, origin?: { x: number; y: number }) => void
}): { title: string; body: string; icon: ReactNode; tone: 'accent' | 'warn' | 'ok' | 'muted'; pulse?: boolean; actions: HomeAction[] } {
  const when = days === null ? 'recently' : days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`
  // The journey knows more than the status: a booked step or a next action leads when there is one.
  if (focus?.kind === 'step') return { title: `${focus.step.label} ${countdown(focus.step.date)}`, body: `${focus.step.with ? `With ${focus.step.with}. ` : ''}Once it’s done, tell the companion below how it went.`, icon: <CalendarDays size={24} />, tone: 'warn', pulse: true, actions: [] }
  if (focus?.kind === 'next') {
    const { next, overdue } = focus
    const when = next.due ? overdue ? `This was due ${fmtDay(next.due)}.` : `Due ${countdown(next.due)}.` : 'No date set.'
    const email: HomeAction = { label: 'Write an email', icon: <Mail size={14} aria-hidden="true" />, onClick: () => onGo('next') }
    return { title: next.text, body: `${when} Once it’s done, tell the companion below and it will move things along.`, icon: phase === 'offer' ? <Trophy size={24} /> : <Clock size={24} />, tone: overdue ? 'warn' : phase === 'offer' ? 'ok' : 'accent', pulse: overdue, actions: [{ ...email, primary: true }] }
  }
  if (phase === 'waiting' && days !== null && days > QUIET_AFTER_DAYS) return { title: `${days} days and no reply`, body: 'Most companies that answer do so within a month, so this one has probably gone quiet. You can close it and put your energy into newer applications.', icon: <Clock size={24} />, tone: 'muted', actions: [{ label: 'Update status', icon: <FileText size={14} aria-hidden="true" />, onClick: () => onGo('next') }] }
  if (phase === 'waiting') return { title: 'Waiting for their answer', body: `Nice work, you applied ${when}. When they get back to you, record their answer here.`, icon: <Send size={24} />, tone: 'accent', actions: [
    { label: 'Invited to interview', icon: <CalendarCheck size={14} aria-hidden="true" />, onClick: (event) => onStatus('Responded', { x: event.clientX, y: event.clientY }), primary: true },
    { label: 'Rejected', icon: <X size={14} aria-hidden="true" />, onClick: () => onStatus('Rejected') },
  ] }
  if (phase === 'talking') return { title: 'You’re invited to interview', body: 'Tell the companion below what the first step is, like an introduction call and its date, and it will add it to your timeline.', icon: <Mail size={24} />, tone: 'ok', pulse: true, actions: [{ label: 'Reply', icon: <Mail size={14} aria-hidden="true" />, onClick: () => onGo('next'), primary: true }] }
  if (phase === 'interview') return { title: 'You’re interviewing', body: 'Tell the companion below about each round and its date to get a countdown.', icon: <CalendarDays size={24} />, tone: 'accent', actions: [] }
  if (phase === 'offer') return { title: 'You got an offer', body: 'Congratulations. Before you answer, reread the posting and your notes so you negotiate from what they asked for.', icon: <Trophy size={24} />, tone: 'ok', actions: [{ label: 'Reread the posting', icon: <FileText size={14} aria-hidden="true" />, onClick: () => onGo('record'), primary: true }] }
  return { title: status === 'Rejected' ? 'This one didn’t work out' : 'This application is closed', body: status === 'Rejected' ? 'It happens to everyone, and it says little about you. Your posting, documents and notes stay here if the company opens a similar role later.' : 'Everything you prepared is kept here for reference.', icon: <FileText size={24} />, tone: 'muted', actions: [{ label: 'See what you sent', icon: <FileText size={14} aria-hidden="true" />, onClick: () => onGo('record') }] }
}

function countdown(date: string): string {
  const now = new Date()
  const start = Date.parse(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T00:00:00`)
  const until = Math.round((Date.parse(`${date.slice(0, 10)}T00:00:00`) - start) / 86_400_000)
  return `${until <= 0 ? 'today' : until === 1 ? 'tomorrow' : `in ${until} days`}${date.length > 10 ? ` at ${date.slice(11, 16)}` : ''}`
}

function PostingCard({ appKey, record, keywords, hasJd, onCopy }: { appKey: string; record: ApplicationRecord; keywords: string[]; hasJd: boolean; onCopy: (text: string, what: string) => void }) {
  const { posting } = record
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(true)
  const [url, setUrl] = useState(posting.url)
  const body = posting.body
  const words = body ? body.split(/\s+/).filter(Boolean).length : 0
  const terms = useMemo(() => highlight ? keywords.filter((word) => word.trim().length > 1) : [], [highlight, keywords])
  const matches = useMemo(() => countMatches(body, query), [body, query])
  const present = useMemo(() => keywords.filter((word) => countMatches(body, word) > 0), [body, keywords])
  const scroller = useRef<HTMLDivElement>(null)
  // Bring the first match into view inside the posting's own scroll area.
  useEffect(() => {
    const box = scroller.current
    const hit = box?.querySelector<HTMLElement>('mark[data-hit]')
    if (box && hit) box.scrollTo({ top: Math.max(0, hit.offsetTop - 48), behavior: 'smooth' })
  }, [query])

  return <Card className="overflow-hidden">
    <CardHeader
      title="Job posting"
      hint={body ? <>As saved{posting.savedAt ? <> on <When iso={posting.savedAt} /></> : null} · {words.toLocaleString('en-GB')} words · kept here even after the listing is taken down</> : undefined}
      action={body ? <button type="button" onClick={() => onCopy(body, 'Posting text')} className={button}><Copy size={13} aria-hidden="true" /> Copy text</button> : null}
    />
    <PostingLink appKey={appKey} url={url} host={url === posting.url ? posting.host : null} canEdit={hasJd} onSaved={setUrl} onCopy={onCopy} />
    {body ? <>
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] px-5 py-2.5">
        <label className="relative min-w-48 flex-1">
          <span className="sr-only">Find in posting</span>
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-faint)]" aria-hidden="true" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find in posting…" className="h-8 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] pl-8 pr-16 text-xs outline-none focus:border-[var(--color-accent)]" />
          {query ? <span className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1 text-xs text-[var(--color-muted)] tnum">{matches} {matches === 1 ? 'match' : 'matches'}<button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="hover:text-[var(--color-text)]"><X size={12} /></button></span> : null}
        </label>
        {keywords.length ? <button type="button" aria-pressed={highlight} onClick={() => setHighlight((value) => !value)} className={cn(button, highlight && 'border-[var(--color-accent)] text-[var(--color-accent)]')}><Highlighter size={13} aria-hidden="true" /> Keywords</button> : null}
      </div>
      {highlight && present.length ? <div className="flex flex-wrap gap-1.5 border-b border-[var(--color-border)] px-5 py-2.5">
        {present.map((word) => <button key={word} type="button" onClick={() => setQuery((current) => current === word ? '' : word)} className={cn('rounded-md border px-1.5 py-0.5 text-xs', query === word ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]' : 'border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]')}>{word}</button>)}
      </div> : null}
      <div ref={scroller} className="relative max-h-[75vh] overflow-y-auto px-5 py-4">
        <PostingText text={body} terms={terms} query={query} />
      </div>
    </> : <Empty title="No job description saved" hint={hasJd ? 'The saved posting file is empty.' : 'This application was created without a posting, so there is nothing to show here.'} />}
  </Card>
}

function PostingLink({ appKey, url, host, canEdit, onSaved, onCopy }: { appKey: string; url: string | null; host: string | null; canEdit: boolean; onSaved: (url: string) => void; onCopy: (text: string, what: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(url ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setBusy(true); setError(null)
    try {
      const response = await fetch(`/api/applications/${encodeURIComponent(appKey)}/posting-url`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: value }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'could not save the link')
      onSaved(data.url); setEditing(false)
    } catch (reason) { setError((reason as Error).message) } finally { setBusy(false) }
  }

  if (editing || (!url && canEdit)) return <form className="space-y-2 border-b border-[var(--color-border)] bg-[var(--color-bg)] px-5 py-3" onSubmit={(event) => { event.preventDefault(); void save() }}>
    <p className="text-xs text-[var(--color-muted)]">{url ? 'Replace the posting link.' : 'No link was saved for this posting. Paste it so you can go back to the original listing.'}</p>
    <div className="flex flex-wrap gap-2">
      <input type="url" value={value} onChange={(event) => setValue(event.target.value)} placeholder="https://www.linkedin.com/jobs/view/…" disabled={busy} className={cn(input, 'h-8 min-w-60 flex-1 py-1 text-xs')} />
      <button disabled={busy || !value.trim()} className={primary}>{busy ? <Spinner /> : null} Save link</button>
      {url ? <button type="button" onClick={() => { setEditing(false); setValue(url) }} className={button}>Cancel</button> : null}
    </div>
    {error ? <p className="text-xs text-[var(--color-bad)]">{error}</p> : null}
  </form>
  if (!url) return null
  return <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-bg)] px-5 py-2.5">
    <a href={url} target="_blank" rel="noreferrer" className="inline-flex min-w-0 items-center gap-1.5 text-xs font-medium text-[var(--color-accent)] hover:underline"><ExternalLink size={13} className="shrink-0" aria-hidden="true" /><span className="truncate">Open the original posting{host ? ` on ${host}` : ''}</span></a>
    <span className="ml-auto flex gap-2">
      <button type="button" onClick={() => onCopy(url, 'Link')} className={button}><Copy size={13} aria-hidden="true" /> Copy link</button>
      {canEdit ? <button type="button" onClick={() => setEditing(true)} className={button}>Edit</button> : null}
    </span>
  </div>
}

/** Plain-text postings come in loosely formatted: bullets, short heading lines, and the odd markdown marker. */
function PostingText({ text, terms, query }: { text: string; terms: string[]; query: string }) {
  const pattern = useMemo(() => highlightPattern(query ? [query, ...terms] : terms), [query, terms])
  const mark = (line: string) => highlightParts(line.replace(/\*\*(.+?)\*\*/g, '$1'), pattern, query)
  const blocks = text.split(/\n\s*\n/).map((block) => block.split('\n').map((line) => line.trimEnd()).filter((line) => line.trim()))

  return <div className="space-y-3 text-[13px] leading-relaxed">
    {blocks.map((lines, index) => {
      if (!lines.length) return null
      const items = lines.filter((line) => BULLET.test(line))
      if (lines.length === 1 && isHeading(lines[0])) return <h3 key={index} className="pt-2 text-sm font-semibold text-[var(--color-text)]">{mark(lines[0].replace(/^#{1,6}\s*/, ''))}</h3>
      if (items.length && items.length === lines.length) return <ul key={index} className="list-disc space-y-1 pl-5 text-[var(--color-muted)]">{lines.map((line, i) => <li key={i}>{mark(line.replace(BULLET, ''))}</li>)}</ul>
      return <div key={index} className="space-y-1 text-[var(--color-muted)]">{lines.map((line, i) => BULLET.test(line)
        ? <p key={i} className="flex gap-2 pl-1"><span aria-hidden="true">•</span><span>{mark(line.replace(BULLET, ''))}</span></p>
        : isHeading(line) && i === 0 ? <p key={i} className="font-semibold text-[var(--color-text)]">{mark(line.replace(/^#{1,6}\s*/, ''))}</p>
          : <p key={i}>{mark(line)}</p>)}</div>
    })}
  </div>
}

const BULLET = /^\s*(?:[-*•·▪◦–]|\d{1,2}[.)])\s+/
function isHeading(line: string): boolean {
  const trimmed = line.trim()
  return /^#{1,6}\s/.test(trimmed) || (trimmed.length <= 70 && !/[.!?,;]$/.test(trimmed) && !BULLET.test(trimmed) && /^[\p{Lu}#*]/u.test(trimmed))
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
    return <mark key={index} data-hit={hit ? '' : undefined} className={cn('rounded-sm px-0.5', hit ? 'bg-[var(--color-warn-soft)] text-[var(--color-warn)] ring-1 ring-[var(--color-warn)]' : 'bg-[var(--color-accent-soft)] text-[var(--color-text)]')}>{part}</mark>
  })
}
function countMatches(text: string, query: string): number {
  const needle = query.trim().toLowerCase()
  if (!needle || !text) return 0
  let count = 0
  for (let at = text.toLowerCase().indexOf(needle); at !== -1; at = text.toLowerCase().indexOf(needle, at + needle.length)) count++
  return count
}

function SentCard({ app, base, workspace, letter, files, onCopy, onReveal }: {
  app: Application
  base: string
  workspace: ApplicationWorkspace
  letter: CoverLetter | null
  files: RecordFile[]
  onCopy: (text: string, what: string) => void
  onReveal: (doc: 'pdf' | 'letterPdf') => void
}) {
  const pdf = files.find((file) => file.key === 'pdf' && file.name.endsWith('.pdf'))
  const letterPdf = files.find((file) => file.key === 'letterPdf' && file.name.endsWith('.pdf'))
  const email = workspace.outreach?.email?.trim()
  const linkedin = workspace.outreach?.linkedin?.trim()
  const letterText = letter?.content.trim() || workspace.outreach?.['cover-letter']?.trim() || ''
  // Readable notes kept in the folder: answers to form questions, preparation, tailoring notes.
  const notes = files.filter((file) => file.text?.trim())
  const nothing = !pdf && !letterPdf && !email && !linkedin && !letterText && !notes.length

  return <Card className="overflow-hidden">
    <CardHeader title="What you prepared" hint="The documents and messages saved with this application" />
    {nothing ? <Empty title="Nothing saved yet" hint="Finalize the resume or draft a message and it will show up here." /> : <div className="divide-y divide-[var(--color-border)]">
      {pdf ? <DocRow icon={<FileText size={16} />} title="Resume" meta={`${pdf.name} · ${kb(pdf.size)}`}>
        <a href={`${base}/file/${encodeURIComponent(pdf.name)}`} target="_blank" rel="noreferrer" className={button}>Open PDF</a>
        <button type="button" onClick={() => onReveal('pdf')} className={button}>Reveal</button>
      </DocRow> : null}
      {letterPdf || letterText ? <Expandable icon={<FileText size={16} />} title="Cover letter" meta={letterPdf ? `${letterPdf.name} · ${kb(letterPdf.size)}` : 'Draft, not finalized'} text={letterText} onCopy={() => onCopy(letterText, 'Cover letter')} actions={letterPdf ? <>
        <a href={`${base}/file/${encodeURIComponent(letterPdf.name)}`} target="_blank" rel="noreferrer" className={button}>Open PDF</a>
        <button type="button" onClick={() => onReveal('letterPdf')} className={button}>Reveal</button>
      </> : null} /> : null}
      {email ? <Expandable icon={<Mail size={16} />} title="Application email" meta="Saved draft" text={email} onCopy={() => onCopy(email, 'Email')} /> : null}
      {linkedin ? <Expandable icon={<Linkedin size={16} />} title="LinkedIn message" meta="Saved draft" text={linkedin} onCopy={() => onCopy(linkedin, 'Message')} /> : null}
      {notes.map((file) => <Expandable key={file.name} icon={<FileText size={16} />} title={noteTitle(file.name)} meta={file.name} text={file.text ?? ''} onCopy={() => onCopy(file.text ?? '', noteTitle(file.name))} />)}
    </div>}
    {!app.folder ? <p className="border-t border-[var(--color-border)] px-5 py-3 text-xs text-[var(--color-faint)]">No folder is linked to this application.</p> : null}
  </Card>
}

function noteTitle(name: string): string {
  const known: Record<string, string> = {
    'application-answers.md': 'Application form answers',
    'application-preparation.md': 'Application preparation',
    'tailoring-notes.md': 'Tailoring notes',
    'cover-letter-draft.md': 'Cover letter draft',
    'summary.md': 'Summary',
  }
  return known[name] ?? name.replace(/\.(md|txt)$/i, '').replace(/[-_]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}

function DocRow({ icon, title, meta, children }: { icon: ReactNode; title: string; meta: ReactNode; children?: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3 px-5 py-3">
    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--color-accent-soft)] text-[var(--color-accent)]" aria-hidden="true">{icon}</span>
    <div className="min-w-40 flex-1"><p className="text-sm font-medium">{title}</p><p className="truncate text-xs text-[var(--color-muted)]">{meta}</p></div>
    <div className="flex flex-wrap gap-2">{children}</div>
  </div>
}

function Expandable({ icon, title, meta, text, actions, onCopy }: { icon: ReactNode; title: string; meta: ReactNode; text: string; actions?: ReactNode; onCopy: () => void }) {
  const [open, setOpen] = useState(false)
  return <div>
    <DocRow icon={icon} title={title} meta={meta}>
      {actions}
      {text ? <>
        <button type="button" onClick={onCopy} className={button}><Copy size={13} aria-hidden="true" /> Copy</button>
        <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className={button}>{open ? 'Hide' : 'Read'}</button>
      </> : null}
    </DocRow>
    {open && text ? <pre className="mx-5 mb-4 max-h-96 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3 font-sans text-[13px] leading-relaxed text-[var(--color-muted)]">{text}</pre> : null}
  </div>
}

function NotesCard({ app, base, onSaved }: { app: Application; base: string; onSaved: () => void }) {
  const [notes, setNotes] = useState(app.row?.notes ?? '')
  const [saved, setSaved] = useState(app.row?.notes ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!app.row) return null
  const dirty = notes !== saved

  function stamp() {
    const today = new Date()
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    setNotes((current) => `${current.trim()}${current.trim() ? ' ' : ''}${iso}: `)
  }

  return <Card>
    <CardHeader title="Tracker notes" hint="Log replies, contacts and interview dates" action={dirty ? <Badge tone="warn">Unsaved</Badge> : null} />
    <form className="space-y-2 p-4" onSubmit={async (event) => {
      event.preventDefault()
      setBusy(true); setError(null)
      try {
        const response = await fetch(base, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ notes }) })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error ?? 'could not save the notes')
        setSaved(notes); onSaved()
      } catch (reason) { setError((reason as Error).message) } finally { setBusy(false) }
    }}>
      <textarea value={notes} onChange={(event) => setNotes(event.target.value)} disabled={busy} rows={7} className={cn(input, 'text-xs leading-relaxed')} placeholder="Who replied, what they said…" />
      {error ? <p className="text-xs text-[var(--color-bad)]">{error}</p> : null}
      <div className="flex items-center gap-2">
        <button disabled={busy || !dirty} className={primary}>{busy ? <Spinner /> : null} Save notes</button>
        <button type="button" onClick={stamp} disabled={busy} className={button} title="Add today’s date to the notes">+ Today</button>
        {dirty ? <button type="button" onClick={() => setNotes(saved)} disabled={busy} className="ml-auto text-xs text-[var(--color-faint)] hover:text-[var(--color-text)]">Discard</button> : null}
      </div>
    </form>
  </Card>
}

function DetailsCard({ app, analysis, contact, record, onCopy, onGoToAnalysis, compact }: { app: Application; analysis: JdAnalysis | null; contact: PostingContact; record: ApplicationRecord; onCopy: (text: string, what: string) => void; onGoToAnalysis: () => void; compact?: boolean }) {
  const rows: [string, ReactNode][] = [
    ['Company', app.row?.company ?? analysis?.company ?? app.folder?.slug],
    ['Role', app.row?.role ?? analysis?.role],
    ['Location', analysis?.location],
    ['Work mode', analysis?.workMode],
    ['Seniority', analysis?.seniority],
    ['Sponsorship', analysis?.sponsorship],
    ['Language', analysis ? (analysis.language === 'fr' ? 'French' : 'English') : null],
    ['Tracker', app.row ? `#${app.row.id} · ${fmtDay(app.row.date)}${app.row.score !== 'N/A' ? ` · score ${app.row.score}` : ''}` : null],
  ].filter(([label]) => !compact || !['Company', 'Role', 'Language', 'Tracker'].includes(label as string)) as [string, ReactNode][]
  return <Card>
    <CardHeader title="Key facts" action={analysis && !compact ? <button type="button" onClick={onGoToAnalysis} className="text-xs text-[var(--color-accent)] hover:underline">Fit analysis →</button> : null} />
    <dl className="divide-y divide-[var(--color-border)] text-xs">
      {rows.filter(([, value]) => value).map(([label, value]) => <div key={label} className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2 px-4 py-2"><dt className="text-[var(--color-faint)]">{label}</dt><dd className="break-words">{value}</dd></div>)}
      {contact.email ? <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2 px-4 py-2"><dt className="text-[var(--color-faint)]">Contact</dt><dd className="flex min-w-0 items-center gap-1.5"><a href={`mailto:${contact.email}`} className="truncate text-[var(--color-accent)] hover:underline">{contact.name ? `${contact.name} · ` : ''}{contact.email}</a><button type="button" onClick={() => onCopy(contact.email!, 'Address')} aria-label="Copy address" className="shrink-0 text-[var(--color-faint)] hover:text-[var(--color-text)]"><Copy size={12} /></button></dd></div> : null}
      {record.posting.url ? <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2 px-4 py-2"><dt className="text-[var(--color-faint)]">Posting</dt><dd className="min-w-0"><a href={record.posting.url} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1 text-[var(--color-accent)] hover:underline"><span className="truncate">{record.posting.host ?? 'Open'}</span><ExternalLink size={11} className="shrink-0" aria-hidden="true" /></a></dd></div> : null}
    </dl>
    {analysis?.summary && !compact ? <p className="border-t border-[var(--color-border)] px-4 py-3 text-xs leading-relaxed text-[var(--color-muted)]">{analysis.summary}</p> : null}
  </Card>
}

function TimelineCard({ app, record, status }: { app: Application; record: ApplicationRecord; status: string }) {
  const events = [...record.timeline].sort((a, b) => a.at.localeCompare(b.at))
  return <Card>
    <CardHeader title="Timeline" action={record.runs.total ? <Link href={`/runs?applicationKey=${encodeURIComponent(app.key)}`} className="text-xs text-[var(--color-accent)] hover:underline">{record.runs.total} AI run{record.runs.total === 1 ? '' : 's'} →</Link> : null} />
    <ol className="relative space-y-3 px-4 py-4">
      <span className="absolute bottom-6 left-[1.4rem] top-6 w-px bg-[var(--color-border)]" aria-hidden="true" />
      {events.map((event, index) => <li key={`${event.label}-${index}`} className="relative flex gap-3">
        <span className="relative mt-1 size-2.5 shrink-0 rounded-full border-2 border-[var(--color-surface)] bg-[var(--color-faint)] outline outline-1 outline-[var(--color-border)] ml-[0.3rem]" aria-hidden="true" />
        <div className="min-w-0"><p className="text-xs font-medium">{event.label}</p><p className="text-xs text-[var(--color-muted)]"><When iso={event.at} time />{event.detail ? ` · ${event.detail}` : ''}</p></div>
      </li>)}
      {app.row ? <li className="relative flex gap-3">
        <span className="relative mt-1 size-2.5 shrink-0 rounded-full border-2 border-[var(--color-surface)] bg-[var(--color-accent)] ml-[0.3rem]" aria-hidden="true" />
        <div><p className="flex items-center gap-2 text-xs font-medium">Now <Badge tone={statusTone(status)}>{statusLabel(status)}</Badge></p></div>
      </li> : null}
      {!events.length && !app.row ? <li className="text-xs text-[var(--color-faint)]">No dated events recorded.</li> : null}
    </ol>
  </Card>
}

function FilesCard({ app, base, files, onCopy }: { app: Application; base: string; files: RecordFile[]; onCopy: (text: string, what: string) => void }) {
  if (!app.folder) return null
  const path = `workspace/applications/${app.folder.folder}/`
  return <Card>
    <CardHeader title={`Files (${files.length})`} action={<button type="button" onClick={() => onCopy(path, 'Folder path')} className="inline-flex items-center gap-1 text-xs text-[var(--color-accent)] hover:underline"><FolderOpen size={12} aria-hidden="true" /> Copy path</button>} />
    <ul className="divide-y divide-[var(--color-border)]">
      {files.map((file) => <li key={file.name}>
        <a href={`${base}/file/${encodeURIComponent(file.name)}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-4 py-2 text-xs hover:bg-[var(--color-surface-2)]">
          <span className="min-w-0 flex-1 truncate">{file.name}</span>
          <span className="shrink-0 text-xs text-[var(--color-muted)] tnum">{kb(file.size)}</span>
        </a>
      </li>)}
    </ul>
  </Card>
}

/** Server and browser can sit in different timezones; the browser's reading wins. */
function When({ iso, time }: { iso: string; time?: boolean }) {
  return <time dateTime={iso} suppressHydrationWarning>{time ? fmtWhen(iso) : fmtDay(iso)}</time>
}

function kb(size: number): string {
  return size >= 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`
}
function fmtDay(iso: string): string {
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00` : iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
function fmtWhen(iso: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return fmtDay(iso)
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : `${fmtDay(iso)}, ${date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
}
