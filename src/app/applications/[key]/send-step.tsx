'use client'

import { useState, type ReactNode } from 'react'
import { AlertTriangle, Check as CheckIcon, ChevronRight, ExternalLink, FileText, Send } from 'lucide-react'
import type { Application } from '@/lib/applications'
import type { PostingContact } from '@/lib/postingContact'
import { postingHost } from '@/lib/postingSource'
import { isAnswered, type FormAnswer } from '@/lib/formAnswers'
import { ErrorNotice } from '@/components/ErrorNotice'
import { Menu, MenuItem } from '@/components/ui/Menu'
import { Spinner } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'
import type { DocumentKind } from './documents-step'

/** What the Send step checks before "I sent it"; computed by the page, which owns the draft. */
export interface SendChecks {
  /** A finalized PDF exists. */
  resumeFinalized: boolean
  /** The finalized PDF matches the current draft. */
  resumeCurrent: boolean
  /** An AI edit to the resume is still waiting for review. */
  pendingEdit: boolean
  /** The current draft does not render. */
  invalidDraft: boolean
}

const ring = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]'
const small = `inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2.5 text-xs font-medium transition-colors hover:bg-[var(--color-surface-2)] ${ring}`
const go = `group inline-flex min-h-8 cursor-pointer items-center gap-1 rounded text-xs font-medium text-[var(--color-accent)] underline-offset-4 hover:underline ${ring}`

/**
 * Step 4: the packet as it stands, then record that it went out. Nothing
 * here blocks: a missing piece is marked, with a link to the step that fixes it.
 */
export function SendStep({ app, status, pdfName, letterPdf, letterDrafted, letterAsked, answers, contact, postingUrl, checks, onResume, onDocument, onLocatePdf, onSent }: {
  app: Application
  status: string
  pdfName: string | null
  letterPdf: boolean
  letterDrafted: boolean
  letterAsked: boolean
  answers: FormAnswer[]
  contact: PostingContact
  postingUrl: string | null
  checks: SendChecks
  onResume: () => void
  onDocument: (doc: DocumentKind) => void
  onLocatePdf: (reveal: boolean) => void
  onSent: (status: string, origin?: { x: number; y: number }) => void
}) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const base = `/api/applications/${encodeURIComponent(app.key)}`
  const host = postingUrl ? postingHost(postingUrl) : null
  const answered = answers.filter(isAnswered).length
  const attention = (checks.resumeFinalized ? 0 : 1) + (checks.resumeFinalized && !checks.resumeCurrent ? 1 : 0) + (checks.pendingEdit ? 1 : 0) + (checks.invalidDraft ? 1 : 0)
    + (letterAsked && !letterPdf ? 1 : 0) + (answers.length && answered < answers.length ? 1 : 0)

  return <section aria-labelledby="send-title" className="sheet anim-settle mx-auto max-w-2xl overflow-hidden">
    <header className="border-b border-[var(--color-border)] px-6 py-4">
      <h2 id="send-title" className="text-[17px]">Send it</h2>
      <p className="mt-1 text-sm leading-relaxed text-[var(--color-muted)]">Check the packet, send it where the posting says, then record it here.</p>
    </header>
    <ul className="divide-y divide-[var(--color-border)]" aria-label="Your packet">
      {!checks.resumeFinalized ? <Check tone="bad" title="Your resume isn’t finalized" detail="Finalizing saves the PDF you send." action={<button type="button" onClick={onResume} className={go}>Go to the Resume step<ChevronRight size={13} aria-hidden="true" className="transition-transform group-hover:translate-x-0.5" /></button>} />
        : <Check
          tone={checks.resumeCurrent ? 'ok' : 'warn'}
          title={checks.resumeCurrent ? 'Resume finalized' : 'Your resume changed since you finalized it'}
          detail={checks.resumeCurrent ? pdfName ?? undefined : `The PDF (${pdfName}) is the earlier version. Finalize again to send the latest.`}
          action={<>
            {pdfName ? <a href={`${base}/file/${encodeURIComponent(pdfName)}`} target="_blank" rel="noreferrer" className={small}><FileText size={13} aria-hidden="true" /> Open PDF</a> : null}
            <Menu label="More file actions" align="left" width="w-48">
              {(close) => <>
                <MenuItem label="Show the file in Finder" onSelect={() => { close(); onLocatePdf(true) }} />
                <MenuItem label="Copy the file’s path" onSelect={() => { close(); onLocatePdf(false) }} />
              </>}
            </Menu>
            {!checks.resumeCurrent ? <button type="button" onClick={onResume} className={go}>Finalize again<ChevronRight size={13} aria-hidden="true" className="transition-transform group-hover:translate-x-0.5" /></button> : null}
          </>}
        />}
      {checks.pendingEdit ? <Check tone="warn" title="An AI resume edit is waiting for review" detail="Accept or reject it so you know which version you’re sending." action={<button type="button" onClick={onResume} className={go}>Review it<ChevronRight size={13} aria-hidden="true" /></button>} /> : null}
      {checks.invalidDraft ? <Check tone="bad" title="The current draft has errors" detail="The finalized PDF is unaffected, but fix the draft before finalizing again." action={<button type="button" onClick={onResume} className={go}>Open the draft<ChevronRight size={13} aria-hidden="true" /></button>} /> : null}
      <Check
        tone={letterPdf ? 'ok' : letterAsked ? 'warn' : 'info'}
        title={letterPdf ? 'Cover letter finalized' : letterAsked ? 'The posting asks for a cover letter' : 'No cover letter needed'}
        detail={letterPdf ? undefined : letterDrafted ? 'You have a draft that isn’t finalized yet.' : letterAsked ? undefined : 'The posting doesn’t ask for one.'}
        action={<button type="button" onClick={() => onDocument('cover-letter')} className={go}>{letterPdf ? 'Open it' : letterDrafted ? 'Continue the draft' : letterAsked ? 'Write it' : 'Write one anyway'}<ChevronRight size={13} aria-hidden="true" className="transition-transform group-hover:translate-x-0.5" /></button>}
      />
      <Check
        tone={!answers.length ? 'info' : answered === answers.length ? 'ok' : 'warn'}
        title={!answers.length ? 'No form questions saved' : answered === answers.length ? `Form questions answered (${answered})` : `${answered} of ${answers.length} form questions answered`}
        detail={!answers.length ? 'If the form asks questions, keep your answers with the application.' : undefined}
        action={<button type="button" onClick={() => onDocument('answers')} className={go}>{!answers.length ? 'Add them' : answered === answers.length ? 'Open them' : 'Finish them'}<ChevronRight size={13} aria-hidden="true" className="transition-transform group-hover:translate-x-0.5" /></button>}
      />
      <Check
        tone="info"
        title={postingUrl ? `Apply on ${host ?? 'the posting'}` : contact.email ? `Apply by email to ${contact.name ?? contact.email}` : 'Where to apply isn’t recorded'}
        detail={postingUrl || contact.email ? undefined : 'Check the posting for how to apply.'}
        action={postingUrl ? <a href={postingUrl} target="_blank" rel="noreferrer" className={small}><ExternalLink size={13} aria-hidden="true" /> Open the posting</a> : contact.email ? <button type="button" onClick={() => onDocument('email')} className={go}>Write the email<ChevronRight size={13} aria-hidden="true" /></button> : null}
      />
    </ul>
    {app.row ? <form className="space-y-3 border-t border-[var(--color-border)] bg-[var(--color-bg)] px-6 py-5" onSubmit={async (event) => {
      event.preventDefault()
      const button = (event.nativeEvent as SubmitEvent).submitter?.getBoundingClientRect()
      setBusy(true); setError(null)
      try {
        // The note is added to the tracker's notes, never replacing what is there.
        const existing = app.row?.notes?.trim() ?? ''
        const notes = note.trim() ? (existing ? `${existing} ${note.trim()}` : note.trim()) : existing
        const response = await fetch(base, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'Applied', notes }) })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error ?? 'Could not save. Please try again.')
        onSent('Applied', button ? { x: button.left + button.width / 2, y: button.top } : undefined)
      } catch (reason) { setError((reason as Error).message) } finally { setBusy(false) }
    }}>
      <label className="block space-y-1.5 text-xs"><span className="font-medium">Add a note <span className="font-normal text-[var(--color-muted)]">(optional, added to your tracker notes)</span></span>
        <textarea disabled={busy} rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Where you applied, who you contacted…" className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none placeholder:text-[var(--color-muted)] focus:border-[var(--color-accent)] disabled:opacity-60" />
      </label>
      <button disabled={busy || status === 'Applied'} className={cn('inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-[var(--color-accent)] py-2.5 text-sm font-semibold text-[var(--color-on-solid)] shadow-[0_1px_2px_oklch(0_0_0/0.15)] transition-[filter] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50', ring)}>{busy ? <><Spinner className="border-[var(--color-on-solid)]/30 border-t-[var(--color-on-solid)]" /> Saving…</> : <><Send size={15} aria-hidden="true" /> I sent it</>}</button>
      <p className="text-center text-xs text-[var(--color-muted)]">{attention ? `${attention} item${attention === 1 ? '' : 's'} above need${attention === 1 ? 's' : ''} attention. You can still record it.` : 'This moves the application to Sent. You can undo it from the ⋯ menu.'}</p>
      {error ? <ErrorNotice error={error} className="w-full rounded-md" /> : null}
    </form> : <p className="border-t border-[var(--color-border)] px-6 py-5 text-xs text-[var(--color-muted)]">This application has no tracker row, so there’s no status to record.</p>}
  </section>
}

