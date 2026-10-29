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

const secondaryButton = 'inline-flex h-8 max-sm:min-h-11 cursor-pointer items-center gap-1.5 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 text-xs font-medium transition-colors duration-200 hover:bg-[var(--color-surface-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]'
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
 * The Keywords folder: the posting's words, one standing per index line.
 * Separates literal resume wording from experience confirmed in the fit report;
 * a direct requirement only backs a keyword when its evidence names that term.
 */
function KeywordFolder({ keywords: words, resumeText, report }: { keywords: string[]; resumeText: string; report: ApplicationWorkspace['fit']['report'] }) {
  const keywords = useMemo(() => words.map((word) => ({ word, status: postingKeywordStatus(word, resumeText, report) })), [words, resumeText, report])
  const used = keywords.filter((entry) => entry.status === 'inResume')
  const backed = keywords.filter((entry) => entry.status === 'backed')
  const missing = keywords.filter((entry) => entry.status === 'missing')
  // Each standing is one line of the index: its label in the term column, the words running after it.
  const lines = [
    { key: 'missing', label: 'Not in resume', hint: 'needs review', tone: 'text-[var(--color-muted)]', icon: null, list: missing },
    { key: 'backed', label: 'Backed by analysis', hint: 'add to resume', tone: 'text-[var(--color-warn)]', icon: <CircleDot size={13} aria-hidden="true" />, list: backed },
    { key: 'used', label: 'In your resume', hint: null, tone: 'text-[var(--color-ok)]', icon: <CircleCheck size={13} aria-hidden="true" />, list: used },
  ].filter((line) => line.list.length)
  return <>
    <div className="border-b border-[var(--color-border)] px-5 py-3">
      <p className="text-[15px]"><span className="font-semibold">Posting keywords.</span> <span className="text-[var(--color-muted)]"><span className="tnum font-semibold text-[var(--color-ok)]">{used.length}</span> of <span className="tnum">{keywords.length}</span> appear in your tailored resume{backed.length ? <>, and <span className="tnum font-semibold text-[var(--color-warn)]">{backed.length}</span> more are backed by the fit analysis</> : null}.</span></p>
    </div>
    <dl className="divide-y divide-[var(--color-border)]">
      {lines.map((line) => <div key={line.key} className="grid gap-x-6 gap-y-1 px-5 py-3 sm:grid-cols-[9.5rem_minmax(0,1fr)]">
        <dt className="text-xs leading-6">
          <span className={cn('flex items-center gap-1.5 whitespace-nowrap font-medium', line.tone)}>{line.icon}{line.label}<span className="tnum">{line.list.length}</span></span>
          {line.hint ? <span className="block leading-4 text-[var(--color-muted)]">{line.hint}</span> : null}
        </dt>
        <dd className="index-line text-sm leading-6"><ul>{line.list.map(({ word }) => <li key={word}>{word}</li>)}</ul></dd>
      </div>)}
    </dl>
  </>
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
      {/* Numbers in running text keep proportional figures; tabular ones only earn their gaps when they line up in columns. */}
      <p className="text-sm text-[var(--color-muted)]"><span className="font-semibold text-[var(--color-text)]">{mustDirect}</span> of {report.coverage.must.total} must-haves backed{mustRelated ? <>, <span className="font-semibold text-[var(--color-text)]">{mustRelated}</span> more by related experience</> : null}</p>
    </div>
    <div className="mt-3 flex h-1.5 max-w-xl gap-[3px]" aria-hidden="true">
      {strokes.map((key, position) => <span key={key} style={{ flexGrow: count(key), '--delay': `${120 + position * 140}ms` } as CSSProperties}
        className={cn('anim-ink rounded-[2px]', key === 'direct' ? 'bg-[var(--color-ok)]' : key === 'supporting' ? 'bg-[var(--color-warn)]' : 'bg-[var(--color-bad)]')} />)}
    </div>
  </div>
}

