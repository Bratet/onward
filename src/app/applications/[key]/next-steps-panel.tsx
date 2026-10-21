'use client'

import { useState, type ReactNode } from 'react'
import { AlertTriangle, ArrowLeft, Check as CheckIcon, ChevronRight, CircleCheck, ExternalLink, FileText, Linkedin, Lock, Mail, Send } from 'lucide-react'
import type { Application } from '@/lib/applications'
import type { CoverLetter } from '@/lib/coverLetter'
import type { PostingContact } from '@/lib/postingContact'
import type { FinalizedState } from '@/components/FinalizeStatus'
import type { OutreachDrafts, OutreachKind } from '@/lib/outreach'
import { STATUSES, statusLabel } from '@/lib/statuses'
import { Badge, Card, Spinner, statusTone } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'
import { postingHost } from '@/lib/postingSource'
import { Menu, MenuItem } from '@/components/ui/Menu'
import { LearnFromChat } from '@/components/LearnFromChat'
import { ErrorNotice } from '@/components/ErrorNotice'
import { CoverLetterTask } from './cover-letter-task'

export type NextStep = 'status' | OutreachKind

const input = 'w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm placeholder:text-[var(--color-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] disabled:opacity-60'
const secondary = 'inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] px-3 py-2 text-xs hover:bg-[var(--color-surface-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] disabled:opacity-40'
const primary = 'inline-flex items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-3 py-2 text-xs font-semibold text-[var(--color-bg)] hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:opacity-40'

const messages: Record<OutreachKind, { title: string; description: string; icon: ReactNode; placeholder: string }> = {
  'cover-letter': { title: 'Write a cover letter', description: 'Only if the application asks for one. Draft it with AI, edit it beside a live preview, and render it with your letter template.', icon: <FileText size={18} />, placeholder: 'Language, points to stress, anything the posting asks you to address…' },
  email: { title: 'Draft an application email', description: 'For applying by email. Includes a subject line.', icon: <Mail size={18} />, placeholder: 'Where you found the role (e.g. a LinkedIn post), recipient, language, first contact or reply…' },
  linkedin: { title: 'Write a LinkedIn message', description: 'A short note to a recruiter or hiring manager.', icon: <Linkedin size={18} />, placeholder: 'Who you are writing to, where you found the role, connection request or InMail…' },
}

/** What the Send step checks before "I sent it"; computed by the page, which owns the draft. */
export interface SendChecks {
  /** The finalized PDF matches the current draft. */
  resumeCurrent: boolean
  /** An AI edit to the resume is still waiting for review. */
  pendingEdit: boolean
  /** The current draft does not render. */
  invalidDraft: boolean
}

/**
 * The end of the Applying phase: write what the posting asks for, then send
 * it and record that. After sending, the same messages serve following up.
 */
