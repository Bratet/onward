'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { parse } from 'yaml'
import { ArrowRight, FileUp, Upload } from 'lucide-react'
import { ErrorNotice } from '@/components/ErrorNotice'
import { PdfPreview } from '@/components/PdfPreview'
import { TOUR_HREF } from '@/components/Tour'
import { Badge, Spinner } from '@/components/ui/primitives'
import type { ImportLang, ImportSummary } from '@/lib/resumeImport'
import { cn } from '@/lib/utils'

type Step = 'input' | 'reading' | 'review' | 'saving' | 'done'

interface Imported {
  yaml: string
  language: ImportLang
  summary?: ImportSummary
  engine?: string
}

interface Saved {
  pdf: { updated: boolean; pages?: number | null; reason?: string }
}

const LANGUAGES: Record<ImportLang, string> = { en: 'English', fr: 'French' }
const ENGINES: Record<string, string> = { claude: 'Claude Code', codex: 'Codex' }

export function WelcomeFlow({ firstName }: { firstName: string }) {
  const [step, setStep] = useState<Step>('input')
  const [file, setFile] = useState<File | null>(null)
  const [pasting, setPasting] = useState(false)
  const [text, setText] = useState('')
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [imported, setImported] = useState<Imported | null>(null)
  const [saved, setSaved] = useState<Saved | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const controller = useRef<AbortController | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  // Reading takes a minute or two; a running clock shows it has not stalled.
  useEffect(() => {
    if (step !== 'reading') return
    const started = Date.now()
    setElapsed(0)
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [step])

  const ready = pasting ? text.trim().length >= 200 : file !== null

  async function read(blank = false) {
    setError(null)
    const form = new FormData()
    if (blank) form.set('blank', '1')
    else if (pasting) form.set('text', text)
    else if (file) form.set('file', file)
    controller.current = new AbortController()
    setStep(blank ? 'saving' : 'reading')
    try {
      const response = await fetch('/api/profile/import', { method: 'POST', body: form, signal: controller.current.signal })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'Reading the resume failed.')
      setImported(data)
      if (blank) await save(data)
      else setStep('review')
    } catch (err) {
      if ((err as Error).name === 'AbortError') return setStep('input')
      setError((err as Error).message)
      setStep('input')
    }
  }

  /** The same resume becomes the master and the general one; both save and render through /api/masters. */
  async function save(result: Imported) {
    setError(null)
    setStep('saving')
    try {
      let general: Saved | null = null
      for (const family of ['masters', 'ownCv'] as const) {
        const response = await fetch(`/api/masters/${result.language}?family=${family}`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ yaml: result.yaml }),
        })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error ?? 'Saving the resume failed.')
        if (family === 'ownCv') general = data
      }
      setSaved(general)
      setStep('done')
    } catch (err) {
      setError((err as Error).message)
      setStep(result.summary ? 'review' : 'input')
    }
  }

  function choose(chosen: File | undefined | null) {
    if (!chosen) return
    setError(null)
    setFile(chosen)
  }

  function drop(event: DragEvent) {
    event.preventDefault()
    setDragging(false)
    if (step === 'input') choose(event.dataTransfer.files[0])
  }

  if (step === 'done' && imported) {
    const lang = imported.language
    if (!imported.summary) {
      return (
        <Shell title="Your resumes are set up" lead="Your master and general resumes start with just your name. Write your experience into them in Profile, then come back to add a job.">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Link href={`/profile?src=master-${lang}`} className={primaryButton}>Write my resume<ArrowRight className="size-4" aria-hidden /></Link>
            <Link href={TOUR_HREF} className={textButton}>See around the app first</Link>
          </div>
        </Shell>
      )
    }
    const pages = saved?.pdf.pages ?? null
    return (
      <Shell title="This is your resume, made by Onward" lead="It is saved as your master and your general resume. Every CV Onward tailors for a job starts from these two.">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start">
          <div className="h-[min(78vh,64rem)] min-h-[28rem] overflow-hidden rounded-xl border border-[var(--color-border)]">
            {saved?.pdf.updated
              ? <PdfPreview token={null} src={`/api/masters/${lang}?family=ownCv&pdf=1`} document="general resume" />
              : (
                <div className="grid h-full place-items-center bg-[var(--color-surface-2)] p-8 text-center">
                  <div className="max-w-sm">
                    <p className="text-[15px] font-semibold">Saved, but the PDF could not be made yet</p>
                    <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-muted)]">{saved?.pdf.reason}</p>
                    <p className="mt-3 text-sm leading-relaxed text-[var(--color-muted)]">Open it in Profile to fix this; the PDF is made again every time you save.</p>
                  </div>
                </div>
              )}
          </div>

          <aside className="lg:sticky lg:top-6">
            <h2 className="text-base font-semibold">What to do next</h2>
            <Link href={TOUR_HREF} className={cn(primaryButton, 'mt-3 w-full')}>Show me around<ArrowRight className="size-4" aria-hidden /></Link>
            <p className="mt-2 text-[13px] leading-relaxed text-[var(--color-muted)]">A one-minute look at where everything is. It ends where you add your first job.</p>
            <Link href="/new" className={cn(textButton, 'mt-2')}>Skip it and add a job now</Link>

            <ul className="mt-6 divide-y divide-[var(--color-border)] border-y border-[var(--color-border)]">
              <NextLink href={`/profile?src=general-${lang}`} title="Check your general resume">
                {pages && pages > 1
                  ? `It runs to ${pages} pages. Trim it to the one page you would send; the master keeps everything.`
                  : 'Make sure it reads as the resume you would send today.'}
              </NextLink>
              <NextLink href={`/profile?src=master-${lang}`} title="Grow your master">
                Add the projects, results and skills that never fit on one page. Onward only uses what is written there.
              </NextLink>
            </ul>
            <p className="mt-4 text-xs leading-relaxed text-[var(--color-faint)]">
              Applying in {lang === 'en' ? 'French' : 'English'} too? In Profile, open the {lang === 'en' ? 'FR' : 'EN'} version of each resume and ask the assistant to translate it.
            </p>
          </aside>
        </div>
      </Shell>
    )
  }

  if (imported?.summary && (step === 'review' || step === 'saving')) {
    const { summary } = imported
    return (
      <Shell title="Check what Onward found" lead="Every line is copied from your resume as it was written. Make sure nothing is missing, then save it. You can change any of it later in Profile.">
        <div className="max-w-3xl space-y-4">
          <p className="flex flex-wrap items-center gap-1.5">
            <Badge tone="accent">{LANGUAGES[summary.language]}</Badge>
            <Badge>{count(summary.roles, 'role')} · {count(summary.bullets, 'bullet')}</Badge>
            {summary.education ? <Badge>{count(summary.education, 'degree')}</Badge> : null}
            {summary.projects ? <Badge>{count(summary.projects, 'project')}</Badge> : null}
            {summary.skills ? <Badge>{count(summary.skills, 'skill group')}</Badge> : null}
            {summary.other.length ? <span className="text-xs text-[var(--color-muted)]">and {summary.other.join(', ')}</span> : null}
          </p>
          <ResumePreview yaml={imported.yaml} />
          {error ? <ErrorNotice error={error} className="rounded-lg" /> : null}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className={primaryButton} disabled={step === 'saving'} aria-busy={step === 'saving'} onClick={() => void save(imported)}>
              {step === 'saving' ? <Spinner className="border-[var(--color-on-solid)]/30 border-t-[var(--color-on-solid)]" /> : null}
              {step === 'saving' ? 'Saving and making your PDF…' : 'Save as my resumes'}
            </button>
            <button type="button" className={secondaryButton} disabled={step === 'saving'} onClick={() => { setImported(null); setStep('input') }}>
              Use a different resume
            </button>
          </div>
        </div>
      </Shell>
    )
  }

  const reading = step === 'reading'
  const busy = reading || step === 'saving'
  return (
    <Shell
      title={firstName ? `Welcome, ${firstName}. Start with the resume you have.` : 'Start with the resume you have.'}
      lead="Onward works only from your own resume and never invents experience. Give it your current one, and in a minute or two you will see it back as your first Onward resume."
    >
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
        <section aria-labelledby="resume-input" className="rounded-xl bg-[var(--color-accent-soft)] p-4 sm:p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="resume-input" className="text-sm font-semibold">Your current resume</h2>
            {reading ? null : (
              <button type="button" className={textButton} disabled={busy} onClick={() => { setPasting(!pasting); setError(null) }}>
                {pasting ? 'Choose a file instead' : 'Paste the text instead'}
              </button>
            )}
          </div>
          <p className="mt-0.5 text-xs text-[var(--color-muted)]">A PDF works best, including LinkedIn&apos;s &quot;Save to PDF&quot;. Save a Word resume as PDF first.</p>

          {reading ? (
            <div role="status" className="mt-3 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-5 py-8">
              <div className="flex items-center gap-3">
                <Spinner className="size-4" />
                <p className="text-sm font-semibold">Reading {pasting ? 'your resume' : file?.name}</p>
                <span className="ml-auto text-xs text-[var(--color-muted)] tnum" aria-hidden>{clock(elapsed)}</span>
              </div>
              <p className="mt-2 max-w-prose text-[13px] leading-relaxed text-[var(--color-muted)]">
                Your AI tool is sorting it into sections, word for word. This usually takes under two minutes; you can leave this page open and come back.
              </p>
              <button type="button" className={cn(secondaryButton, 'mt-4')} onClick={() => controller.current?.abort()}>Cancel</button>
            </div>
          ) : pasting ? (
            <textarea
              aria-label="Resume text"
              autoFocus
              value={text}
              disabled={busy}
              onChange={(event) => setText(event.target.value)}
              rows={12}
              placeholder="Paste your whole resume here"
              className="mt-3 w-full resize-y rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-3.5 text-sm leading-relaxed text-[var(--color-text)] outline-none placeholder:text-[var(--color-faint)] focus:border-[var(--color-accent)] disabled:opacity-60"
            />
          ) : (
            <div
              onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={drop}
              className={cn(
                'mt-3 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed bg-[var(--color-surface)] px-4 py-10 text-center transition-colors',
                dragging ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]' : 'border-[var(--color-border-strong)]',
              )}
            >
              {file ? <FileUp className="size-6 text-[var(--color-accent)]" aria-hidden /> : <Upload className="size-6 text-[var(--color-faint)]" aria-hidden />}
              <p className="text-sm font-medium">{file ? file.name : 'Drop your resume here'}</p>
              <button type="button" className={textButton} disabled={busy} onClick={() => fileInput.current?.click()}>
                {file ? 'Choose another file' : 'or choose a file'}
              </button>
              <input
                ref={fileInput}
                type="file"
                accept=".pdf,.txt,.md,application/pdf,text/plain"
                className="sr-only"
                tabIndex={-1}
                onChange={(event) => { choose(event.target.files?.[0]); event.target.value = '' }}
              />
            </div>
          )}

          {error ? <ErrorNotice error={error} className="mt-3 rounded-lg" /> : null}

          {reading ? null : (
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
              <button type="button" className={primaryButton} disabled={!ready || busy} onClick={() => void read()}>
                Read my resume<ArrowRight className="size-4" aria-hidden />
              </button>
              {pasting && text.trim().length > 0 && text.trim().length < 200
                ? <span className="text-xs text-[var(--color-muted)]">Paste the whole resume, not just a part.</span>
                : null}
            </div>
          )}
        </section>

        <aside aria-labelledby="what-happens">
          <h2 id="what-happens" className="text-sm font-semibold">What Onward does with it</h2>
          <ol className="relative mt-4 space-y-5 before:absolute before:top-2 before:bottom-2 before:left-[9.5px] before:w-px before:bg-[var(--color-border-strong)]">
            <Stage n={1} title="Copies it, word for word">Your AI tool sorts it into sections. Nothing is reworded or added.</Stage>
            <Stage n={2} title="Makes your two resumes">
              Your <strong className="font-semibold text-[var(--color-text)]">master</strong> holds everything you have done, at any length, and is never sent.
              Your <strong className="font-semibold text-[var(--color-text)]">general</strong> resume is the one you send, ideally a page.
            </Stage>
            <Stage n={3} title="Tailors one per job">For each posting, Onward cuts a CV from them. You check it before you send it.</Stage>
          </ol>
          <p className="mt-8 text-xs leading-relaxed text-[var(--color-muted)]">
            No resume yet?{' '}
            <button type="button" className={textButton} disabled={busy} onClick={() => void read(true)}>
              {step === 'saving' ? 'Setting up…' : 'Start from a blank one'}
            </button>
            {' '}and write it in Profile.
          </p>
        </aside>
      </div>
    </Shell>
  )
}

