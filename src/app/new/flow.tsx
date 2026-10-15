'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Card, CardHeader, Badge, Spinner } from '@/components/ui/primitives'
import { readNdjson } from '@/lib/ndjson'
import { isUnnamedCompany, type JdAnalysis } from '@/lib/tailoring/jd'
import { BASE_CVS, defaultBaseCv, type BaseCv } from '@/lib/tailoring/baseCv'
import type { DuplicateMatch } from '@/lib/duplicates'
import { cn } from '@/lib/utils'
import type { SkillSummary } from '@/lib/skills/types'
import { FeatureEnginePicker } from '@/components/FeatureEnginePicker'
import { GeneralApplicationForm } from '@/components/GeneralApplicationForm'
import { ArrowLeft, ArrowRight, ClipboardList, FileText, Link2 } from 'lucide-react'

type Step = 'paste' | 'analyzing' | 'review' | 'creating'

export function NewApplicationFlow() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('paste')
  const [noJd, setNoJd] = useState(false)
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

  useEffect(() => {
    fetch('/api/skills')
      .then((response) => response.json())
      .then((data) => setSkills((data.skills as SkillSummary[]).filter((skill) => skill.runner === 'job-analysis')))
      .catch(() => setSkills([]))
  }, [])

  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const [fetching, setFetching] = useState(false)

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
      router.push(`/applications/${d.key}?tab=overview`)
    } catch (e) {
      setError((e as Error).message)
      setStep('review')
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-7 pb-12">
      <div className="border-b border-[var(--color-border)] pb-6">
        <Link href="/applications" className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-muted)] hover:text-[var(--color-accent)]"><ArrowLeft className="size-3.5" /> Applications</Link>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">New application</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--color-muted)]">
          {noJd ? 'Start with your general resume and add the opportunity details you know.' : 'Add a job posting, review what the AI finds, then create a workspace for this opportunity.'}
        </p>
      </div>

      {!noJd ? <ol className="grid grid-cols-3 gap-2 text-center text-[11px] font-medium text-[var(--color-muted)] sm:flex sm:items-center sm:text-xs" aria-label="Application setup progress">
        <li aria-current={step === 'paste' || step === 'analyzing' ? 'step' : undefined} className={`rounded-lg px-2 py-2 sm:rounded-full sm:px-3 sm:py-1.5 ${step === 'paste' || step === 'analyzing' ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]' : 'bg-[var(--color-surface-2)]'}`}>1. Add posting</li>
        <ArrowRight className="hidden size-3.5 sm:block" aria-hidden="true" />
        <li aria-current={step === 'review' ? 'step' : undefined} className={`rounded-lg px-2 py-2 sm:rounded-full sm:px-3 sm:py-1.5 ${step === 'review' ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]' : 'bg-[var(--color-surface-2)]'}`}>2. Review analysis</li>
        <ArrowRight className="hidden size-3.5 sm:block" aria-hidden="true" />
        <li className={`rounded-lg px-2 py-2 sm:rounded-full sm:px-3 sm:py-1.5 ${step === 'creating' ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]' : 'bg-[var(--color-surface-2)]'}`}>3. Create workspace</li>
      </ol> : null}

      {step === 'creating' ? <p role="status" className="flex items-center gap-2 text-sm text-[var(--color-muted)]"><Spinner />{createdKey ? 'Comparing the job requirements with your master resume… This can take a minute.' : 'Creating the application…'}</p> : null}
      {createdKey && error ? <Link href={`/applications/${createdKey}?tab=overview`} className="text-sm text-[var(--color-accent)] underline">Open the analysis workspace</Link> : null}
      {error ? (
        <Card className="border-[var(--color-bad-soft)]">
          <p className="px-4 py-2.5 text-xs text-[var(--color-bad)]">{error}</p>
        </Card>
      ) : null}

      {step === 'paste' ? <div className="grid gap-3 sm:grid-cols-2" role="group" aria-label="Application starting point">
        <button type="button" disabled={manualBusy} aria-pressed={!noJd} onClick={() => setNoJd(false)} className="flex items-start gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-left transition-colors hover:border-[var(--color-border-strong)] aria-pressed:border-[var(--color-accent)] aria-pressed:bg-[var(--color-accent-soft)]">
          <ClipboardList className="mt-0.5 size-5 shrink-0 text-[var(--color-accent)]" aria-hidden="true" />
          <span><span className="block text-sm font-semibold">I have a job description</span><span className="mt-1 block text-xs leading-relaxed text-[var(--color-muted)]">Analyze requirements and prepare a tailored application.</span></span>
        </button>
        <button type="button" disabled={manualBusy} aria-pressed={noJd} onClick={() => setNoJd(true)} className="flex items-start gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-left transition-colors hover:border-[var(--color-border-strong)] aria-pressed:border-[var(--color-accent)] aria-pressed:bg-[var(--color-accent-soft)]">
          <FileText className="mt-0.5 size-5 shrink-0 text-[var(--color-accent)]" aria-hidden="true" />
          <span><span className="block text-sm font-semibold">No job description</span><span className="mt-1 block text-xs leading-relaxed text-[var(--color-muted)]">Track the opportunity using a copy of your general resume.</span></span>
        </button>
      </div> : null}
      {noJd ? <Card><GeneralApplicationForm onBusy={setManualBusy} /></Card> : null}

      {!noJd && (step === 'paste' || step === 'analyzing') ? (
        <Card>
          <CardHeader title="Job posting" hint="Paste a LinkedIn or career-page link to fetch the posting, or paste the full text." />
          <div className="space-y-5 p-5">
            <div>
            <label htmlFor="posting-url" className="block text-xs font-medium text-[var(--color-muted)]">Posting URL</label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              <span className="flex min-w-0 flex-1 basis-64 items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 focus-within:outline-2 focus-within:outline-[var(--color-accent)]"><Link2 className="size-4 text-[var(--color-faint)]" aria-hidden="true" /><input
                id="posting-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && url.trim() && !fetching && step !== 'analyzing') void fetchAndAnalyze() }}
                type="url"
                placeholder="https://www.linkedin.com/jobs/view/… or a career-page link"
                disabled={fetching || step === 'analyzing'}
                className="h-10 w-full bg-transparent text-sm text-[var(--color-text)] outline-none placeholder:text-[var(--color-faint)]"
              /></span>
              <button
                type="button"
                onClick={() => void fetchAndAnalyze()}
                disabled={!url.trim() || fetching || step === 'analyzing'}
                className="flex min-h-10 items-center gap-2 rounded-lg border border-[var(--color-border)] px-4 text-sm font-medium hover:bg-[var(--color-surface-2)] disabled:opacity-40"
              >
                {fetching ? <Spinner /> : null}
                {fetching ? 'Fetching…' : 'Fetch & analyze'}
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-[var(--color-faint)]">LinkedIn search links work too. Indeed blocks fetching, so paste those postings below.</p>
            </div>
            <label className="block text-xs font-medium text-[var(--color-muted)]">Job description
            <textarea
              value={jd}
              onChange={(e) => setJd(e.target.value)}
              placeholder="Paste the full job description here…"
              rows={14}
              disabled={step === 'analyzing'}
              className="mt-1.5 w-full resize-y rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-4 text-sm leading-relaxed text-[var(--color-text)] outline-none placeholder:text-[var(--color-faint)] focus:border-[var(--color-accent)] disabled:opacity-60"
            /></label>
            <div className="flex flex-wrap items-center gap-3 border-t border-[var(--color-border)] pt-4">
              <button
                type="button"
                onClick={() => void analyze()}
                disabled={jd.trim().length < 40 || step === 'analyzing'}
                className="flex min-h-10 items-center gap-2 rounded-lg bg-[var(--color-accent)] px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
              >
                {step === 'analyzing' ? <Spinner className="border-t-[var(--color-bg)]" /> : null}
                {step === 'analyzing' ? 'Analyzing…' : 'Analyze job'}
              </button>
              <span className="text-xs text-[var(--color-faint)] tnum">{jd.trim().length.toLocaleString()} characters</span>
              {progress.length ? <span role="status" className="min-w-0 flex-1 truncate text-xs text-[var(--color-muted)]">{progress.at(-1)}</span> : null}
            </div>
            {jd.trim().length > 0 && jd.trim().length < 40 ? <p className="text-xs text-[var(--color-warn)]">Add at least 40 characters from the posting to analyze it.</p> : null}
            <details className="rounded-lg bg-[var(--color-surface-2)] p-3 text-xs">
              <summary className="cursor-pointer font-medium text-[var(--color-muted)]">Analysis options</summary>
              <div className="mt-3 flex flex-wrap items-center gap-3">
              <FeatureEnginePicker feature="job-analysis" disabled={step === 'analyzing'} />
              <select
                value={skillId}
                onChange={(event) => setSkillId(event.target.value)}
                disabled={step === 'analyzing'}
                aria-label="Job analysis skill"
                className="h-8 max-w-52 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-xs text-[var(--color-muted)] outline-none focus:border-[var(--color-accent)] disabled:opacity-40"
              >
                {skills.length ? skills.map((skill) => (
                  <option key={skill.id} value={skill.id}>{skill.name} · v{skill.version}</option>
                )) : <option value="analyze-job">Analyze job posting</option>}
              </select>
              <Link href={`/skills/${skillId}`} className="text-xs text-[var(--color-accent)] hover:underline">Edit skill</Link>
              <Link href="/settings" className="text-xs text-[var(--color-accent)] hover:underline">All AI settings</Link>
              </div>
            </details>
            {step === 'analyzing' ? (
              <p className="text-[11px] text-[var(--color-faint)]">
                This runs your local CLI against your subscription, so it can take up to a minute.
              </p>
            ) : null}
          </div>
        </Card>
      ) : null}

      {analysis && step === 'review' && !createdKey ? (
        <>
          {runId ? (
            <div className="flex justify-end">
              <Link href={`/runs/${runId}`} className="text-xs text-[var(--color-accent)] hover:underline">Inspect analysis run →</Link>
            </div>
          ) : null}
          {duplicates.length ? <DuplicateWarning matches={duplicates} /> : null}
          <Card>
            <CardHeader
              title="What the engine read"
              hint="Check this before creating the folder. Everything below comes from the posting."
              action={
                <button onClick={() => setStep('paste')} className="text-xs text-[var(--color-accent)] hover:underline">
                  Edit posting
                </button>
              }
            />
            <div className="grid gap-x-6 gap-y-3 p-5 sm:grid-cols-2">
              <label className="block">
                <span className="block text-[11px] text-[var(--color-faint)]">Company</span>
                <input
                  value={analysis.company}
                  onChange={(e) => setAnalysis({ ...analysis, company: e.target.value })}
                  onBlur={() => { if (!isUnnamedCompany(analysis.company)) void checkDuplicates(analysis) }}
                  placeholder="Not named in the posting: type it"
                  aria-invalid={missingCompany}
                  className={cn(
                    'mt-0.5 h-8 w-full rounded-md border bg-[var(--color-bg)] px-2 text-[13px] outline-none focus:border-[var(--color-accent)] placeholder:text-[var(--color-faint)]',
                    missingCompany ? 'border-[var(--color-warn)]' : 'border-[var(--color-border)]',
                  )}
                />
                {missingCompany ? <span className="mt-1 block text-[11px] text-[var(--color-warn)]">The posting doesn&apos;t name the employer. Add it to create the application.</span> : null}
              </label>
              <Field label="Role" value={analysis.role} />
              <Field label="Archetype" value={analysis.archetype} />
              <Field label="Seniority" value={analysis.seniority} />
              <Field label="Location" value={analysis.location} />
              <Field label="Work mode" value={analysis.workMode} />
              <Field label="Language" value={analysis.language === 'fr' ? 'French → FR master' : 'English → EN master'} />
              <label className="block">
                <span className="block text-[11px] text-[var(--color-faint)]">Starting resume</span>
                <select
                  value={analysis.baseCv ?? defaultBaseCv(analysis.archetype)}
                  onChange={(e) => setAnalysis({ ...analysis, baseCv: e.target.value as BaseCv })}
                  className="mt-0.5 h-8 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 text-[13px] outline-none focus:border-[var(--color-accent)]"
                >
                  {BASE_CVS.map((base) => (
                    <option key={base.id} value={base.id}>
                      {base.label} {analysis.language.toUpperCase()}{base.id === defaultBaseCv(analysis.archetype) ? ' (suggested for this job)' : ''}
                    </option>
                  ))}
                </select>
              </label>
              <Field label="Paper" value={analysis.paperSize} />
              <Field label="Sponsorship" value={analysis.sponsorship} />
            </div>
            {analysis.summary ? (
              <p className="border-t border-[var(--color-border)] px-5 py-3 text-[13px] leading-relaxed text-[var(--color-muted)]">
                {analysis.summary}
              </p>
            ) : null}
          </Card>

          <div className="grid gap-3 lg:grid-cols-2">
            <Card>
              <CardHeader
                title="Requirements"
                hint={`${analysis.requirements.filter((r) => r.weight === 'must').length} must · ${analysis.requirements.filter((r) => r.weight === 'nice').length} nice`}
              />
              <ul className="max-h-80 divide-y divide-[var(--color-border)] overflow-y-auto">
                {[...analysis.requirements].sort((a, b) =>
                  a.weight === b.weight ? a.rank - b.rank : a.weight === 'must' ? -1 : 1,
                ).map((r, i) => (
                  <li key={i} className="flex items-start gap-2.5 px-5 py-2">
                    <Badge tone={r.weight === 'must' ? 'accent' : 'neutral'}>{r.weight} {r.rank}</Badge>
                    <span className="min-w-0 text-[13px] leading-snug text-[var(--color-muted)]">
                      <span className="block text-[var(--color-text)]">{r.text}</span>
                      <span className="mt-0.5 block text-[11px] text-[var(--color-faint)]">{r.priorityReason}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>

            <Card>
              <CardHeader title="Keywords" hint={`${analysis.keywords.length} extracted`} />
              <div className="flex flex-wrap gap-1.5 p-5">
                {analysis.keywords.length ? (
                  analysis.keywords.map((k) => <Badge key={k}>{k}</Badge>)
                ) : (
                  <p className="text-xs text-[var(--color-faint)]">None named in the posting.</p>
                )}
              </div>
            </Card>
          </div>

          <Card>
            <div className="flex flex-wrap items-center gap-3 px-5 py-4">
              <div className="flex-1">
                <p className="text-[13px]">Create the application folder</p>
                <p className="mt-0.5 text-xs text-[var(--color-faint)]">
                  Writes <code>jd.md</code>, a resume YAML seeded from your{' '}
                  {BASE_CVS.find((base) => base.id === (analysis.baseCv ?? defaultBaseCv(analysis.archetype)))?.label}{' '}
                  {analysis.language === 'fr' ? 'FR' : 'EN'} general resume, and <code>tailoring-notes.md</code> with the
                  requirement map. Review the analysis and clarify questions with the AI before requesting tailoring.
                </p>
              </div>
              <button
                onClick={() => void create()}
                disabled={missingCompany}
                className={cn(
                  'flex items-center gap-2 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-[13px] font-medium text-[var(--color-bg)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50',
                )}
              >
                {blocking.length ? 'Create anyway' : error ? 'Retry creating application' : 'Create application'}
              </button>
            </div>
          </Card>
        </>
      ) : null}
    </div>
  )
}

const REASONS: Record<DuplicateMatch['reason'], string> = {
  'same-posting': 'Same posting',
  'same-role': 'Same company and role',
  'same-company': 'Same company',
}

function DuplicateWarning({ matches }: { matches: DuplicateMatch[] }) {
  const blocking = matches.some((match) => match.reason !== 'same-company')
  const applied = matches.some((match) => match.applied && match.reason !== 'same-company')
  return (
    <Card className={blocking ? 'border-[var(--color-warn)]' : undefined}>
      <CardHeader
        title={applied ? 'You already applied to this job' : blocking ? 'You already have an application for this job' : 'You have other applications at this company'}
        hint={blocking ? 'Open the existing application instead, or create a new one anyway if this is a different opening.' : 'Check these are different roles before creating a new application.'}
      />
      <ul className="divide-y divide-[var(--color-border)]">
        {matches.map((match) => (
          <li key={match.key} className="flex flex-wrap items-center gap-3 px-5 py-3">
            <Badge tone={match.reason === 'same-company' ? 'neutral' : 'warn'}>{REASONS[match.reason]}</Badge>
            <span className="min-w-0 flex-1 text-[13px]">
              <span className="block">{match.company} · {match.role || 'Role not recorded'}</span>
              <span className="mt-0.5 block text-[11px] text-[var(--color-faint)]">{match.date || 'No date'} · {match.status || 'No status'}</span>
            </span>
            <Link href={`/applications/${encodeURIComponent(match.key)}`} className="text-xs text-[var(--color-accent)] hover:underline">Open</Link>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-[11px] text-[var(--color-faint)]">{label}</p>
      <p className="mt-0.5 text-[13px]">{value || <span className="text-[var(--color-faint)]">—</span>}</p>
    </div>
  )
}