export function NextStepsPanel({ sent = false, app, status, onStatusSaved, initialDrafts, initialCoverLetter, savedCoverLetter, contact, letterFinalized, step, onStep, onGoToResume, onLocatePdf, checks, postingUrl = null }: {
  app: Application
  status: string
  onStatusSaved: (status: string, origin?: { x: number; y: number }) => void
  initialDrafts: OutreachDrafts
  initialCoverLetter: CoverLetter
  contact: PostingContact
  letterFinalized: FinalizedState['letter']
  savedCoverLetter: CoverLetter | null
  step: NextStep | null
  onStep: (step: NextStep | null) => void
  onGoToResume: () => void
  onLocatePdf: (reveal: boolean) => void
  /** After applying the same tools serve following up, so the wording changes. */
  sent?: boolean
  checks?: SendChecks
  postingUrl?: string | null
}) {
  const [drafts, setDrafts] = useState(initialDrafts)
  const [savedDrafts, setSavedDrafts] = useState(initialDrafts)
  const [coverLetter, setCoverLetter] = useState(initialCoverLetter)
  const [storedLetter, setStoredLetter] = useState(savedCoverLetter)
  const letterPdf = !!app.folder?.docs.some((doc) => doc.key === 'letterPdf' && doc.name.endsWith('.pdf'))
  const base = `/api/applications/${encodeURIComponent(app.key)}`
  const pdf = app.folder?.docs.find((doc) => doc.key === 'pdf')

  if (!pdf) return <Card className="mx-auto max-w-xl">
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <span className="grid size-11 place-items-center rounded-full bg-[var(--color-surface-2)] text-[var(--color-muted)]"><Lock size={18} aria-hidden="true" /></span>
      <h2 className="text-base font-semibold">Finalize your resume first</h2>
      <p className="max-w-sm text-sm text-[var(--color-muted)]">Sending starts from a finalized resume. Once it’s ready, you can write a cover letter or message and record that you sent it.</p>
      <button type="button" onClick={onGoToResume} className={cn(primary, 'mt-2')}><ArrowLeft size={14} aria-hidden="true" /> Back to Prepare</button>
    </div>
  </Card>

  if (step) return <div className={cn('space-y-4', step !== 'cover-letter' && 'mx-auto max-w-3xl')}>
    <button type="button" onClick={() => onStep(null)} className="inline-flex items-center gap-1 text-xs text-[var(--color-accent)] hover:underline"><ArrowLeft size={14} aria-hidden="true" /> {sent ? 'All messages' : 'Back to Send'}</button>
    {step === 'status'
      ? <StatusTask app={app} base={base} status={status} onStatusSaved={onStatusSaved} />
      : step === 'cover-letter'
      ? <CoverLetterTask app={app} initialLetter={coverLetter} savedLetter={storedLetter} finalizedAtLoad={letterFinalized} onLetterSaved={(letter) => { setCoverLetter(letter); setStoredLetter(letter) }} />
      : <MessageTask key={step} kind={step} base={base} contact={contact} draft={drafts[step] ?? ''} saved={savedDrafts[step] ?? ''} onDraft={(text) => setDrafts((current) => ({ ...current, [step]: text }))} onSaved={(text) => setSavedDrafts((current) => ({ ...current, [step]: text }))} />}
  </div>

  const rows: { id: NextStep; title: string; description: string; icon: ReactNode; meta: ReactNode }[] = [
    ...(sent ? [{
      id: 'status' as const,
      title: 'Update status & notes',
      description: 'Record replies and interviews.',
      icon: <CircleCheck size={18} />,
      meta: app.row ? <Badge tone={statusTone(status)}>{statusLabel(status)}</Badge> : <Badge>No tracker row</Badge>,
    }] : []),
    ...(sent ? ['cover-letter', 'email', 'linkedin'] as const : ['email', 'linkedin'] as const).map((kind) => ({
      id: kind,
      title: sent && kind === 'email' ? 'Email' : sent && kind === 'linkedin' ? 'Message the recruiter' : kind === 'cover-letter' ? 'Cover letter' : kind === 'email' ? 'Application email' : 'LinkedIn message',
      description: sent && kind === 'email' ? `A message${contact.email ? ` to ${contact.name ?? contact.email}` : ''}, or a reply when they write back.`
        : sent && kind === 'linkedin' ? 'A friendly note to the recruiter or hiring manager.'
        : sent && kind === 'cover-letter' ? 'The letter you sent, or one for a later stage.'
        : kind === 'cover-letter' ? contact.coverLetter ? `The posting asks for ${contact.coverLetter === 'short' ? 'a short one' : 'one'}. Drafted with AI beside a live preview.` : 'Only if the application asks for one.'
        : kind === 'email' ? contact.email ? `To ${contact.name ?? contact.email}, the contact in the posting.` : 'For applying by email. Includes a subject line.'
        : 'A short note to a recruiter or hiring manager.',
      icon: messages[kind].icon,
      meta: kind === 'cover-letter'
        ? letterPdf ? <Badge tone="ok">Finalized</Badge> : coverLetter.content.trim() ? <Badge tone="ok">Draft saved</Badge> : contact.coverLetter && !sent ? <Badge tone="warn">Asked for</Badge> : <Optional />
        : (drafts[kind] ?? '') !== (savedDrafts[kind] ?? '') ? <Badge tone="warn">Unsaved changes</Badge> : drafts[kind] ? <Badge tone="ok">Draft saved</Badge> : sent ? <Optional /> : null,
    })),
  ]

  const list = <ul className="divide-y divide-[var(--color-border)] overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
    {rows.map((row) => <li key={row.id}>
      <button type="button" onClick={() => onStep(row.id)} className="group flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-[var(--color-surface-2)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-accent)]">
        <span className="shrink-0 text-[var(--color-muted)] group-hover:text-[var(--color-accent)]" aria-hidden="true">{row.icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{row.title}</span>
          <span className="mt-0.5 block text-xs leading-relaxed text-[var(--color-muted)]">{row.description}</span>
        </span>
        <span className="shrink-0">{row.meta}</span>
        <ChevronRight size={16} className="shrink-0 text-[var(--color-faint)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--color-accent)]" aria-hidden="true" />
      </button>
    </li>)}
  </ul>

  if (sent) return <div className="mx-auto max-w-3xl space-y-3">
    <div>
      <h2 className="text-base font-semibold">Keep the conversation going</h2>
      <p className="mt-1 text-xs text-[var(--color-muted)]">Drafts are saved with this application. Nothing is sent from the app.</p>
    </div>
    {list}
  </div>

  // Sending is the only required thing here, so it leads; the messages are optional extras below it.
  return <div className="mx-auto max-w-2xl space-y-8">
    <SendCard app={app} base={base} status={status} pdfName={pdf.name} letterPdf={letterPdf} letterDrafted={!!coverLetter.content.trim()} letterAsked={!!contact.coverLetter} contact={contact} postingUrl={postingUrl} checks={checks ?? { resumeCurrent: true, pendingEdit: false, invalidDraft: false }} onStep={onStep} onGoToResume={onGoToResume} onLocatePdf={onLocatePdf} onSent={onStatusSaved} />
    <section className="space-y-3" aria-labelledby="also-title">
      <div>
        <h2 id="also-title" className="text-sm font-semibold">Also prepare <span className="font-normal text-[var(--color-muted)]">(optional)</span></h2>
        <p className="mt-1 text-xs text-[var(--color-muted)]">Drafts are saved with this application. Nothing is sent from the app.</p>
      </div>
      {list}
    </section>
  </div>
}

function Optional() {
  return <span className="text-xs text-[var(--color-muted)]">Optional</span>
}

/** One line of the send checklist: ok, needs attention, or just information. */
function Check({ tone, title, detail, action }: { tone: 'ok' | 'warn' | 'bad' | 'info'; title: string; detail?: ReactNode; action?: ReactNode }) {
  return <li className="flex items-start gap-3">
    <span className={cn('mt-0.5 grid size-5 shrink-0 place-items-center rounded-full', tone === 'ok' ? 'bg-[var(--color-ok-soft)] text-[var(--color-ok)]' : tone === 'warn' ? 'bg-[var(--color-warn-soft)] text-[var(--color-warn)]' : tone === 'bad' ? 'bg-[var(--color-bad-soft)] text-[var(--color-bad)]' : 'bg-[var(--color-surface-2)] text-[var(--color-muted)]')} aria-hidden="true">
      {tone === 'ok' ? <CheckIcon size={12} strokeWidth={3} /> : tone === 'info' ? <span className="size-1.5 rounded-full bg-current" /> : <AlertTriangle size={11} strokeWidth={2.5} />}
    </span>
    <div className="min-w-0 flex-1">
      <p className="text-sm font-medium leading-snug">{title}<span className="sr-only">{tone === 'ok' ? ' (done)' : tone === 'info' ? '' : ' (needs attention)'}</span></p>
      {detail ? <p className="mt-0.5 break-words text-xs leading-relaxed text-[var(--color-muted)]">{detail}</p> : null}
      {action ? <div className="mt-2 flex flex-wrap items-center gap-2">{action}</div> : null}
    </div>
  </li>
}

function SendCard({ app, base, status, pdfName, letterPdf, letterDrafted, letterAsked, contact, postingUrl, checks, onStep, onGoToResume, onLocatePdf, onSent }: {
  app: Application
  base: string
  status: string
  pdfName: string
  letterPdf: boolean
  letterDrafted: boolean
  letterAsked: boolean
  contact: PostingContact
  postingUrl: string | null
  checks: SendChecks
  onStep: (step: NextStep) => void
  onGoToResume: () => void
  onLocatePdf: (reveal: boolean) => void
  onSent: (status: string, origin?: { x: number; y: number }) => void
}) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const small = 'inline-flex h-7 items-center gap-1.5 rounded-md border border-[var(--color-border)] px-2.5 text-xs hover:bg-[var(--color-surface-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]'
  const host = postingUrl ? postingHost(postingUrl) : null
  const attention = (checks.resumeCurrent ? 0 : 1) + (checks.pendingEdit ? 1 : 0) + (checks.invalidDraft ? 1 : 0) + (letterAsked && !letterPdf ? 1 : 0)

  return <Card>
    <div className="border-b border-[var(--color-border)] px-6 py-5">
      <h2 className="text-lg font-semibold tracking-tight">Send it</h2>
      <p className="mt-1 text-sm leading-relaxed text-[var(--color-muted)]">Check these, send your application where the posting says, then record it here.</p>
    </div>
    <ul className="space-y-5 px-6 py-5" aria-label="Before you send">
      <Check
        tone={checks.resumeCurrent ? 'ok' : 'warn'}
        title={checks.resumeCurrent ? 'Resume finalized' : 'Your draft changed since you finalized'}
        detail={checks.resumeCurrent ? pdfName : `The PDF (${pdfName}) is the earlier version. Finalize again to send the latest.`}
        action={<>
          <a href={`${base}/file/${encodeURIComponent(pdfName)}`} target="_blank" rel="noreferrer" className={small}><FileText size={13} aria-hidden="true" /> Open PDF</a>
          <Menu label="More file actions" align="left" width="w-48">
            {(close) => <>
              <MenuItem label="Show the file in Finder" onSelect={() => { close(); onLocatePdf(true) }} />
              <MenuItem label="Copy the file’s path" onSelect={() => { close(); onLocatePdf(false) }} />
            </>}
          </Menu>
          {!checks.resumeCurrent ? <button type="button" onClick={onGoToResume} className={small}>Finalize again</button> : null}
        </>}
      />
      {checks.pendingEdit ? <Check tone="warn" title="An AI resume edit is waiting for review" detail="Accept or reject it so you know which version you’re sending." action={<button type="button" onClick={onGoToResume} className={small}>Review it</button>} /> : null}
      {checks.invalidDraft ? <Check tone="bad" title="The current draft has errors" detail="The finalized PDF is unaffected, but fix the draft before finalizing again." action={<button type="button" onClick={onGoToResume} className={small}>Open the draft</button>} /> : null}
      <Check
        tone={letterPdf ? 'ok' : letterAsked ? 'warn' : 'info'}
        title={letterPdf ? 'Cover letter finalized' : letterAsked ? 'The posting asks for a cover letter' : 'No cover letter needed'}
        detail={letterPdf ? undefined : letterDrafted ? 'You have a saved draft that isn’t finalized yet.' : letterAsked ? undefined : 'The posting doesn’t ask for one. You can still write one.'}
        action={<button type="button" onClick={() => onStep('cover-letter')} className={small}>{letterPdf ? 'Open it' : letterDrafted ? 'Continue the draft' : letterAsked ? 'Write it' : 'Write one anyway'}</button>}
      />
      <Check
        tone="info"
        title={postingUrl ? `Apply on ${host ?? 'the posting'}` : contact.email ? `Apply by email to ${contact.name ?? contact.email}` : 'Where to apply isn’t recorded'}
        detail={postingUrl || contact.email ? undefined : 'Check the posting for how to apply.'}
        action={postingUrl ? <a href={postingUrl} target="_blank" rel="noreferrer" className={small}><ExternalLink size={13} aria-hidden="true" /> Open the posting</a> : contact.email ? <button type="button" onClick={() => onStep('email')} className={small}><Mail size={13} aria-hidden="true" /> Write the email</button> : null}
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
        await request(base, 'PATCH', { status: 'Applied', notes })
        onSent('Applied', button ? { x: button.left + button.width / 2, y: button.top } : undefined)
      } catch (reason) { setError((reason as Error).message) } finally { setBusy(false) }
    }}>
      <label className="block space-y-1.5 text-xs"><span className="font-medium">Add a note <span className="font-normal text-[var(--color-muted)]">(optional, added to your tracker notes)</span></span><textarea disabled={busy} className={input} rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Where you applied, who you contacted…" /></label>
      <button disabled={busy || status === 'Applied'} className={cn(primary, 'w-full justify-center py-2.5 text-sm')}>{busy ? <><Spinner /> Saving…</> : <><Send size={15} aria-hidden="true" /> I sent it</>}</button>
      <p className="text-center text-xs text-[var(--color-muted)]">{attention ? `${attention} item${attention === 1 ? '' : 's'} above need${attention === 1 ? 's' : ''} attention. You can still record it.` : 'This moves the application to Sent. You can undo it from the status menu.'}</p>
      {error ? <ErrorNotice error={error} className="w-full rounded-md" /> : null}
    </form> : <p className="border-t border-[var(--color-border)] px-6 py-5 text-xs text-[var(--color-muted)]">This application has no tracker row, so there’s no status to record.</p>}
  </Card>
}

