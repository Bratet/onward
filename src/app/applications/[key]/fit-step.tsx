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

const STANDING: Record<FitStanding, { label: string; icon: (size: number) => ReactNode; text: string; pill: string }> = {
  gap: { label: 'Gap', icon: (size) => <CircleX size={size} aria-hidden="true" />, text: 'text-[var(--color-bad)]', pill: 'bg-[var(--color-bad-soft)] text-[var(--color-bad)]' },
  unmet: { label: 'Not met', icon: (size) => <AlertTriangle size={size} aria-hidden="true" />, text: 'text-[var(--color-bad)]', pill: 'bg-[var(--color-bad-soft)] text-[var(--color-bad)]' },
  confirm: { label: 'To confirm', icon: (size) => <AlertTriangle size={size} aria-hidden="true" />, text: 'text-[var(--color-warn)]', pill: 'bg-[var(--color-warn-soft)] text-[var(--color-warn)]' },
  supporting: { label: 'Related experience', icon: (size) => <CircleDot size={size} aria-hidden="true" />, text: 'text-[var(--color-warn)]', pill: 'bg-[var(--color-warn-soft)] text-[var(--color-warn)]' },
  direct: { label: 'Backed', icon: (size) => <CircleCheck size={size} aria-hidden="true" />, text: 'text-[var(--color-ok)]', pill: 'bg-[var(--color-ok-soft)] text-[var(--color-ok)]' },
}

const GROUPS: { key: FitItem['group']; title: string; tab: string; hint: string; tone: string; wash: string }[] = [
  { key: 'gap', title: 'Gaps', tab: 'Gaps', hint: 'Nothing on your resume shows these.', tone: 'var(--color-bad)', wash: 'var(--color-bad-soft)' },
  { key: 'eligibility', title: 'Eligibility', tab: 'Eligibility', hint: 'Check these before you rely on the rest.', tone: 'var(--color-warn)', wash: 'var(--color-warn-soft)' },
  { key: 'supporting', title: 'Related experience', tab: 'Related', hint: 'Something close, not the thing itself.', tone: 'var(--color-warn)', wash: 'var(--color-warn-soft)' },
  { key: 'direct', title: 'Backed by your resume', tab: 'Backed', hint: 'Your resume already shows these.', tone: 'var(--color-ok)', wash: 'var(--color-ok-soft)' },
  { key: 'unchecked', title: 'What they ask for', tab: 'To compare', hint: 'Not compared with your resume yet.', tone: 'var(--color-border-strong)', wash: 'var(--color-surface-2)' },
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
  const chip = 'inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-[13px] font-medium'
  return <section aria-labelledby="keywords-title" className="sheet anim-settle p-5">
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h2 id="keywords-title" className="text-[17px] font-semibold">Posting keywords</h2>
      <p className="text-sm text-[var(--color-muted)]"><span className="font-semibold text-[var(--color-ok)] tnum">{used.length}</span> of <span className="tnum">{keywords.length}</span> appear in your tailored resume{backed.length ? <>, and <span className="font-semibold text-[var(--color-warn)] tnum">{backed.length}</span> more are backed by the fit analysis</> : null}.</p>
    </div>
    <dl className="mt-4 space-y-3">
      {missing.length ? <div>
        <dt className="mb-1.5 text-[13px] font-semibold">Not in resume · needs review <span className="tnum text-[var(--color-muted)]">{missing.length}</span></dt>
        <dd><ul className="flex flex-wrap gap-1.5">{missing.map(({ word }) => <li key={word} className={cn(chip, 'border border-[var(--color-border-strong)] bg-[var(--color-surface)]')}>{word}</li>)}</ul></dd>
      </div> : null}
      {backed.length ? <div>
        <dt className="mb-1.5 text-[13px] font-semibold text-[var(--color-warn)]">Backed by analysis · add to resume <span className="tnum">{backed.length}</span></dt>
        <dd><ul className="flex flex-wrap gap-1.5">{backed.map(({ word }) => <li key={word} className={cn(chip, 'bg-[var(--color-warn-soft)] text-[var(--color-warn)]')}><CircleDot size={13} aria-hidden="true" />{word}</li>)}</ul></dd>
      </div> : null}
      {used.length ? <div>
        <dt className="mb-1.5 text-[13px] font-semibold text-[var(--color-ok)]">In your resume <span className="tnum">{used.length}</span></dt>
        <dd><ul className="flex flex-wrap gap-1.5">{used.map(({ word }) => <li key={word} className={cn(chip, 'bg-[var(--color-ok-soft)] text-[var(--color-ok)]')}><CircleCheck size={13} aria-hidden="true" />{word}</li>)}</ul></dd>
      </div> : null}
    </dl>
  </section>
}