function Shell({ title, lead, children }: { title: string; lead: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl space-y-8 py-6 sm:py-10">
      <header className="max-w-2xl">
        <h1 className="text-balance text-2xl font-semibold tracking-tight sm:text-[28px] sm:leading-tight">{title}</h1>
        <p className="mt-2.5 text-[15px] leading-relaxed text-[var(--color-muted)]">{lead}</p>
      </header>
      {children}
    </div>
  )
}

function Stage({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="relative pl-8">
      <span className="absolute top-0 left-0 grid size-5 place-items-center rounded-full border border-[var(--color-border-strong)] bg-[var(--color-bg)] text-xs font-semibold text-[var(--color-muted)] tnum" aria-hidden>{n}</span>
      <p className="text-[13px] font-semibold leading-tight">{title}</p>
      <p className="mt-1 text-[13px] leading-relaxed text-[var(--color-muted)]">{children}</p>
    </li>
  )
}

function NextLink({ href, title, children }: { href: string; title: string; children: ReactNode }) {
  return (
    <li>
      <Link href={href} className="group flex items-start gap-3 py-3.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]">
        <span className="flex-1">
          <span className="block text-sm font-semibold group-hover:text-[var(--color-accent)]">{title}</span>
          <span className="mt-0.5 block text-[13px] leading-relaxed text-[var(--color-muted)]">{children}</span>
        </span>
        <ArrowRight className="mt-0.5 size-4 shrink-0 text-[var(--color-faint)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--color-accent)] motion-reduce:transition-none" aria-hidden />
      </Link>
    </li>
  )
}

