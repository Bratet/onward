'use client'

import { useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { AlertTriangle, CircleCheck, CircleDot, CircleX, MessageSquareText, RefreshCw } from 'lucide-react'
import type { ApplicationRecord } from '@/lib/applicationRecord'
import type { EligibilityIssue } from '@/lib/eligibility'
import type { JdAnalysis } from '@/lib/tailoring/jd'
import type { ApplicationWorkspace } from '@/lib/workspaces'
import { Spinner } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'
import { postingKeywordStatus } from '@/lib/keywordCoverage'
import { PostingDocument } from './job'

const secondaryButton = 'inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 text-xs font-medium transition-colors duration-200 hover:bg-[var(--color-surface-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]'
const ring = 'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-accent)]'

/** Where the candidate stands on one thing the posting asks: a requirement, or an eligibility condition. */
export type FitStanding = 'gap' | 'supporting' | 'direct' | 'unmet' | 'confirm'

/** One row of the Fit list. `standing` is null until the comparison has run. */
export interface FitItem {
  id: string
  group: 'gap' | 'eligibility' | 'supporting' | 'direct' | 'unchecked'
  standing: FitStanding | null
  title: string
  weight: 'must' | 'nice' | null
  evidence: string[]
  /** For eligibility: why it needs checking. */
  note?: string
}

const STANDING: Record<FitStanding, { label: string; icon: (size: number) => ReactNode; text: string }> = {
  gap: { label: 'Gap', icon: (size) => <CircleX size={size} aria-hidden="true" />, text: 'text-[var(--color-bad)]' },
  unmet: { label: 'Not met', icon: (size) => <AlertTriangle size={size} aria-hidden="true" />, text: 'text-[var(--color-bad)]' },
  confirm: { label: 'To confirm', icon: (size) => <AlertTriangle size={size} aria-hidden="true" />, text: 'text-[var(--color-warn)]' },
  supporting: { label: 'Related experience', icon: (size) => <CircleDot size={size} aria-hidden="true" />, text: 'text-[var(--color-warn)]' },
  direct: { label: 'Backed', icon: (size) => <CircleCheck size={size} aria-hidden="true" />, text: 'text-[var(--color-ok)]' },
}

/** A folder tab's standing: the tone of its top edge, label and count. */
type TabStanding = 'ok' | 'warn' | 'bad' | undefined

const GROUPS: { key: FitItem['group']; title: string; tab: string; hint: string; standing: TabStanding }[] = [
  { key: 'gap', title: 'Gaps', tab: 'Gaps', hint: 'Nothing on your resume shows these.', standing: 'bad' },
  { key: 'eligibility', title: 'Eligibility', tab: 'Eligibility', hint: 'Check these before you rely on the rest.', standing: 'warn' },
  { key: 'supporting', title: 'Related experience', tab: 'Related', hint: 'Something close, not the thing itself.', standing: 'warn' },
  { key: 'direct', title: 'Backed by your resume', tab: 'Backed', hint: 'Your resume already shows these.', standing: 'ok' },
  { key: 'unchecked', title: 'What they ask for', tab: 'To compare', hint: 'Not compared with your resume yet.', standing: undefined },
]

/**
 * The rows of the Fit list in reading order: gaps, eligibility to check,
 * related experience, then what is backed; must-haves first inside each group.
 * Met eligibility needs no attention and is left out.
 */
export function fitItems(report: ApplicationWorkspace['fit']['report'], analysis: JdAnalysis | null, eligibility: EligibilityIssue[]): FitItem[] {
  const rows = report?.requirements ?? analysis?.requirements.map((row) => ({ requirement: row.text, weight: row.weight, rank: row.rank, classification: null, evidence: [] as string[] })) ?? []
  const sorted = [...rows].sort((a, b) => (a.weight === b.weight ? 0 : a.weight === 'must' ? -1 : 1) || a.rank - b.rank)
  const requirement = (row: (typeof rows)[number]): FitItem => ({
    id: `${row.weight}-${row.rank}`,
    group: row.classification ?? 'unchecked',
    standing: row.classification,
    title: row.requirement,
    weight: row.weight,
    evidence: row.evidence,
  })
  const conditions: FitItem[] = eligibility.filter((issue) => issue.status !== 'met').map((issue, index) => ({
    id: `eligibility-${index}`,
    group: 'eligibility',
    standing: issue.status === 'unmet' ? 'unmet' : 'confirm',
    title: issue.requirement,
    weight: null,
    evidence: [],
    note: issue.explanation,
  }))
  const order = GROUPS.map((group) => group.key)
  return [...sorted.map(requirement), ...conditions].sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group))
}

