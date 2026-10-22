'use client'

import Link from 'next/link'
import { useRef, useState, type DragEvent } from 'react'
import { parse } from 'yaml'
import { ArrowRight, BookOpen, FileText, FileUp, Scissors, Send, Upload } from 'lucide-react'
import { ErrorNotice } from '@/components/ErrorNotice'
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

const KINDS = [
  {
    icon: BookOpen,
    name: 'Master resume',
    text: 'Everything you have done, at any length. It is never sent: Onward picks from it when it tailors a CV, so the more it holds, the better the fit.',
  },
  {
    icon: FileText,
    name: 'General resume',
    text: 'Your ready-to-send resume, ideally one page. Every tailored CV starts from it, and you can attach it as it is.',
  },
  {
    icon: Scissors,
    name: 'Tailored CV',
    text: 'One per job, cut from the two above to match the posting. You check it before you send it.',
  },
]

const LANGUAGES: Record<ImportLang, string> = { en: 'English', fr: 'French' }

export function WelcomeFlow({ firstName }: { firstName: string }) {
  const [step, setStep] = useState<Step>('input')
  const [file, setFile] = useState<File | null>(null)
  const [pasting, setPasting] = useState(false)
  const [text, setText] = useState('')
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [imported, setImported] = useState<Imported | null>(null)
  const [saved, setSaved] = useState<Saved | null>(null)
  const controller = useRef<AbortController | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

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
      setStep(imported ? 'review' : 'input')
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
    choose(event.dataTransfer.files[0])
  }

  if (step === 'done' && imported) {
    const general = `/profile?src=general-${imported.language}`
    const pages = saved?.pdf.pages ?? null
    return (
      <Shell title="Your resumes are ready" lead={imported.summary
        ? 'Your master and general resumes now hold your resume, word for word. Here is how to make the most of them.'
        : 'Your master and general resumes are set up with your name. Write them in Profile, then come back to add a job.'}>
        {saved && !saved.pdf.updated ? (
          <p className="rounded-lg bg-[var(--color-warn-soft)] px-3.5 py-2.5 text-sm text-[var(--color-warn)]">
            Saved, but the PDF could not be made yet: {saved.pdf.reason}
          </p>
        ) : null}
        <ol className="grid gap-3">
          <NextStep icon={FileText} title="Check your general resume" href={general} action="Open in Profile">
            {pages && pages > 1
              ? `It runs to ${pages} pages. Trim it to the one page you would send, and leave everything in the master.`
              : 'Make sure it reads as the resume you would send today. Edit it in Profile with the AI assistant or by hand.'}
          </NextStep>
          <NextStep icon={BookOpen} title="Grow your master" href={`/profile?src=master-${imported.language}`} action="Open the master">
            Add the projects, results and skills that never fit on one page. Onward only ever uses what is written there.
          </NextStep>
          <NextStep icon={Send} title="Add your first job" href="/new" action="New application" primary>
            Paste a posting. Onward reads it, checks your fit, and tailors a CV from your resumes.
          </NextStep>
        </ol>
        <p className="text-xs text-[var(--color-faint)]">
          Applying in {imported.language === 'en' ? 'French' : 'English'} too? In Profile, open the {imported.language === 'en' ? 'FR' : 'EN'} version of each resume and ask the assistant to translate it.
        </p>
      </Shell>
    )
  }

  if (step === 'review' || (step === 'saving' && imported?.summary)) {
    const summary = imported!.summary!
    return (
      <Shell title="Here is what Onward found" lead="Every line is copied from your resume as it was written. Check that nothing is missing, then save it as your master and general resumes.">
        <div className="flex flex-wrap gap-1.5">
          <Badge tone="accent">{LANGUAGES[summary.language]}</Badge>
          <Badge>{count(summary.roles, 'role')} · {count(summary.bullets, 'bullet')}</Badge>
          {summary.education ? <Badge>{count(summary.education, 'degree')}</Badge> : null}
          {summary.projects ? <Badge>{count(summary.projects, 'project')}</Badge> : null}
          {summary.skills ? <Badge>{count(summary.skills, 'skill group')}</Badge> : null}
          {summary.other.map((title) => <Badge key={title}>{title}</Badge>)}
        </div>
        <ResumePreview yaml={imported!.yaml} />
        {error ? <ErrorNotice error={error} className="rounded-lg" /> : null}
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={primaryButton} disabled={step === 'saving'} aria-busy={step === 'saving'} onClick={() => void save(imported!)}>
            {step === 'saving' ? <Spinner className="border-[var(--color-on-solid)]/30 border-t-[var(--color-on-solid)]" /> : null}
            {step === 'saving' ? 'Saving and making the PDFs…' : 'Save as my resumes'}
          </button>
          <button type="button" className={secondaryButton} disabled={step === 'saving'} onClick={() => { setImported(null); setStep('input') }}>
            Use a different resume
          </button>
        </div>
      </Shell>
    )
  }

  const busy = step === 'reading' || step === 'saving'
  return (
    <Shell
      title={firstName ? `Welcome, ${firstName}. Let's start with your resume.` : "Let's start with your resume."}
      lead="Onward works from your own resume and never invents experience. Give it the resume you have now, and it becomes the starting point for everything else."
    >
      <ul className="grid gap-3 sm:grid-cols-3">
        {KINDS.map(({ icon: Icon, name, text: body }) => (
          <li key={name} className="sheet p-4">
            <Icon className="size-4 text-[var(--color-accent)]" aria-hidden />
            <p className="mt-2 text-sm font-semibold">{name}</p>
            <p className="mt-1 text-[13px] leading-relaxed text-[var(--color-muted)]">{body}</p>
          </li>
        ))}
      </ul>

      <section aria-labelledby="resume-input" className="rounded-xl bg-[var(--color-accent-soft)] p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="resume-input" className="text-sm font-semibold">Your current resume</h2>
          <button type="button" className={textButton} disabled={busy} onClick={() => { setPasting(!pasting); setError(null) }}>
            {pasting ? 'Choose a file instead' : 'Paste the text instead'}
          </button>
        </div>
        <p className="mt-0.5 text-xs text-[var(--color-muted)]">It becomes both your master and your general resume. A PDF works best; LinkedIn&apos;s &quot;Save to PDF&quot; works too.</p>

        {pasting ? (
          <textarea
            aria-label="Resume text"
            autoFocus
            value={text}
            disabled={busy}
            onChange={(event) => setText(event.target.value)}
            rows={12}
            placeholder="Paste your whole resume here"
            className="mt-3 w-full resize-y rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-3.5 text-sm leading-relaxed text-[var(--color-text)] outline-none focus:border-[var(--color-accent)] disabled:opacity-60"
          />
        ) : (
          <div
            onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={drop}
            className={cn(
              'mt-3 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed bg-[var(--color-surface)] px-4 py-8 text-center transition-colors',
              dragging ? 'border-[var(--color-accent)]' : 'border-[var(--color-border-strong)]',
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
            <p className="text-xs text-[var(--color-faint)]">PDF or plain text. Save a Word resume as PDF first.</p>
          </div>
        )}

        {error ? <ErrorNotice error={error} className="mt-3 rounded-lg" /> : null}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" className={primaryButton} disabled={!ready || busy} aria-busy={step === 'reading'} onClick={() => void read()}>
            {step === 'reading' ? <Spinner className="border-[var(--color-on-solid)]/30 border-t-[var(--color-on-solid)]" /> : null}
            {step === 'reading' ? 'Reading your resume…' : 'Read my resume'}
            {step === 'reading' ? null : <ArrowRight className="size-4" aria-hidden />}
          </button>
          {step === 'reading' ? (
            <>
              <span className="text-xs text-[var(--color-muted)]">Your AI tool is sorting it into sections. This usually takes a minute or two.</span>
              <button type="button" className={textButton} onClick={() => controller.current?.abort()}>Cancel</button>
            </>
          ) : null}
        </div>
      </section>

      <p className="text-xs text-[var(--color-faint)]">
        No resume yet?{' '}
        <button type="button" className={textButton} disabled={busy} onClick={() => void read(true)}>
          {step === 'saving' ? 'Setting up…' : 'Start from a blank one'}
        </button>
        {' '}and write it in Profile.
      </p>
    </Shell>
  )
}

function Shell({ title, lead, children }: { title: string; lead: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl space-y-5 py-4 sm:py-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-accent)]">Getting started</p>
        <h1 className="mt-1.5 text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--color-muted)]">{lead}</p>
      </header>
      {children}
    </div>
  )
}