/** The verdict in its colour and the must-have coverage with its bar: the heading of the requirements. */
function FitVerdict({ report }: { report: NonNullable<ApplicationWorkspace['fit']['report']> }) {
  const rows = report.requirements
  // The bar counts must-haves only, so it shows the same numbers as the sentence beside it.
  const count = (key: FitStanding) => rows.filter((row) => row.weight === 'must' && row.classification === key).length
  // Related experience is a partial match, so it is counted apart from what is backed.
  const mustDirect = rows.filter((row) => row.weight === 'must' && row.classification === 'direct').length
  const mustRelated = rows.filter((row) => row.weight === 'must' && row.classification === 'supporting').length
  const tone = report.verdict === 'Strong' ? 'text-[var(--color-ok)]' : report.verdict === 'Weak' ? 'text-[var(--color-bad)]' : 'text-[var(--color-warn)]'
  // The ledger: one stroke per standing, drawn in turn from the left.
  const strokes = (['direct', 'supporting', 'gap'] as const).filter((key) => count(key))
  return <div className="min-w-[min(100%,20rem)] flex-1">
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <span className="font-display text-[56px] leading-[0.95]">{mustDirect}<span className="text-[var(--color-faint)]">/{report.coverage.must.total}</span></span>
      <div>
        <p className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-semibold', report.verdict === 'Strong' ? 'bg-[var(--color-ok-soft)]' : report.verdict === 'Weak' ? 'bg-[var(--color-bad-soft)]' : 'bg-[var(--color-warn-soft)]', tone)}>{report.verdict} fit</p>
        <p className="mt-1 text-[15px] text-[var(--color-muted)]">must-haves backed{mustRelated ? <>, <span className="tnum font-semibold text-[var(--color-text)]">{mustRelated}</span> more by related experience</> : null}</p>
      </div>
    </div>
    <div className="mt-3 flex h-2 max-w-xl gap-1" aria-hidden="true">
      {strokes.map((key, position) => <span key={key} style={{ flexGrow: count(key), '--delay': `${120 + position * 140}ms` } as CSSProperties}
        className={cn('anim-ink rounded-full', key === 'direct' ? 'bg-[var(--color-ok)]' : key === 'supporting' ? 'bg-[var(--color-warn)]' : 'bg-[var(--color-bad)]')} />)}
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
  const viewTab = (value: typeof view, label: string) => <button type="button" role="tab" aria-selected={view === value} onClick={() => setView(value)} className={cn('inline-flex h-9 cursor-pointer items-center rounded-md px-3.5 text-sm font-medium transition-colors duration-150', ring,
    view === value ? 'bg-[var(--color-accent)] text-[var(--color-on-solid)]' : 'text-[var(--color-muted)] hover:text-[var(--color-text)]')}>{label}</button>
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
    <PostingKeywords keywords={analysis?.keywords ?? []} resumeText={resumeText} report={report} />

    <div className="sheet flex flex-wrap items-center gap-x-6 gap-y-4 p-5">
      {report ? <FitVerdict report={report} /> : <div className="flex-1" />}
      <div role="tablist" aria-label="Fit" className="inline-flex shrink-0 gap-0.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-1">
        {viewTab('fit', 'Requirements')}
        {viewTab('posting', 'Job description')}
      </div>
    </div>

    <div hidden={view !== 'fit'} className="anim-fade space-y-4">
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
        <p className="mb-2 text-sm font-medium text-[var(--color-muted)]">All <span className="tnum">{items.length}</span> requirements, by where you stand</p>
        <div role="tablist" aria-label="Requirements by standing" className="stand-tabs" onKeyDown={onTabKey}>
          {tabs.map(({ group, list }, position) => {
            const selected = group.key === current.group.key
            const icon = group.key === 'unchecked' ? null : STANDING[group.key === 'eligibility' ? 'confirm' : group.key]
            return <button key={group.key} ref={(node) => { tabRefs.current[position] = node }} type="button" role="tab" id={`fit-tab-${group.key}`} aria-controls="fit-list" aria-selected={selected} tabIndex={selected ? 0 : -1}
              title={group.title} onClick={() => setActive(group.key)} className="stand-tab" style={{ '--tone': group.tone, '--wash': group.wash } as CSSProperties}>
              <span className={cn('flex items-center gap-1.5 text-[13px] font-semibold', icon?.text)}>{icon?.icon(14)}{group.tab}</span>
              <span className="font-display mt-1 block text-[30px] leading-none">{list.length}</span>
            </button>
          })}
        </div>

        <div id="fit-list" role="tabpanel" aria-labelledby={`fit-tab-${current.group.key}`} className="mt-4">
          <p className="mb-3 text-[15px]"><span className="font-semibold">{current.group.title}.</span> <span className="text-[var(--color-muted)]">{current.group.hint}</span></p>
          <ol key={current.group.key} className="space-y-3">
            {current.list.map((item, position) => {
              const standing = item.standing ? STANDING[item.standing] : null
              return <li key={item.id} style={{ '--delay': `${Math.min(position, 8) * 35}ms` } as CSSProperties} className="sheet anim-settle p-5">
                <div className="flex flex-wrap items-center gap-1.5">
                  {standing ? <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold', standing.pill)}>{standing.icon(13)}{standing.label}</span> : null}
                  {item.weight ? <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', item.weight === 'must' ? 'bg-[var(--color-text)] text-[var(--color-bg)]' : 'border border-[var(--color-border-strong)] text-[var(--color-muted)]')}>{item.weight === 'must' ? 'Must-have' : 'Nice to have'}</span> : null}
                </div>
                <p className="mt-2.5 text-[16px] font-semibold leading-snug">{item.title}</p>
                {item.note || item.evidence.length ? <div className="mt-3"><DetailBody item={item} /></div> : null}
                {item.standing ? <div className="mt-4"><AskButton item={item} onAsk={onAsk} /></div> : null}
              </li>
            })}
          </ol>
        </div>
      </div> : null}
    </div>

    <div hidden={view !== 'posting'} className="anim-fade">
      <PostingDocument appKey={appKey} posting={posting} keywords={analysis?.keywords ?? []} hasJd={hasJd} onCopy={(text) => void navigator.clipboard.writeText(text)} />
    </div>
  </div>
}

function DetailBody({ item }: { item: FitItem }) {
  return <div className="space-y-2">
    {item.note ? <p className="text-sm leading-relaxed">{item.note}</p> : null}
    {item.evidence.length ? <div className="rounded-lg bg-[var(--color-surface-2)] px-4 py-3">
      <p className="text-[13px] font-semibold">{item.standing === 'gap' ? 'The closest your resume gets' : 'What you can point to'}</p>
      <ul className="mt-1.5 space-y-1.5 text-sm leading-relaxed">
        {item.evidence.map((line, index) => <li key={index} className="relative pl-4 before:absolute before:left-0 before:top-[0.6em] before:size-1.5 before:rounded-full before:bg-[var(--color-faint)]">{line}</li>)}
      </ul>
    </div> : null}
  </div>
}

function AskButton({ item, onAsk }: { item: FitItem; onAsk: (message: string) => void }) {
  return <button type="button" onClick={() => onAsk(askAbout(item))} className={cn('inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg bg-[var(--color-accent-soft)] px-3.5 text-sm font-semibold text-[var(--color-accent)] transition-colors duration-150 hover:bg-[var(--color-accent)] hover:text-[var(--color-on-solid)] active:translate-y-px', ring)}>
    <MessageSquareText size={15} aria-hidden="true" />{item.standing === 'direct' ? 'Ask the AI' : item.group === 'eligibility' ? 'Talk it through' : 'Have this? Tell the AI'}
  </button>
}