/** What to send the AI when the candidate wants to talk about one row. */
export function askAbout(item: FitItem): string {
  return item.group === 'eligibility' ? `About the eligibility requirement "${item.title}": ` : `About the requirement "${item.title}": `
}

/**
 * Separate literal resume wording from experience confirmed in the fit report.
 * A direct requirement only backs a keyword when its evidence names that term.
 */
function PostingKeywords({ keywords: words, resumeText, report }: { keywords: string[]; resumeText: string; report: ApplicationWorkspace['fit']['report'] }) {
  const keywords = useMemo(() => words.map((word) => ({ word, status: postingKeywordStatus(word, resumeText, report) })), [words, resumeText, report])
  const used = keywords.filter((entry) => entry.status === 'inResume')
  const backed = keywords.filter((entry) => entry.status === 'backed')
  const missing = keywords.filter((entry) => entry.status === 'missing')
  if (!keywords.length) return null
  // Each standing is one line of the index: its label in the term column, the words running after it.
  const lines = [
    { key: 'missing', label: 'Not in resume', hint: 'needs review', tone: 'text-[var(--color-muted)]', icon: null, list: missing },
    { key: 'backed', label: 'Backed by analysis', hint: 'add to resume', tone: 'text-[var(--color-warn)]', icon: <CircleDot size={13} aria-hidden="true" />, list: backed },
    { key: 'used', label: 'In your resume', hint: null, tone: 'text-[var(--color-ok)]', icon: <CircleCheck size={13} aria-hidden="true" />, list: used },
  ].filter((line) => line.list.length)
  return <section aria-labelledby="keywords-title" className="sheet anim-settle">
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-[var(--color-border)] px-5 py-3.5">
      <h2 id="keywords-title" className="text-[17px]">Posting keywords</h2>
      <p className="text-xs text-[var(--color-muted)]"><span className="font-semibold text-[var(--color-ok)] tnum">{used.length}</span> of <span className="tnum">{keywords.length}</span> appear in your tailored resume{backed.length ? <>, and <span className="font-semibold text-[var(--color-warn)] tnum">{backed.length}</span> more are backed by the fit analysis</> : null}.</p>
    </div>
    <dl className="divide-y divide-[var(--color-border)]">
      {lines.map((line) => <div key={line.key} className="grid gap-x-6 gap-y-1 px-5 py-3 sm:grid-cols-[7.5rem_minmax(0,1fr)]">
        <dt className="text-xs leading-6">
          <span className={cn('flex items-center gap-1.5 font-medium', line.tone)}>{line.icon}{line.label} <span className="tnum">{line.list.length}</span></span>
          {line.hint ? <span className="block leading-4 text-[var(--color-muted)]">{line.hint}</span> : null}
        </dt>
        <dd className="index-line text-sm leading-6"><ul>{line.list.map(({ word }) => <li key={word}>{word}</li>)}</ul></dd>
      </div>)}
    </dl>
  </section>
}

/** The verdict in its colour, the must-have count beside it, and the ledger under them. */
function FitVerdict({ report }: { report: NonNullable<ApplicationWorkspace['fit']['report']> }) {
  const rows = report.requirements
  // The ledger counts must-haves only, so it shows the same numbers as the sentence beside it.
  const count = (key: FitStanding) => rows.filter((row) => row.weight === 'must' && row.classification === key).length
  // Related experience is a partial match, so it is counted apart from what is backed.
  const mustDirect = count('direct')
  const mustRelated = count('supporting')
  const tone = report.verdict === 'Strong' ? 'text-[var(--color-ok)]' : report.verdict === 'Weak' ? 'text-[var(--color-bad)]' : 'text-[var(--color-warn)]'
  // One stroke per standing, inked in turn from the left.
  const strokes = (['direct', 'supporting', 'gap'] as const).filter((key) => count(key))
  return <div className="min-w-[min(100%,20rem)] flex-1">
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
      <h2 className={cn('font-display text-[28px] leading-none', tone)}>{report.verdict} fit</h2>
      <p className="text-sm text-[var(--color-muted)]"><span className="tnum font-semibold text-[var(--color-text)]">{mustDirect}</span> of <span className="tnum">{report.coverage.must.total}</span> must-haves backed{mustRelated ? <>, <span className="tnum font-semibold text-[var(--color-text)]">{mustRelated}</span> more by related experience</> : null}</p>
    </div>
    <div className="mt-3 flex h-1.5 max-w-xl gap-[3px]" aria-hidden="true">
      {strokes.map((key, position) => <span key={key} style={{ flexGrow: count(key), '--delay': `${120 + position * 140}ms` } as CSSProperties}
        className={cn('anim-ink rounded-[2px]', key === 'direct' ? 'bg-[var(--color-ok)]' : key === 'supporting' ? 'bg-[var(--color-warn)]' : 'bg-[var(--color-bad)]')} />)}
    </div>
  </div>
}