function NextStep({ icon: Icon, title, href, action, primary, children }: {
  icon: typeof FileText
  title: string
  href: string
  action: string
  primary?: boolean
  children: React.ReactNode
}) {
  return (
    <li className="sheet flex flex-wrap items-center gap-4 p-4">
      <Icon className="size-5 shrink-0 text-[var(--color-accent)]" aria-hidden />
      <div className="min-w-[14rem] flex-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-0.5 text-[13px] leading-relaxed text-[var(--color-muted)]">{children}</p>
      </div>
      <Link href={href} className={primary ? primaryButton : secondaryButton}>{action}</Link>
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
    <article className="sheet max-h-[28rem] space-y-4 overflow-y-auto p-5 text-sm">
      <header>
        <p className="text-base font-semibold">{String(cv.name ?? '')}</p>
        {contact.length ? <p className="text-xs text-[var(--color-muted)]">{contact.join(' · ')}</p> : null}
      </header>
      {Object.entries(sections).map(([title, items]) => (
        <section key={title}>
          <h3 className="border-b border-[var(--color-border)] pb-1 text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">{title}</h3>
          <ul className="mt-2 space-y-2.5">
            {items.map((item, index) => <li key={index}><PreviewEntry item={item} /></li>)}
          </ul>
        </section>
      ))}
    </article>
  )
}

function PreviewEntry({ item }: { item: unknown }) {
  if (typeof item === 'string') return <p className="leading-relaxed">{item}</p>
  const entry = item as Entry
  if (typeof entry.bullet === 'string') return <p className="leading-relaxed">• {entry.bullet}</p>
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
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[13px] leading-relaxed text-[var(--color-muted)]">
          {highlights.map((line, index) => <li key={index}>{line.replace(/\*\*/g, '')}</li>)}
        </ul>
      ) : null}
    </div>
  )
}

function count(n: number, noun: string) {
  return `${n} ${noun}${n === 1 ? '' : 's'}`
}

const textButton = 'inline-flex cursor-pointer items-center gap-1.5 rounded text-xs font-medium text-[var(--color-accent)] underline-offset-4 transition-colors hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:cursor-not-allowed disabled:text-[var(--color-faint)] disabled:no-underline'
const primaryButton = 'inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-lg bg-[var(--color-accent)] px-4 text-sm font-semibold text-[var(--color-on-solid)] shadow-[0_1px_2px_oklch(0_0_0/0.15)] transition-[filter,box-shadow] hover:brightness-110 hover:shadow-[0_2px_6px_oklch(0_0_0/0.18)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:cursor-not-allowed disabled:bg-[var(--color-surface-2)] disabled:text-[var(--color-faint)] disabled:shadow-none disabled:hover:brightness-100 disabled:aria-busy:cursor-progress disabled:aria-busy:bg-[var(--color-accent)] disabled:aria-busy:text-[var(--color-on-solid)]'
const secondaryButton = 'inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-4 text-sm font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-40'