/** One ruled line of the packet: done, needs attention, or just information. */
function Check({ tone, title, detail, action }: { tone: 'ok' | 'warn' | 'bad' | 'info'; title: string; detail?: ReactNode; action?: ReactNode }) {
  return <li className="flex items-start gap-3 px-6 py-4">
    <span className={cn('mt-0.5 grid size-5 shrink-0 place-items-center rounded-[var(--radius-md)]', tone === 'ok' ? 'bg-[var(--color-ok-soft)] text-[var(--color-ok)]' : tone === 'warn' ? 'bg-[var(--color-warn-soft)] text-[var(--color-warn)]' : tone === 'bad' ? 'bg-[var(--color-bad-soft)] text-[var(--color-bad)]' : 'bg-[var(--color-surface-2)] text-[var(--color-muted)]')} aria-hidden="true">
      {tone === 'ok' ? <CheckIcon size={12} strokeWidth={3} /> : tone === 'info' ? <span className="size-1.5 rounded-[1px] bg-current" /> : <AlertTriangle size={11} strokeWidth={2.5} />}
    </span>
    <div className="min-w-0 flex-1">
      <p className="text-[15px] font-medium leading-snug">{title}<span className="sr-only">{tone === 'ok' ? ' (done)' : tone === 'info' ? '' : ' (needs attention)'}</span></p>
      {detail ? <p className="mt-0.5 break-words text-xs leading-relaxed text-[var(--color-muted)]">{detail}</p> : null}
      {action ? <div className="mt-2 flex flex-wrap items-center gap-3">{action}</div> : null}
    </div>
  </li>
}
