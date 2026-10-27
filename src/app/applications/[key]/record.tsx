'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Copy, ExternalLink, FileText, MessageSquareText, NotebookText, Wrench, X } from 'lucide-react'
import type { Application } from '@/lib/applications'
import type { ApplicationRecord } from '@/lib/applicationRecord'
import type { JdAnalysis } from '@/lib/tailoring/jd'
import type { ApplicationWorkspace } from '@/lib/workspaces'
import { ANSWERS_FILE, parseAnswers, type ApplicationAnswers } from '@/lib/applicationAnswers'
import { isAnswered, toApplicationAnswers } from '@/lib/formAnswers'
import { Card } from '@/components/ui/primitives'
import { ErrorNotice } from '@/components/ErrorNotice'
import { cn } from '@/lib/utils'
import { PostingDocument, Requirements, When, type Requirement } from './job'


/** Copy with a small toast. */
function useCopy() {
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  function flash(message: string) {
    setNotice(message)
    window.setTimeout(() => setNotice((current) => current === message ? null : current), 2200)
  }
  async function copy(text: string, what: string) {
    try { await navigator.clipboard.writeText(text); flash(`${what} copied`) } catch { setError('The clipboard is not available in this browser.') }
  }
  const feedback = <>
    {error ? <Card className="overflow-hidden border-[var(--color-bad-soft)]"><ErrorNotice error={error} onDismiss={() => setError(null)} /></Card> : null}
    {notice ? <p role="status" className="anim-rise fixed bottom-5 right-5 z-50 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs text-[var(--color-accent)] shadow-lg">{notice}</p> : null}
  </>
  return { copy, feedback }
}

const tile = 'group flex w-full items-center gap-3 rounded-lg border border-[var(--color-border)] px-3 py-2.5 text-left transition-colors hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]'

function TileIcon({ muted, children }: { muted?: boolean; children: ReactNode }) {
  return <span aria-hidden="true" className={cn('grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--color-surface-2)]', muted ? 'text-[var(--color-muted)]' : 'text-[var(--color-text)]')}>{children}</span>
}

function TileText({ title, meta }: { title: string; meta: string }) {
  return <span className="min-w-0"><span className="block truncate text-sm font-medium">{title}</span><span className="block truncate text-xs text-[var(--color-muted)]">{meta}</span></span>
}

/** What a reader panel shows: the parsed form answers, or a note's plain text. */
type Reading = { title: string; answers: ApplicationAnswers } | { title: string; text: string }

/**
 * The application once it is out, on one page. The application packet sits
 * right under the progress track: everything that went with it (the PDFs, the
 * form answers) and any notes, each one click away. Below, the job as it was saved on the left,
 * typeset for reading, and what it asks for on the right, one card per
 * requirement marked by how your resume stands against it.
 */
export function SentApplication({ app, record, workspace, analysis, sentAt, onPreparation }: {
  app: Application
  record: ApplicationRecord
  workspace: ApplicationWorkspace
  analysis: JdAnalysis | null
  sentAt: string | null
  onPreparation: () => void
}) {
  const { copy, feedback } = useCopy()
  const [reading, setReading] = useState<Reading | null>(null)
  const base = `/api/applications/${encodeURIComponent(app.key)}`
  const fit = workspace.fit.report
  // The fit report is the requirements with a verdict on each; without one, the posting's own list.
  const rows: Requirement[] = fit?.requirements ?? analysis?.requirements.map((row) => ({ requirement: row.text, weight: row.weight, rank: row.rank, classification: null, evidence: [] })) ?? []

  const pdfs = (['pdf', 'letterPdf'] as const).flatMap((key) => {
    const file = record.files.find((entry) => entry.key === key && entry.name.endsWith('.pdf'))
    return file ? [{ key, file, label: key === 'pdf' ? 'Resume' : 'Cover letter' }] : []
  })
  const answersFile = record.files.find((file) => file.name === ANSWERS_FILE && file.text?.trim())
  // Answers kept in the app win; older applications only have the markdown file.
  const answers = useMemo(() => workspace.formAnswers?.some(isAnswered) ? toApplicationAnswers(workspace.formAnswers) : answersFile?.text ? parseAnswers(answersFile.text) : null, [workspace.formAnswers, answersFile])
  // Other readable notes in the folder. Tailoring notes are the fit report again, so they stay with the preparation tools.
  const notes = record.files.filter((file) => file.text?.trim() && file.name !== ANSWERS_FILE && file.name !== 'tailoring-notes.md')

  return <div className="space-y-5">
    {feedback}
    <section aria-labelledby="packet-title" className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <header className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id="packet-title" className="text-base font-semibold tracking-tight">Application packet</h2>
        <p className="text-sm text-[var(--color-muted)]">{sentAt ? <>Sent <When iso={sentAt} /></> : 'What went with this application'}</p>
        <button type="button" onClick={onPreparation} className="ml-auto inline-flex items-center gap-1.5 text-xs text-[var(--color-muted)] hover:text-[var(--color-accent)]" title="The fit analysis and resume you prepared this application with"><Wrench size={13} aria-hidden="true" />Preparation tools</button>
      </header>
      {pdfs.length || answers?.answers.length || notes.length ? <ul className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(min(100%,15rem),1fr))]">
        {pdfs.map(({ key, file, label }) => <li key={key}><a href={`${base}/file/${encodeURIComponent(file.name)}`} target="_blank" rel="noreferrer" className={tile}>
          <TileIcon><FileText size={17} /></TileIcon>
          <TileText title={label} meta={`PDF · ${Math.max(1, Math.round(file.size / 1024))} KB`} />
          <ExternalLink size={14} aria-hidden="true" className="ml-auto shrink-0 text-[var(--color-faint)] group-hover:text-[var(--color-accent)]" />
        </a></li>)}
        {answers?.answers.length ? <li><button type="button" onClick={() => setReading({ title: 'Form answers', answers })} className={tile}>
          <TileIcon><MessageSquareText size={17} /></TileIcon>
          <TileText title="Form answers" meta={`${answers.answers.length} question${answers.answers.length === 1 ? '' : 's'} answered`} />
        </button></li> : null}
        {notes.map((file) => <li key={file.name}><button type="button" onClick={() => setReading({ title: noteTitle(file.name), text: file.text ?? '' })} className={tile}>
          <TileIcon muted><NotebookText size={17} /></TileIcon>
          <TileText title={noteTitle(file.name)} meta="Your note, not sent" />
        </button></li>)}
      </ul> : <p className="text-sm text-[var(--color-muted)]">Nothing was saved with this application.</p>}
    </section>

    <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,11fr)_minmax(0,9fr)]">
      <div className="mx-auto min-w-0 w-full max-w-[48rem] xl:mx-0 xl:max-w-none">
        <PostingDocument appKey={app.key} posting={record.posting} keywords={analysis?.keywords ?? []} hasJd={!!app.folder?.has.jd} onCopy={copy} />
      </div>
      {rows.length ? <Requirements rows={rows} fit={fit} /> : null}
    </div>

    <Reader reading={reading} onClose={() => setReading(null)} onCopy={copy} />
  </div>
}