/**
 * Step 1: how the candidate stands against the posting. The verdict leads;
 * under it, one folder per standing (gaps first) and a last folder for the
 * posting's keywords, with the switch to the job description beside the
 * folders it replaces. Each requirement shows its evidence without a click
 * and a way to tell the AI about it.
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
  const [active, setActive] = useState<FitItem['group'] | 'keywords' | null>(null)
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const { fit } = workspace
  const report = fit.report
  const loading = fit.status === 'running' || fit.status === 'queued'
  // Reports written before the analysis spoke to the candidate directly still say "he" or "the master".
  const oldWording = !!report?.requirements.some((row) => row.evidence.some((line) => /\b(he|his|him|she|her|hers|the candidate)\b|\bthe master\b/iu.test(line)))

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

  const keywords = analysis?.keywords ?? []
  // The standings, then the posting's words as one more folder of the same file.
  const folders: { key: FitItem['group'] | 'keywords'; title: string; tab: string; hint: string; standing: TabStanding; list: FitItem[]; count: number }[] = [
    ...GROUPS.map((group) => {
      const list = items.filter((item) => item.group === group.key)
      // A condition that is not met makes the eligibility folder a gap, not something to check.
      const standing: TabStanding = group.key === 'eligibility' && list.some((item) => item.standing === 'unmet') ? 'bad' : group.standing
      return { ...group, standing, list, count: list.length }
    }).filter(({ count }) => count),
    ...(keywords.length ? [{ key: 'keywords' as const, title: 'Posting keywords', tab: 'Keywords', hint: '', standing: undefined, list: [], count: keywords.length }] : []),
  ]
  const index = Math.max(0, folders.findIndex(({ key }) => key === active))
  const current = folders[index]
  // The view switch is a segmented control: a trough with the open view lifted into it as a sheet.
  const viewTab = (value: typeof view, label: string) => <button type="button" role="tab" id={`fit-view-${value}`} aria-controls={`fit-panel-${value}`} aria-selected={view === value} tabIndex={view === value ? 0 : -1}
    onClick={() => setView(value)} className={cn('inline-flex h-8 cursor-pointer items-center rounded-md px-3 text-xs font-medium max-sm:min-h-11 transition-colors duration-150', ring,
    view === value ? 'bg-[var(--color-surface)] text-[var(--color-text)] shadow-[var(--shadow-sheet)]' : 'text-[var(--color-muted)] hover:text-[var(--color-text)]')}>{label}</button>
  const onViewKey = (event: KeyboardEvent) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
    event.preventDefault()
    const other = view === 'fit' ? 'posting' : 'fit'
    setView(other)
    document.getElementById(`fit-view-${other}`)?.focus()
  }
  // Arrow keys move between the folders, as in any tab list.
  const onTabKey = (event: KeyboardEvent) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (!step) return
    event.preventDefault()
    const next = (index + step + folders.length) % folders.length
    setActive(folders[next].key)
    tabRefs.current[next]?.focus()
  }

  return <div className="space-y-4">
    {report ? <div className="sheet anim-settle px-5 py-4"><FitVerdict report={report} /></div> : null}

    {view === 'fit' && (loading || fit.status === 'error' || !report || fit.stale || oldWording) ? <div role="status" className={cn('anim-settle flex flex-wrap items-center gap-3 rounded-xl px-4 py-3', fit.status === 'error' ? 'bg-[var(--color-bad-soft)]' : fit.stale ? 'bg-[var(--color-warn-soft)]' : report && !loading ? 'bg-[var(--color-surface-2)]' : 'bg-[var(--color-accent-soft)]')}>
      {loading ? <Spinner /> : fit.status === 'error' ? <AlertTriangle size={16} className="shrink-0 text-[var(--color-bad)]" aria-hidden="true" /> : null}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{loading ? (report ? 'Updating the comparison with your latest changes…' : 'Comparing the requirements with your resume…')
          : fit.status === 'error' ? 'The comparison could not finish'
          : fit.stale ? 'The posting, your master resume or your confirmed facts changed since this comparison'
          : report ? 'This comparison was written in an older style'
          : 'Not compared with your resume yet'}</p>
        <p className="mt-0.5 text-xs text-[var(--color-muted)]">{loading ? 'Usually under a minute.' : fit.status === 'error' ? fit.error ?? 'Try again.' : fit.stale ? 'Run it again to include the changes.' : report ? 'Some evidence talks about you in the third person. Compare again to have it written to you.' : 'It reads your master resume and confirmed facts against each requirement.'}</p>
      </div>
      {!loading ? <button type="button" onClick={onRetry} className={secondaryButton}><RefreshCw size={13} aria-hidden="true" />{fit.status === 'error' ? 'Try again' : report ? 'Compare again' : 'Compare now'}</button> : null}
    </div> : null}

    <div>
      {/* The switch sits beside the folders it swaps for the job description; on a phone it takes the line above them. */}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-end sm:justify-between">
        {view === 'fit' && current ? <div role="tablist" aria-label="Requirements by standing" className="folder-strip min-w-0 sm:flex-1" onKeyDown={onTabKey}>
          {folders.map((folder, position) => {
            const selected = folder.key === current.key
            const icon = folder.key === 'unchecked' || folder.key === 'keywords' ? null : STANDING[folder.key === 'eligibility' ? (folder.standing === 'bad' ? 'unmet' : 'confirm') : folder.key]
            return <button key={folder.key} ref={(node) => { tabRefs.current[position] = node }} type="button" role="tab" id={`fit-tab-${folder.key}`} aria-controls="fit-list" aria-selected={selected} tabIndex={selected ? 0 : -1}
              title={folder.title} onClick={() => setActive(folder.key)} data-standing={folder.standing} className="folder-tab folder-tab-count">
              <span className="folder-tab-label">{icon?.icon(13)}{folder.tab}</span>
              <span className="folder-count font-display">{folder.count}</span>
            </button>
          })}
        </div> : <span aria-hidden="true" />}
        <div role="tablist" aria-label="Fit" onKeyDown={onViewKey} className="inline-flex shrink-0 gap-0.5 self-start rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-0.5 sm:mb-2 sm:self-auto">
          {viewTab('fit', 'Requirements')}
          {viewTab('posting', 'Job description')}
        </div>
      </div>

      <div id="fit-panel-fit" role="tabpanel" aria-labelledby="fit-view-fit" hidden={view !== 'fit'} className="anim-fade">
        {current ? <section id="fit-list" role="tabpanel" aria-labelledby={`fit-tab-${current.key}`}
          className={cn('rounded-b-xl rounded-tr-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-sheet)]', index > 0 && 'rounded-tl-xl')}>
          {current.key === 'keywords' ? <KeywordFolder keywords={keywords} resumeText={resumeText} report={report} /> : <>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-[var(--color-border)] px-5 py-3">
              <p className="text-[15px]"><span className="font-semibold">{current.title}.</span> <span className="text-[var(--color-muted)]">{current.hint}</span></p>
              {current.list.some((item) => item.weight) ? <p className="flex items-center gap-3 text-xs text-[var(--color-muted)]" aria-hidden="true">
                <span className="inline-flex items-center gap-1.5"><WeightMark weight="must" />Must-have</span>
                <span className="inline-flex items-center gap-1.5"><WeightMark weight="nice" />Nice to have</span>
              </p> : null}
            </div>
            <ol key={current.key} className="divide-y divide-[var(--color-border)]">
              {current.list.map((item, position) => {
                const standing = item.group === 'eligibility' && item.standing ? STANDING[item.standing] : null
                return <li key={item.id} style={{ '--delay': `${Math.min(position, 8) * 45}ms` } as CSSProperties}
                  className={cn('anim-settle grid grid-cols-[0.5rem_minmax(0,1fr)] gap-x-3 py-4 pl-5 pr-5 transition-colors duration-200 last:rounded-b-xl hover:bg-[color-mix(in_oklab,var(--color-surface-2)_45%,transparent)] sm:gap-x-4', item.standing && 'ask-row sm:pointer-fine:pr-[4.25rem]')}>
                  <span className="pt-[0.4375rem]">{item.weight ? <WeightMark weight={item.weight} /> : null}</span>
                  <div className="min-w-0">
                    {standing ? <p className={cn('mb-1 flex items-center gap-1 text-xs font-medium', standing.text)}>{standing.icon(13)}{standing.label}</p> : null}
                    <p className="text-[15px] font-medium leading-snug">{item.weight ? <span className="sr-only">{item.weight === 'must' ? 'Must-have: ' : 'Nice to have: '}</span> : null}{item.title}</p>
                    {item.note || readableEvidence(item.evidence).length ? <DetailBody item={item} /> : null}
                  </div>
                  {/* Ask sits under the row on touch and narrow screens; with a mouse on a wide row it rests as
                      its icon at the row's right and opens to its words on hover or focus (globals.css, .ask-row). */}
                  {item.standing ? <div className="ask-slot col-start-2 mt-3 sm:pointer-fine:mt-0"><AskButton item={item} onAsk={onAsk} /></div> : null}
                </li>
              })}
            </ol>
          </>}
        </section> : null}
      </div>

      <div id="fit-panel-posting" role="tabpanel" aria-labelledby="fit-view-posting" hidden={view !== 'posting'} className="anim-fade">
        <PostingDocument appKey={appKey} posting={posting} keywords={keywords} hasJd={hasJd} onCopy={(text) => void navigator.clipboard.writeText(text)} />
      </div>
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
 * "User-confirmed:" line is something they confirmed. A line that says what is
 * missing or where a match falls short is marked `missing`, so it is not read
 * as something to point to.
 */
