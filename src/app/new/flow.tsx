'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Spinner } from '@/components/ui/primitives'
import { readNdjson } from '@/lib/ndjson'
import { isUnnamedCompany, type JdAnalysis } from '@/lib/tailoring/jd'
import { defaultBaseCv, GENERAL_BASE, type ResumeProfile } from '@/lib/tailoring/baseCv'
import type { DuplicateMatch } from '@/lib/duplicates'
import { cn } from '@/lib/utils'
import type { SkillSummary } from '@/lib/skills/types'
import { FeatureEnginePicker } from '@/components/FeatureEnginePicker'
import { GeneralApplicationForm } from '@/components/GeneralApplicationForm'
import { AlertTriangle, ArrowLeft, Check, ChevronRight, ClipboardList, FileText, Link2, Settings2, X, type LucideIcon } from 'lucide-react'

type Step = 'paste' | 'analyzing' | 'review' | 'creating'

/**
 * Unsaved means closing the dialog would throw away an analysis; busy means a
 * request is running and closing would lose it, so the dialog stays open.
 */
export type FlowState = 'idle' | 'unsaved' | 'busy'

/** In a dialog, `onClose` is set: the flow shows a close button instead of the page header. */
export function NewApplicationFlow({ onClose, onStateChange }: { onClose?: () => void; onStateChange?: (state: FlowState) => void } = {}) {
  const router = useRouter()
  const [step, setStep] = useState<Step>('paste')
  const [noJd, setNoJd] = useState(false)
  const [pasting, setPasting] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [manualBusy, setManualBusy] = useState(false)
  const [jd, setJd] = useState('')
  const [url, setUrl] = useState('')
  const [analysis, setAnalysis] = useState<JdAnalysis | null>(null)
  const [progress, setProgress] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [skills, setSkills] = useState<SkillSummary[]>([])
  const [skillId, setSkillId] = useState('analyze-job')
  const [runId, setRunId] = useState<string | null>(null)
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([])
  const blocking = duplicates.filter((match) => match.reason !== 'same-company')
  const missingCompany = !!analysis && isUnnamedCompany(analysis.company)

  const [profiles, setProfiles] = useState<ResumeProfile[]>([])

  useEffect(() => {
    fetch('/api/skills')
      .then((response) => response.json())
      .then((data) => setSkills((data.skills as SkillSummary[]).filter((skill) => skill.runner === 'job-analysis')))
      .catch(() => setSkills([]))
    fetch('/api/profile/resumes')
      .then((response) => response.json())
      .then((data) => setProfiles(data.profiles as ResumeProfile[]))
      .catch(() => setProfiles([]))
  }, [])

  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const [fetching, setFetching] = useState(false)
  const busy = fetching || manualBusy || step === 'analyzing' || step === 'creating'
  const state: FlowState = busy ? 'busy' : step === 'review' ? 'unsaved' : 'idle'
  useEffect(() => { onStateChange?.(state) }, [state, onStateChange])

  /** Read the posting from its link, fill the form, then analyze it straight away. */
  async function fetchAndAnalyze() {
    setFetching(true)
    setError(null)
    try {
      const r = await fetch('/api/jd/fetch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const d = await r.json()
      if (!r.ok) { setError(d.error ?? 'Could not fetch this posting. Paste the job description instead.'); return }
      setJd(d.text)
      setUrl(d.url)
      setFetching(false)
      await analyze(d.text)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setFetching(false)
    }
  }

  async function analyze(posting = jd) {
    setStep('analyzing')
    setError(null)
    setProgress([])
    setRunId(null)

    try {
      const r = await fetch('/api/jd', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jd: posting, skillId }),
      })

      if (!r.ok) {
        setError((await r.json()).error ?? 'analysis failed')
        setStep('paste')
        return
      }

      let completed: JdAnalysis | null = null
      let failed = false
      // One event per line, so progress shows while the model works.
      await readNdjson(r, (e) => {
        if (e.type === 'start') {
          setProgress((p) => [...p, `engine: ${e.engine} · ${e.skillId} v${e.skillVersion}`])
          if (typeof e.runId === 'string') setRunId(e.runId)
        }
        if (e.type === 'progress') setProgress((p) => [...p, e.message as string])
        if (e.type === 'error') { failed = true; setError(e.message as string); setStep('paste') }
        if (e.type === 'done') { completed = e.analysis as JdAnalysis; setAnalysis(completed) }
      })
      if (!failed && !completed) throw new Error('Analysis ended without a result. Please retry.')
      if (!failed && completed) {
        // A placeholder like "Not stated" is not a name: clear it so the review asks for one.
        const result: JdAnalysis = completed
        if (isUnnamedCompany(result.company)) {
          completed = { ...result, company: '' }
          setAnalysis(completed)
        }
        setStep('review')
        if (!isUnnamedCompany(completed.company)) void checkDuplicates(completed, posting)
      }
    } catch (e) {
      setError((e as Error).message)
      setStep('paste')
    }
  }

  async function checkDuplicates(result: JdAnalysis, posting?: string) {
    setDuplicates([])
    try {
      const r = await fetch('/api/applications/duplicates', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ company: result.company, role: result.role, jd: posting ?? jd }),
      })
      if (r.ok) setDuplicates((await r.json()).matches as DuplicateMatch[])
    } catch {
      // The create route checks again, so a failed lookup only loses the early warning.
    }
  }

  async function create(result = analysis, analysisRun = runId) {
    if (!result) return
    setStep('creating')
    setError(null)
    try {
      const r = await fetch('/api/applications/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ analysis: result, jd, url, runId: analysisRun, allowDuplicate: blocking.length > 0 }),
      })
      const d = await r.json()
      if (r.status === 409 && Array.isArray(d.duplicates)) { setDuplicates(d.duplicates); setStep('review'); return }
      if (!r.ok) { setError(d.error ?? 'create failed'); setStep('review'); return }
      setCreatedKey(d.key)
      // Run the fit analysis here so the overview opens with its results
      // instead of a waiting placeholder. A failure still opens the page,
      // which shows the error with a retry.
      await fetch(`/api/applications/${encodeURIComponent(d.key)}/workspace/fit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }).catch(() => {})
      router.push(`/applications/${d.key}?tab=workspace&pane=fit`)
    } catch (e) {
      setError((e as Error).message)
      setStep('review')
    }
  }

  const suggested = analysis ? defaultBaseCv(analysis.archetype, profiles) : GENERAL_BASE.id
  const resume = analysis?.baseCv ?? suggested
  const bases = [GENERAL_BASE, ...profiles]
  const facts = analysis ? [analysis.seniority, analysis.location, analysis.workMode].filter((fact): fact is string => !!fact && !/^(not |unknown|n\/a)/i.test(fact)) : []
  const sponsorship = sponsorshipTone(analysis?.sponsorship)
  const subtitle = noJd ? 'No posting? Track the opportunity with a copy of your general resume, ready to tweak.'
    : step === 'review' ? 'Check what the AI read from the posting. Nothing is saved until you create the application.'
    : step === 'creating' ? 'Saving the application and comparing it with your resume.'
    : 'Give the job posting. The AI reads it, then you check the details before anything is saved.'

  const body = (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 id="new-application-title" className={onClose ? 'text-xl font-semibold tracking-tight' : 'text-2xl font-semibold tracking-tight'}>New application</h1>
          <p className="mt-1 text-sm leading-relaxed text-[var(--color-muted)]">{subtitle}</p>
        </div>
        {!noJd && step !== 'review' && step !== 'creating' ? (
          <button type="button" onClick={() => setShowSettings((open) => !open)} aria-expanded={showSettings} aria-controls="analysis-settings" aria-label="Analysis settings" title="Analysis settings" className={cn(iconButton, showSettings && 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]')}>
            <Settings2 className="size-4" aria-hidden="true" />
          </button>
        ) : null}
        {onClose ? <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className={iconButton}><X className="size-4" aria-hidden="true" /></button> : null}
      </div>

      {!noJd ? (
        <ol aria-label="Steps" className="flex items-center gap-2 text-xs font-medium">
          <StepMarker n={1} label="Job posting" state={step === 'paste' || step === 'analyzing' ? 'current' : 'done'} />
          <span aria-hidden="true" className={cn('h-px w-8 sm:w-12', step === 'review' || step === 'creating' ? 'bg-[var(--color-ok)]' : 'bg-[var(--color-border-strong)]')} />
          <StepMarker n={2} label="Check & create" state={step === 'review' || step === 'creating' ? 'current' : 'next'} />
        </ol>
      ) : null}

      {showSettings && !noJd && (step === 'paste' || step === 'analyzing') ? (
        <div id="analysis-settings" className="space-y-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4">
          <div>
            <p className="text-sm font-medium">Analysis settings</p>
            <p className="mt-0.5 text-xs text-[var(--color-muted)]">Which AI reads the posting, and with which instructions. The model choice is kept for next time.</p>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <FeatureEnginePicker feature="job-analysis" disabled={step === 'analyzing'} />
            <label className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]">Skill
              <select
                value={skillId}
                onChange={(event) => setSkillId(event.target.value)}
                disabled={step === 'analyzing'}
                className="h-8 max-w-52 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-xs text-[var(--color-muted)] outline-none focus:border-[var(--color-accent)] disabled:opacity-40"
              >
                {skills.length ? skills.map((skill) => (
                  <option key={skill.id} value={skill.id}>{skill.name} · v{skill.version}</option>
                )) : <option value="analyze-job">Analyze job posting</option>}
              </select>
            </label>
          </div>
          <p className="flex gap-4 text-xs">
            <Link href={`/skills/${skillId}`} className="text-[var(--color-accent)] hover:underline">Edit the skill</Link>
            <Link href="/settings" className="text-[var(--color-accent)] hover:underline">All AI settings</Link>
          </p>
        </div>
      ) : null}

      {noJd ? (
        <div className="space-y-4">
          <button type="button" disabled={manualBusy} onClick={() => setNoJd(false)} className={textButton}><ArrowLeft className="size-3.5" aria-hidden="true" /> I have a job posting</button>
          <GeneralApplicationForm onBusy={setManualBusy} onCreated={onClose} />
        </div>
      ) : null}

      {!noJd && (step === 'paste' || step === 'analyzing') ? (
        <div className="space-y-4">
          <div className="rounded-xl bg-[var(--color-accent-soft)] p-4 sm:p-5">
            {pasting ? (
              <>
                <label htmlFor="posting-text" className="block text-sm font-semibold">Paste the job description</label>
                <p className="mt-0.5 text-xs text-[var(--color-muted)]">The whole posting: title, company, responsibilities and requirements.</p>
                <textarea
                  id="posting-text"
                  autoFocus
                  value={jd}
                  onChange={(e) => setJd(e.target.value)}
                  rows={onClose ? 8 : 14}
                  disabled={step === 'analyzing'}
                  className="mt-3 w-full resize-y rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-3.5 text-sm leading-relaxed text-[var(--color-text)] outline-none focus:border-[var(--color-accent)] disabled:opacity-60"
                />
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button type="button" onClick={() => void analyze()} disabled={jd.trim().length < 40 || step === 'analyzing'} aria-busy={step === 'analyzing'} className={primaryButton}>
                    {step === 'analyzing' ? <Spinner className="border-[var(--color-on-solid)]/30 border-t-[var(--color-on-solid)]" /> : null}
                    {step === 'analyzing' ? 'Analyzing…' : 'Analyze posting'}
                  </button>
                  <span className={cn('text-xs tnum', jd.trim().length > 0 && jd.trim().length < 40 ? 'text-[var(--color-warn)]' : 'text-[var(--color-muted)]')}>
                    {jd.trim().length > 0 && jd.trim().length < 40 ? 'Paste at least 40 characters.' : `${jd.trim().length.toLocaleString()} characters`}
                  </span>
                </div>
              </>
            ) : (
              <>
                <label htmlFor="posting-url" className="block text-sm font-semibold">Paste the link to the job</label>
                <p className="mt-0.5 text-xs text-[var(--color-muted)]">A LinkedIn job or search link, or a company careers page.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="flex h-11 min-w-0 flex-1 basis-72 items-center gap-2.5 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3.5 focus-within:border-[var(--color-accent)]">
                    <Link2 className="size-4 shrink-0 text-[var(--color-accent)]" aria-hidden="true" />
                    <input
                      id="posting-url"
                      autoFocus
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && url.trim() && !busy) void fetchAndAnalyze() }}
                      type="url"
                      inputMode="url"
                      placeholder="https://www.linkedin.com/jobs/view/…"
                      disabled={busy}
                      className="h-full w-full bg-transparent text-sm text-[var(--color-text)] outline-none placeholder:text-[var(--color-faint)] disabled:opacity-60"
                    />
                  </span>
                  <button type="button" onClick={() => void fetchAndAnalyze()} disabled={!url.trim() || busy} aria-busy={busy} className={cn(primaryButton, 'h-11')}>
                    {busy ? <Spinner className="border-[var(--color-on-solid)]/30 border-t-[var(--color-on-solid)]" /> : null}
                    {fetching ? 'Fetching…' : step === 'analyzing' ? 'Analyzing…' : 'Analyze posting'}
                  </button>
                </div>
              </>
            )}
            {step === 'analyzing' ? (
              <p role="status" className="mt-3 flex items-center gap-2 text-xs text-[var(--color-muted)]">
                <span className="min-w-0 truncate">{progress.at(-1) ?? 'Starting the analysis…'}</span>
                <span className="shrink-0">· usually under a minute</span>
              </p>
            ) : null}
          </div>

          {pasting ? (
            <OptionRow icon={Link2} question="Have a link?" action="Use the link instead" disabled={step === 'analyzing'} onClick={() => { setPasting(false); setError(null) }} />
          ) : (
            <OptionRow icon={ClipboardList} question="No link, or an Indeed link?" action="Paste the job description" disabled={busy} onClick={() => { setPasting(true); setError(null) }} />
          )}
        </div>
      ) : null}

      {analysis && step === 'review' && !createdKey ? (
        <div className="space-y-5">
          {duplicates.length ? <DuplicateWarning matches={duplicates} /> : null}
          <section aria-labelledby="read-title" className="rounded-xl bg-[var(--color-surface-2)] p-4 sm:p-5">
            <h2 id="read-title" className="text-lg font-semibold leading-snug tracking-tight text-balance">{analysis.role || 'Role not named'}</h2>
            {facts.length || sponsorship ? (
              <ul className="mt-2.5 flex flex-wrap gap-1.5">
                {facts.map((fact) => <li key={fact} className="rounded-md bg-[var(--color-surface)] px-2 py-0.5 text-xs text-[var(--color-muted)]">{fact}</li>)}
                {sponsorship ? <li className={cn('rounded-md px-2 py-0.5 text-xs font-medium', SPONSORSHIP_TONE[sponsorship.tone])}>{sponsorship.label}</li> : null}
              </ul>
            ) : null}
            {analysis.summary ? <p className="mt-3 max-w-[68ch] text-[13px] leading-relaxed text-[var(--color-muted)]">{analysis.summary}</p> : null}
          </section>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="block text-sm font-medium">Company</span>
              <input
                value={analysis.company}
                onChange={(e) => setAnalysis({ ...analysis, company: e.target.value })}
                onBlur={() => { if (!isUnnamedCompany(analysis.company)) void checkDuplicates(analysis) }}
                placeholder="Type the employer's name"
                aria-invalid={missingCompany}
                aria-describedby="company-help"
                className={cn(field, missingCompany && 'border-[var(--color-warn)] bg-[var(--color-warn-soft)]')}
              />
              <span id="company-help" className={cn('mt-1.5 block text-xs', missingCompany ? 'font-medium text-[var(--color-warn)]' : 'text-[var(--color-faint)]')}>
                {missingCompany ? 'The posting doesn’t name the employer. Type it to continue.' : 'Fix it if the AI got it wrong.'}
              </span>
            </label>
            <label className="block">
              <span className="block text-sm font-medium">Start from</span>
              <select value={resume} onChange={(e) => setAnalysis({ ...analysis, baseCv: e.target.value })} className={field}>
                {bases.map((base) => (
                  <option key={base.id} value={base.id}>{base.name} resume{base.id === suggested ? ' (suggested)' : ''}</option>
                ))}
              </select>
              <span className="mt-1.5 block text-xs text-[var(--color-faint)]">
                {resume === suggested ? <span className="font-medium text-[var(--color-accent)]">Suggested for this role. </span> : null}
                Uses the {analysis.language === 'fr' ? 'French' : 'English'} version, the posting’s language.
              </span>
            </label>
          </div>
        </div>
      ) : null}

      {step === 'creating' ? (
        <ol role="status" className="space-y-2.5 rounded-xl bg-[var(--color-surface-2)] p-4 text-sm sm:p-5">
          <li className={cn('flex items-center gap-2.5', createdKey ? 'text-[var(--color-ok)]' : 'text-[var(--color-text)]')}>
            {createdKey ? <Check className="size-4" aria-hidden="true" /> : <Spinner />}
            {createdKey ? 'Application saved' : 'Saving the application…'}
          </li>
          <li className={cn('flex items-center gap-2.5', createdKey ? 'text-[var(--color-text)]' : 'text-[var(--color-faint)]')}>
            {createdKey ? <Spinner /> : <span className="size-3.5 rounded-full border-2 border-[var(--color-border-strong)]" aria-hidden="true" />}
            Comparing the requirements with your resume, usually under a minute
          </li>
        </ol>
      ) : null}

      {error ? (
        <p role="alert" className="flex gap-2 rounded-lg bg-[var(--color-bad-soft)] px-3.5 py-2.5 text-xs leading-relaxed text-[var(--color-bad)]">
          <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : null}
      {createdKey && error ? <Link href={`/applications/${createdKey}?tab=workspace&pane=fit`} className="text-sm text-[var(--color-accent)] underline">Open the application</Link> : null}

      {!noJd && (step === 'paste' || step === 'analyzing') ? (
        <div className="border-t border-[var(--color-border)] pt-3">
          <OptionRow icon={FileText} question="No job description at all?" action="Track it with your general resume" disabled={busy} onClick={() => { setNoJd(true); setError(null) }} />
        </div>
      ) : null}

      {analysis && step === 'review' && !createdKey ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border)] pt-4">
          <button type="button" onClick={() => setStep('paste')} className={textButton}><ArrowLeft className="size-3.5" aria-hidden="true" /> Back to the posting</button>
          <button type="button" onClick={() => void create()} disabled={missingCompany} className={blocking.length ? secondaryButton : primaryButton}>
            {blocking.length ? 'Create it anyway' : error ? 'Try again' : 'Create application'}
          </button>
        </div>
      ) : null}
    </div>
  )

  if (onClose) return body
  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-12">
      <Link href="/applications" className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-muted)] hover:text-[var(--color-accent)]"><ArrowLeft className="size-3.5" aria-hidden="true" /> Applications</Link>
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">{body}</div>
    </div>
  )
}

/** A secondary path, drawn as a whole clickable row so it never reads as a note. */
function OptionRow({ icon: Icon, question, action, disabled, onClick }: { icon: LucideIcon; question: string; action: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className="group -mx-3 flex w-[calc(100%+1.5rem)] cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition-colors hover:bg-[var(--color-accent-soft)] focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent">
      <Icon className="size-4 shrink-0 text-[var(--color-accent)]" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="text-[var(--color-muted)]">{question} </span>
        <span className="font-medium text-[var(--color-accent)] underline-offset-4 group-hover:underline">{action}</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-[var(--color-accent)] transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
    </button>
  )
}

function StepMarker({ n, label, state }: { n: number; label: string; state: 'done' | 'current' | 'next' }) {
  return (
    <li aria-current={state === 'current' ? 'step' : undefined} className={cn('flex items-center gap-1.5', state === 'current' ? 'text-[var(--color-text)]' : state === 'done' ? 'text-[var(--color-ok)]' : 'text-[var(--color-faint)]')}>
      <span className={cn(
        'grid size-5 place-items-center rounded-full text-[11px] font-semibold',
        state === 'current' ? 'bg-[var(--color-accent)] text-[var(--color-on-solid)]' : state === 'done' ? 'bg-[var(--color-ok-soft)] text-[var(--color-ok)]' : 'border border-[var(--color-border-strong)]',
      )}>
        {state === 'done' ? <Check className="size-3" aria-hidden="true" /> : n}
      </span>
      {label}
    </li>
  )
}

/** Colour the sponsorship line by what it says: offered, ruled out, or unclear. */
function sponsorshipTone(text: string | null | undefined): { label: string; tone: 'ok' | 'bad' | 'neutral' } | null {
  const value = text?.trim()
  if (!value) return null
  const label = /sponsor/i.test(value) ? value : `Sponsorship: ${value}`
  if (/\b(no|not|none|unavailable|without|must already|cannot|can't)\b/i.test(value) && !/not (stated|mentioned|specified)/i.test(value)) return { label, tone: 'bad' }
  if (/\b(yes|offered|available|provided|supported|possible|will sponsor)\b/i.test(value)) return { label, tone: 'ok' }
  return { label, tone: 'neutral' }
}

const SPONSORSHIP_TONE = {
  ok: 'bg-[var(--color-ok-soft)] text-[var(--color-ok)]',
  bad: 'bg-[var(--color-bad-soft)] text-[var(--color-bad)]',
  neutral: 'bg-[var(--color-surface)] text-[var(--color-muted)]',
} as const

const iconButton = 'grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg border border-[var(--color-border)] text-[var(--color-muted)] transition-colors hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-40'
const textButton = 'inline-flex cursor-pointer items-center gap-1.5 rounded text-xs font-medium text-[var(--color-accent)] underline-offset-4 transition-colors hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:cursor-not-allowed disabled:text-[var(--color-faint)] disabled:no-underline'
const primaryButton = 'inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-lg bg-[var(--color-accent)] px-4 text-sm font-semibold text-[var(--color-on-solid)] shadow-[0_1px_2px_oklch(0_0_0/0.15)] transition-[filter,box-shadow] hover:brightness-110 hover:shadow-[0_2px_6px_oklch(0_0_0/0.18)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:cursor-not-allowed disabled:bg-[var(--color-surface-2)] disabled:text-[var(--color-faint)] disabled:shadow-none disabled:hover:brightness-100 disabled:aria-busy:cursor-progress disabled:aria-busy:bg-[var(--color-accent)] disabled:aria-busy:text-[var(--color-on-solid)]'
const secondaryButton = 'inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-4 text-sm font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-40'
const field = 'mt-1.5 h-10 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-sm outline-none placeholder:text-[var(--color-faint)] focus:border-[var(--color-accent)]'

const REASONS: Record<DuplicateMatch['reason'], string> = {
  'same-posting': 'Same posting',
  'same-role': 'Same company and role',
  'same-company': 'Same company',
}

function DuplicateWarning({ matches }: { matches: DuplicateMatch[] }) {
  const blocking = matches.some((match) => match.reason !== 'same-company')
  const applied = matches.some((match) => match.applied && match.reason !== 'same-company')
  return (
    <div className={cn('rounded-lg px-4 py-3', blocking ? 'bg-[var(--color-warn-soft)]' : 'bg-[var(--color-surface-2)]')}>
      <p className="flex items-center gap-2 text-sm font-medium">
        <AlertTriangle className={cn('size-4 shrink-0', blocking ? 'text-[var(--color-warn)]' : 'text-[var(--color-muted)]')} aria-hidden="true" />
        {applied ? 'You already applied to this job' : blocking ? 'You already have an application for this job' : 'You have other applications at this company'}
      </p>
      <ul className="mt-2 space-y-1.5 pl-6">
        {matches.map((match) => (
          <li key={match.key} className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
            <Link href={`/applications/${encodeURIComponent(match.key)}`} className="font-medium text-[var(--color-accent)] hover:underline">{match.company} · {match.role || 'Role not recorded'}</Link>
            <span className="text-xs text-[var(--color-muted)]">{REASONS[match.reason]} · {match.date || 'No date'} · {match.status || 'No status'}</span>
          </li>
        ))}
      </ul>
      {blocking ? <p className="mt-2 pl-6 text-xs text-[var(--color-muted)]">Open it instead, or create a new one if this is a different opening.</p> : null}
    </div>
  )
}