/** A panel from the right edge for reading the form answers or a note beside the page, without leaving it. */
function Reader({ reading, onClose, onCopy }: { reading: Reading | null; onClose: () => void; onCopy: (text: string, what: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (reading && !dialog.current?.open) dialog.current?.showModal()
    if (!reading && dialog.current?.open) dialog.current.close()
  }, [reading])

  return <dialog ref={dialog} onClose={onClose} onClick={(event) => { if (event.target === dialog.current) onClose() }} aria-labelledby="reader-title" className="fixed inset-y-0 right-0 m-0 ml-auto h-full max-h-none w-[min(42rem,100vw)] max-w-none border-l border-[var(--color-border)] bg-[var(--color-surface)] p-0 text-[var(--color-text)] shadow-2xl backdrop:bg-black/30">
    {reading ? <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-[var(--color-border)] px-6 py-4">
        <h2 id="reader-title" className="min-w-0 flex-1 truncate text-base font-semibold tracking-tight">{reading.title}</h2>
        {'text' in reading ? <button type="button" onClick={() => onCopy(reading.text, reading.title)} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--color-border)] px-2.5 text-xs text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"><Copy size={13} aria-hidden="true" />Copy</button> : null}
        <button type="button" onClick={onClose} aria-label="Close" className="grid size-8 place-items-center rounded-lg text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"><X size={16} aria-hidden="true" /></button>
      </header>
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {'answers' in reading ? <>
          {reading.answers.intro ? <p className="mb-6 text-sm text-[var(--color-muted)]">{reading.answers.intro}</p> : null}
          <div className="space-y-8">
            {reading.answers.answers.map((item) => <section key={item.question}>
              <div className="flex items-start gap-3">
                <h3 className="min-w-0 flex-1 text-[15px] font-semibold leading-snug">{item.question}</h3>
                <button type="button" onClick={() => onCopy(item.answer, 'Answer')} aria-label={`Copy the answer to: ${item.question}`} title="Copy the answer" className="grid size-7 shrink-0 place-items-center rounded-md text-[var(--color-faint)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"><Copy size={14} aria-hidden="true" /></button>
              </div>
              <div className="mt-3 space-y-3 text-[15px] leading-[1.7]">
                {item.answer.split('\n\n').map((paragraph, index) => <p key={index}>{paragraph}</p>)}
              </div>
              {item.notes.map((note, index) => <p key={index} className="mt-3 rounded-md bg-[var(--color-surface-2)] px-3 py-2 text-xs leading-relaxed text-[var(--color-muted)]">{note}</p>)}
            </section>)}
          </div>
        </> : <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">{reading.text}</pre>}
      </div>
    </div> : null}
  </dialog>
}

function noteTitle(name: string): string {
  const known: Record<string, string> = {
    'application-preparation.md': 'Application preparation',
    'cover-letter-draft.md': 'Cover letter draft',
    'summary.md': 'Summary',
  }
  return known[name] ?? name.replace(/\.(md|txt)$/i, '').replace(/[-_]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}