type Entry = Record<string, unknown>

/** The imported resume as plain reading, so the user can check it without knowing YAML. */
function ResumePreview({ yaml }: { yaml: string }) {
  const cv = (parse(yaml) as { cv?: Entry }).cv ?? {}
  const sections = (cv.sections ?? {}) as Record<string, unknown[]>
  const contact = [cv.headline, cv.email, cv.phone, cv.website].filter((value): value is string => typeof value === 'string')
  return (
    <article className="sheet max-h-[min(30rem,60vh)] space-y-5 overflow-y-auto p-5 text-sm sm:p-6">
      <header>
        <p className="text-base font-semibold">{String(cv.name ?? '')}</p>
        {contact.length ? <p className="mt-0.5 text-xs text-[var(--color-muted)]">{contact.join(' · ')}</p> : null}
      </header>
      {Object.entries(sections).map(([title, items]) => (
        <section key={title}>
          <h3 className="border-b border-[var(--color-border)] pb-1 text-[13px] font-semibold text-[var(--color-muted)]">{title}</h3>
          <ul className="mt-2 space-y-2.5">
            {items.map((item, index) => <li key={index}><PreviewEntry item={item} /></li>)}
          </ul>
        </section>
      ))}
    </article>
  )
}

function PreviewEntry({ item }: { item: unknown }) {
  if (typeof item === 'string') return <p className="max-w-prose leading-relaxed">{item}</p>
  const entry = item as Entry
  if (typeof entry.bullet === 'string') return <p className="leading-relaxed">{entry.bullet}</p>
  if (typeof entry.label === 'string') return <p><span className="font-medium">{entry.label}:</span> {String(entry.details ?? '')}</p>
  const title = [entry.position ?? entry.degree ?? entry.name, entry.company ?? entry.area].filter(Boolean).join(', ')
  const place = entry.institution ? String(entry.institution) : null
  const when = entry.date ?? [entry.start_date, entry.end_date].filter(Boolean).join(' to ')
  const highlights = Array.isArray(entry.highlights) ? entry.highlights as string[] : []
  return (
    <div>
      <p className="flex flex-wrap justify-between gap-x-3">
        <span className="font-medium">{title}{place ? <span className="font-normal text-[var(--color-muted)]">, {place}</span> : null}</span>
        {when ? <span className="text-xs text-[var(--color-faint)] tnum">{String(when)}</span> : null}
      </p>
      {highlights.length ? (
        <ul className="mt-1 max-w-prose list-disc space-y-0.5 pl-5 text-[13px] leading-relaxed text-[var(--color-muted)] marker:text-[var(--color-faint)]">
          {highlights.map((line, index) => <li key={index}>{line.replace(/\*\*/g, '')}</li>)}
        </ul>
      ) : null}
    </div>
  )
}

function count(n: number, noun: string) {
  return `${n} ${noun}${n === 1 ? '' : 's'}`
}

function clock(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

const textButton = 'inline-flex cursor-pointer items-center gap-1.5 rounded text-xs font-medium text-[var(--color-accent)] underline-offset-4 transition-colors hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:cursor-not-allowed disabled:text-[var(--color-faint)] disabled:no-underline'
const primaryButton = 'inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-lg bg-[var(--color-accent)] px-4 text-sm font-semibold text-[var(--color-on-solid)] shadow-[0_1px_2px_oklch(0_0_0/0.15)] transition-[filter,box-shadow] hover:brightness-110 hover:shadow-[0_2px_6px_oklch(0_0_0/0.18)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:cursor-not-allowed disabled:bg-[var(--color-surface-2)] disabled:text-[var(--color-faint)] disabled:shadow-none disabled:hover:brightness-100 disabled:aria-busy:cursor-progress disabled:aria-busy:bg-[var(--color-accent)] disabled:aria-busy:text-[var(--color-on-solid)]'
const secondaryButton = 'inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-4 text-sm font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-40'