function readableEvidence(evidence: string[]): { confirmed: boolean; missing: boolean; text: string }[] {
  return evidence
    .filter((line) => !/^\s*(not|nothing)( (recorded|found|stated))? in the master( or (in )?(the )?confirmed guidance)?\.?\s*$/iu.test(line))
    .map((line) => {
      const confirmed = /^\s*user[- ]confirmed( skill)?:\s*/iu.test(line)
      const text = line.replace(/^\s*user[- ]confirmed( skill)?:\s*/iu, '')
        .replace(/\bthe master( resume)?\b/giu, 'your resume')
        .replace(/\b(the )?confirmed guidance\b/giu, 'what you confirmed')
      const missing = !confirmed && /^\s*(no|not|neither|none|nothing)\b|\b(does not|doesn['’]t|do not|is not|isn['’]t|are not|aren['’]t|not recorded|not stated|not evidenced|not shown|no evidence|absent)\b/iu.test(text)
      return { confirmed, missing, text: text.charAt(0).toUpperCase() + text.slice(1) }
    })
}

function DetailBody({ item }: { item: FitItem }) {
  const evidence = readableEvidence(item.evidence)
  const shown = evidence.filter((line) => !line.missing)
  const missing = evidence.filter((line) => line.missing)
  return <div className="mt-2 space-y-2">
    {item.note ? <p className="text-sm leading-relaxed">{item.note}</p> : null}
    {shown.length ? <div className="border-l border-[var(--color-border-strong)] pl-3">
      <p className="text-xs font-medium text-[var(--color-muted)]">{item.standing === 'gap' ? 'The closest your resume gets' : 'What you can point to'}</p>
      <ul className="mt-1 space-y-1 text-sm leading-relaxed">
        {shown.map((line, index) => <li key={index}>{line.confirmed ? <span className="text-[var(--color-muted)]">You confirmed: </span> : null}{line.text}</li>)}
      </ul>
    </div> : null}
    {missing.length ? <div className="border-l border-dashed border-[var(--color-border-strong)] pl-3">
      <p className="text-xs font-medium text-[var(--color-muted)]">Not shown</p>
      <ul className="mt-1 space-y-1 text-sm leading-relaxed text-[var(--color-muted)]">
        {missing.map((line, index) => <li key={index}>{line.text}</li>)}
      </ul>
    </div> : null}
  </div>
}

/** The visible label stays short; the accessible name starts with it and adds the requirement, so a dozen rows are told apart. */
function AskButton({ item, onAsk }: { item: FitItem; onAsk: (message: string) => void }) {
  const label = item.standing === 'direct' ? 'Ask the AI' : item.group === 'eligibility' ? 'Talk it through' : 'Have this? Tell the AI'
  return <button type="button" onClick={() => onAsk(askAbout(item))} aria-label={`${label}: ${item.title}`} className="ask-button">
    <MessageSquareText size={14} aria-hidden="true" /><span className="ask-label">{label}</span>
  </button>
}