async function request(url: string, method: string, body: object) {
  const response = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error ?? 'Could not save. Please try again.')
  return data
}

function TaskHeader({ icon, title, hint }: { icon: ReactNode; title: string; hint: string }) {
  return <div className="flex items-start gap-3 border-b border-[var(--color-border)] px-5 py-4">
    <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-[var(--color-accent-soft)] text-[var(--color-accent)]" aria-hidden="true">{icon}</span>
    <div><h2 className="text-base font-semibold">{title}</h2><p className="mt-0.5 text-xs leading-relaxed text-[var(--color-muted)]">{hint}</p></div>
  </div>
}

function Feedback({ error, notice }: { error: string | null; notice: string }) {
  return <>
    {error ? <ErrorNotice error={error} className="w-full rounded-md" /> : null}
    <p role="status" className="text-xs text-[var(--color-ok)]">{notice}</p>
  </>
}

function StatusTask({ app, base, status, onStatusSaved }: { app: Application; base: string; status: string; onStatusSaved: (status: string) => void }) {
  const [value, setValue] = useState(status === 'Applied' ? status : app.row ? 'Applied' : status)
  const [notes, setNotes] = useState(app.row?.notes ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState('')

  if (!app.row) return <Card>
    <TaskHeader icon={<Send size={18} />} title="Track this application" hint="This application has no tracker row, so there is no status to update." />
    <p className="px-5 py-4 text-sm text-[var(--color-muted)]">You can still draft a cover letter, email, or LinkedIn message from the other next steps.</p>
  </Card>

  return <Card>
    <TaskHeader icon={<Send size={18} />} title={status === 'Applied' ? 'Update status & notes' : 'Mark as sent'} hint="Choose Sent once you have sent the application. Notes are saved to your tracker." />
    <form className="space-y-4 p-5" onSubmit={async (event) => {
      event.preventDefault()
      setBusy(true); setError(null); setNotice('')
      try {
        await request(base, 'PATCH', { status: value, notes })
        onStatusSaved(value)
        setNotice(value === 'Applied' && status !== 'Applied' ? 'Marked as sent. Good luck!' : 'Status and notes saved.')
      } catch (reason) { setError((reason as Error).message) } finally { setBusy(false) }
    }}>
      <fieldset className="space-y-2">
        <legend className="text-sm">Status</legend>
        <div className="flex flex-wrap gap-2">
          {STATUSES.filter((option) => option !== 'SKIP').map((option) => <label key={option} className={cn('cursor-pointer rounded-md border px-3 py-1.5 text-xs has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--color-accent)]', value === option ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] font-medium' : 'border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]')}>
            <input type="radio" name="status" value={option} checked={value === option} disabled={busy} onChange={() => { setValue(option); setNotice('') }} className="sr-only" />{statusLabel(option)}
          </label>)}
          {!STATUSES.includes(value as never) ? <span className="rounded-md border border-[var(--color-accent)] px-3 py-1.5 text-xs">{value}</span> : null}
        </div>
      </fieldset>
      <label className="block space-y-2 text-sm"><span>Notes</span><textarea disabled={busy} className={input} rows={4} value={notes} onChange={(event) => { setNotes(event.target.value); setNotice('') }} placeholder="Where you applied, contact person…" /></label>
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={busy} className={primary}>{busy ? <><Spinner /> Saving…</> : value === 'Applied' && status !== 'Applied' ? 'Mark as sent' : 'Save status and notes'}</button>
        <Feedback error={error} notice={notice} />
      </div>
    </form>
  </Card>
}

function MessageTask({ kind, base, contact, draft, saved, onDraft, onSaved }: { kind: OutreachKind; base: string; contact: PostingContact; draft: string; saved: string; onDraft: (text: string) => void; onSaved: (text: string) => void }) {
  const meta = messages[kind]
  const [instructions, setInstructions] = useState('')
  // The last AI draft; once the candidate edits it, the difference is what the skill can learn from.
  const [aiDraft, setAiDraft] = useState<{ request: string; text: string } | null>(null)
  const [busy, setBusy] = useState<'generate' | 'save' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const dirty = draft !== saved

  async function perform(action: 'generate' | 'save', task: () => Promise<void>) {
    setBusy(action); setError(null); setNotice('')
    try { await task() } catch (reason) { setError((reason as Error).message) } finally { setBusy(null) }
  }

  async function save(text: string) {
    await request(`${base}/outreach`, 'PUT', { kind, text })
    onSaved(text)
  }

  return <Card>
    <TaskHeader icon={meta.icon} title={meta.title} hint="AI drafts use your finalized resume, your cover letter, and the job posting. Nothing is sent. Review the wording before you use it." />
    {kind === 'email' && contact.email ? <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] px-5 py-3 text-xs">
      <span className="text-[var(--color-muted)]">To</span>
      <span className="font-medium">{contact.name ? `${contact.name} <${contact.email}>` : contact.email}</span>
      <span className="text-[var(--color-faint)]">from the posting</span>
      <button type="button" className={cn(secondary, 'ml-auto py-1')} onClick={() => void navigator.clipboard.writeText(contact.email!).then(() => setNotice('Address copied.'))}>Copy address</button>
      <a className={cn(secondary, 'py-1')} href={`mailto:${contact.email}${draftSubject(draft) ? `?subject=${encodeURIComponent(draftSubject(draft)!)}` : ''}`}>Open in mail app</a>
    </div> : null}
    <div className="space-y-5 p-5">
      <section className="space-y-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
        <label className="block space-y-2 text-sm"><span className="font-medium">1. Tell the AI what matters <span className="font-normal text-[var(--color-faint)]">(optional)</span></span><textarea disabled={!!busy} rows={2} maxLength={8000} className={input} value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder={meta.placeholder} /></label>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" disabled={!!busy} className={primary} onClick={() => {
            if (draft && dirty && !window.confirm('Replace your unsaved edits with a new draft?')) return
            void perform('generate', async () => {
              const data = await request(`${base}/outreach`, 'POST', { kind, instructions })
              onDraft(data.text); await save(data.text)
              setAiDraft({ request: instructions.trim() || `Draft the ${kind === 'email' ? 'application email' : 'LinkedIn message'}.`, text: data.text })
              setNotice('Draft ready and saved. Review and edit it below.')
            })
          }}>{busy === 'generate' ? <><Spinner /> Writing… this can take a minute</> : draft ? 'Regenerate draft' : 'Draft it with AI'}</button>
          {draft && busy !== 'generate' ? <span className="text-xs text-[var(--color-muted)]">Regenerating replaces the draft below.</span> : null}
        </div>
      </section>
      <label className="block space-y-2 text-sm">
        <span className="flex items-center gap-2 font-medium">2. Review and edit {dirty ? <Badge tone="warn">Unsaved changes</Badge> : draft ? <Badge tone="ok">Saved</Badge> : null}</span>
        <textarea disabled={!!busy} rows={14} maxLength={30000} className={`${input} leading-relaxed`} value={draft} onChange={(event) => { onDraft(event.target.value); setNotice('') }} placeholder="Generate a draft above, or write your own here." />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={!!busy || !dirty} className={secondary} onClick={() => void perform('save', async () => { await save(draft); setNotice('Draft saved.') })}>{busy === 'save' ? 'Saving…' : 'Save draft'}</button>
        <button type="button" disabled={!!busy || !draft} className={secondary} onClick={() => void perform('save', async () => { await navigator.clipboard.writeText(draft); setNotice('Copied to clipboard.') })}>Copy to clipboard</button>
        <Feedback error={error} notice={notice} />
      </div>
      {aiDraft && saved && saved !== aiDraft.text ? <div className="rounded-lg border border-[var(--color-border)]">
        <LearnFromChat skillId="write-outreach" disabled={!!busy} turns={[
          { role: 'user', content: aiDraft.request },
          { role: 'assistant', content: aiDraft.text },
          { role: 'user', content: `I edited your draft before using it. My final version:\n\n${saved}` },
        ]} />
      </div> : null}
    </div>
  </Card>
}

/** The subject from an email draft's first "Subject: ..." line, for the mailto link. */
function draftSubject(draft: string): string | null {
  return draft.match(/^Subject:\s*(.+)$/im)?.[1].trim() || null
}