/**
 * Step 1: how the candidate stands against the posting. The keywords lead,
 * then the verdict, then one standing at a time behind coloured tabs that
 * carry the counts, gaps first. Each requirement shows its evidence without
 * a click and a way to tell the AI about it. The posting itself is the
 * second view.
 */
export function FitStep({ appKey, analysis, workspace, posting, hasJd, items, resumeText, onRetry, onAsk }: {
  appKey: string
  analysis: JdAnalysis | null
  workspace: ApplicationWorkspace
  posting: ApplicationRecord['posting']
  hasJd: boolean
  items: FitItem[]
  /** The current tailored draft, to say which keywords it already uses. */
  resumeText: string
  onRetry: () => void
  onAsk: (message: string) => void
}) {
  const [view, setView] = useState<'fit' | 'posting'>('fit')
  const [active, setActive] = useState<FitItem['group'] | null>(null)
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const { fit } = workspace
  const report = fit.report
  const loading = fit.status === 'running' || fit.status === 'queued'

  if (workspace.general && workspace.generalDetails) {
    const details = workspace.generalDetails
    return <section className="sheet space-y-3 p-5">
      <h2 className="text-[17px] font-semibold">No job description</h2>
      <p className="text-sm text-[var(--color-muted)]">This application starts from your general resume. Adjust it in the Resume step.</p>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        {([['Company', details.company], ['Role', details.role], ['Location', details.location], ['HR contact', details.contact]] as const).map(([label, value]) => <div key={label}>
          <dt className="text-xs text-[var(--color-muted)]">{label}</dt><dd className="mt-0.5">{value || <span className="text-[var(--color-faint)]">Not given</span>}</dd>
        </div>)}
      </dl>
      {details.notes ? <p className="whitespace-pre-wrap text-sm text-[var(--color-muted)]">{details.notes}</p> : null}
    </section>
  }

  const tabs = GROUPS.map((group) => ({ group, list: items.filter((item) => item.group === group.key) })).filter(({ list }) => list.length)
  const index = Math.max(0, tabs.findIndex(({ group }) => group.key === active))
  const current = tabs[index]
  // The view switch is a segmented control: a trough with the open view lifted into it as a sheet.
  const viewTab = (value: typeof view, label: string) => <button type="button" role="tab" id={`fit-view-${value}`} aria-controls={`fit-panel-${value}`} aria-selected={view === value} tabIndex={view === value ? 0 : -1}
    onClick={() => setView(value)} className={cn('inline-flex h-8 cursor-pointer items-center rounded-md px-3 text-xs font-medium transition-colors duration-150', ring,
    view === value ? 'bg-[var(--color-surface)] text-[var(--color-text)] shadow-[var(--shadow-sheet)]' : 'text-[var(--color-muted)] hover:text-[var(--color-text)]')}>{label}</button>
  const onViewKey = (event: KeyboardEvent) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
    event.preventDefault()
    const other = view === 'fit' ? 'posting' : 'fit'
    setView(other)
    document.getElementById(`fit-view-${other}`)?.focus()
  }
  // Arrow keys move between the standing tabs, as in any tab list.
  const onTabKey = (event: KeyboardEvent) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (!step) return
    event.preventDefault()
    const next = (index + step + tabs.length) % tabs.length
    setActive(tabs[next].group.key)
    tabRefs.current[next]?.focus()
  }

  return <div className="space-y-5">
    <div className="sheet anim-settle flex flex-wrap items-center gap-x-6 gap-y-4 px-5 py-4">
      {report ? <FitVerdict report={report} /> : <div className="flex-1" />}
      <div role="tablist" aria-label="Fit" onKeyDown={onViewKey} className="inline-flex shrink-0 gap-0.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-0.5">
        {viewTab('fit', 'Requirements')}
        {viewTab('posting', 'Job description')}
      </div>
    </div>

    <PostingKeywords keywords={analysis?.keywords ?? []} resumeText={resumeText} report={report} />

    <div id="fit-panel-fit" role="tabpanel" aria-labelledby="fit-view-fit" hidden={view !== 'fit'} className="anim-fade space-y-4">
      {loading || fit.status === 'error' || !report || fit.stale ? <div role="status" className={cn('anim-settle flex flex-wrap items-center gap-3 rounded-xl px-4 py-3', fit.status === 'error' ? 'bg-[var(--color-bad-soft)]' : fit.stale ? 'bg-[var(--color-warn-soft)]' : 'bg-[var(--color-accent-soft)]')}>
        {loading ? <Spinner /> : fit.status === 'error' ? <AlertTriangle size={16} className="shrink-0 text-[var(--color-bad)]" aria-hidden="true" /> : null}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{loading ? (report ? 'Updating the comparison with your latest changes…' : 'Comparing the requirements with your resume…')
            : fit.status === 'error' ? 'The comparison could not finish'
            : fit.stale ? 'The posting, your master resume or your guidance changed since this comparison'
            : 'Not compared with your resume yet'}</p>
          <p className="mt-0.5 text-xs text-[var(--color-muted)]">{loading ? 'Usually under a minute.' : fit.status === 'error' ? fit.error ?? 'Try again.' : fit.stale ? 'Run it again to include the changes.' : 'It reads your master resume and confirmed facts against each requirement.'}</p>
        </div>
        {!loading ? <button type="button" onClick={onRetry} className={secondaryButton}><RefreshCw size={13} aria-hidden="true" />{fit.status === 'error' ? 'Try again' : report ? 'Compare again' : 'Compare now'}</button> : null}
      </div> : null}

      {current ? <div>
        <div role="tablist" aria-label="Requirements by standing" className="folder-strip" onKeyDown={onTabKey}>
          {tabs.map(({ group, list }, position) => {
            const selected = group.key === current.group.key
            // A condition that is not met makes the eligibility folder a gap, not something to check.
            const standing = group.key === 'eligibility' && list.some((item) => item.standing === 'unmet') ? 'bad' : group.standing
            const icon = group.key === 'unchecked' ? null : STANDING[group.key === 'eligibility' ? (standing === 'bad' ? 'unmet' : 'confirm') : group.key]
            return <button key={group.key} ref={(node) => { tabRefs.current[position] = node }} type="button" role="tab" id={`fit-tab-${group.key}`} aria-controls="fit-list" aria-selected={selected} tabIndex={selected ? 0 : -1}
              title={group.title} onClick={() => setActive(group.key)} data-standing={standing} className="folder-tab folder-tab-count">
              <span className="folder-tab-label">{icon?.icon(13)}{group.tab}</span>
              <span className="folder-count font-display">{list.length}</span>
            </button>
          })}
        </div>

        <section id="fit-list" role="tabpanel" aria-labelledby={`fit-tab-${current.group.key}`}
          className={cn('rounded-b-xl rounded-tr-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-sheet)]', index > 0 && 'rounded-tl-xl')}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-[var(--color-border)] px-5 py-3">
            <p className="text-[15px]"><span className="font-semibold">{current.group.title}.</span> <span className="text-[var(--color-muted)]">{current.group.hint}</span></p>
            {current.list.some((item) => item.weight) ? <p className="flex items-center gap-3 text-xs text-[var(--color-muted)]" aria-hidden="true">
              <span className="inline-flex items-center gap-1.5"><WeightMark weight="must" />Must-have</span>
              <span className="inline-flex items-center gap-1.5"><WeightMark weight="nice" />Nice to have</span>
            </p> : null}
          </div>
          <ol key={current.group.key} className="divide-y divide-[var(--color-border)]">
            {current.list.map((item, position) => {
              const standing = item.group === 'eligibility' && item.standing ? STANDING[item.standing] : null
              return <li key={item.id} style={{ '--delay': `${Math.min(position, 8) * 45}ms` } as CSSProperties}
                className="group anim-settle grid grid-cols-[0.5rem_minmax(0,1fr)] gap-x-3 px-5 py-4 transition-colors duration-200 last:rounded-b-xl hover:bg-[color-mix(in_oklab,var(--color-surface-2)_45%,transparent)] sm:grid-cols-[0.5rem_minmax(0,1fr)_auto] sm:gap-x-4">
                <span className="pt-[0.4375rem]">{item.weight ? <WeightMark weight={item.weight} /> : null}</span>
                <div className="min-w-0">
                  {standing ? <p className={cn('mb-1 flex items-center gap-1 text-xs font-medium', standing.text)}>{standing.icon(13)}{standing.label}</p> : null}
                  <p className="text-[15px] font-medium leading-snug">{item.weight ? <span className="sr-only">{item.weight === 'must' ? 'Must-have: ' : 'Nice to have: '}</span> : null}{item.title}</p>
                  {item.note || readableEvidence(item.evidence).length ? <DetailBody item={item} /> : null}
                </div>
                {/* With a mouse on a wide row, Ask shows on the row under the pointer or holding focus, so a dozen
                    rows do not repeat it. On touch, or below sm where it takes its own line, it always shows.
                    It stays in the tab order either way. */}
                {item.standing ? <div className="col-start-2 mt-3 transition-opacity duration-200 sm:col-start-3 sm:row-start-1 sm:mt-0 sm:pointer-fine:opacity-0 sm:pointer-fine:group-focus-within:opacity-100 sm:pointer-fine:group-hover:opacity-100"><AskButton item={item} onAsk={onAsk} /></div> : null}
              </li>
            })}
          </ol>
        </section>
      </div> : null}
    </div>

    <div id="fit-panel-posting" role="tabpanel" aria-labelledby="fit-view-posting" hidden={view !== 'posting'} className="anim-fade">
      <PostingDocument appKey={appKey} posting={posting} keywords={analysis?.keywords ?? []} hasJd={hasJd} onCopy={(text) => void navigator.clipboard.writeText(text)} />
    </div>
  </div>
}

/** Must-have: a filled dot in the text colour. Nice to have: a hollow faint ring. */
function WeightMark({ weight }: { weight: 'must' | 'nice' }) {
  return <span aria-hidden="true" title={weight === 'must' ? 'Must-have' : 'Nice to have'}
    className={cn('block size-2 rounded-full', weight === 'must' ? 'bg-[var(--color-text)]' : 'border border-[var(--color-faint)]')} />
}

/**
 * Evidence as the candidate reads it. A line that only says nothing was found
 * is dropped (the Gaps folder already says so), and the report's own words for
 * its sources become the candidate's: "the master" is their resume, and a
 * "User-confirmed:" line is something they confirmed.
 */
function readableEvidence(evidence: string[]): { confirmed: boolean; text: string }[] {
  return evidence
    .filter((line) => !/^\s*(not|nothing)( (recorded|found|stated))? in the master( or (in )?(the )?confirmed guidance)?\.?\s*$/iu.test(line))
    .map((line) => {
      const confirmed = /^\s*user[- ]confirmed( skill)?:\s*/iu.test(line)
      const text = line.replace(/^\s*user[- ]confirmed( skill)?:\s*/iu, '')
        .replace(/\bthe master( resume)?\b/giu, 'your resume')
        .replace(/\b(the )?confirmed guidance\b/giu, 'what you confirmed')
      return { confirmed, text: text.charAt(0).toUpperCase() + text.slice(1) }
    })
}

function DetailBody({ item }: { item: FitItem }) {
  const evidence = readableEvidence(item.evidence)
  return <div className="mt-2 space-y-2">
    {item.note ? <p className="text-sm leading-relaxed">{item.note}</p> : null}
    {evidence.length ? <div className="border-l border-[var(--color-border-strong)] pl-3">
      <p className="text-xs font-medium text-[var(--color-muted)]">{item.standing === 'gap' ? 'The closest your resume gets' : 'What you can point to'}</p>
      <ul className="mt-1 space-y-1 text-sm leading-relaxed">
        {evidence.map((line, index) => <li key={index}>{line.confirmed ? <span className="text-[var(--color-muted)]">You confirmed: </span> : null}{line.text}</li>)}
      </ul>
    </div> : null}
  </div>
}

function AskButton({ item, onAsk }: { item: FitItem; onAsk: (message: string) => void }) {
  return <button type="button" onClick={() => onAsk(askAbout(item))} className="ask-button">
    <MessageSquareText size={14} aria-hidden="true" />{item.standing === 'direct' ? 'Ask the AI' : item.group === 'eligibility' ? 'Talk it through' : 'Have this? Tell the AI'}
  </button>
}
