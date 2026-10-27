'use client'

import { useEffect, useRef, useState } from 'react'
import { Ban, CalendarCheck, Check, Clock, Plus, RotateCcw, Trash2, Trophy, X } from 'lucide-react'
import { Spinner } from '@/components/ui/primitives'
import { ErrorNotice } from '@/components/ErrorNotice'
import { Menu, MenuItem } from '@/components/ui/Menu'
import { applicationPhase, applicationStanding, PHASE_LABEL } from '@/lib/applicationPhase'
import type { Journey, Operation, Step, StepState } from '@/lib/journey'
import { statusLabel } from '@/lib/statuses'
import { cn, fmtDate } from '@/lib/utils'

const button = 'inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-muted)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)] disabled:opacity-40'
const primary = 'inline-flex items-center justify-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3.5 py-2 text-xs font-semibold text-[var(--color-on-solid)] transition-opacity hover:opacity-90 disabled:opacity-40'
const input = 'w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-sm focus:border-[var(--color-accent)] focus:outline-none disabled:opacity-50'
const chip = 'flex min-h-14 min-w-36 max-w-60 flex-col justify-center rounded-lg border px-3 py-2 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:opacity-40'

const COMMON_STEPS = ['Introduction call', 'Recruiter screen', 'Technical interview', 'Take-home assignment', 'Case study', 'Final interview']

/** What the candidate picks for a round. Scheduled covers both a set and an unset date; older passed or not passed records took place. */
type Choice = 'scheduled' | 'done' | 'cancelled'
const CHOICES: { value: Choice; label: string }[] = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'done', label: 'Took place' },
  { value: 'cancelled', label: 'Aborted' },
]
const choiceFor = (state: StepState): Choice => state === 'expected' || state === 'booked' ? 'scheduled' : state === 'cancelled' ? 'cancelled' : 'done'

type Draft = { label: string; day: string; time: string; with: string; choice: Choice; picked: boolean }
const EMPTY: Draft = { label: '', day: '', time: '', with: '', choice: 'scheduled', picked: false }

async function readJson<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({ error: `The server answered ${response.status}` }))
  if (!response.ok) throw new Error(data.error ?? `The server answered ${response.status}`)
  return data as T
}

/** A day plus an optional time, as the journey stores it: 2026-10-28 or 2026-10-28T10:00. */
const when = (day: string, time: string) => day ? time ? `${day}T${time}` : day : null
const fmtStepDate = (date: string | null) => date ? `${fmtDate(date.slice(0, 10)).replace(/ \d{4}$/, '')}${date.includes('T') ? `, ${date.slice(11)}` : ''}` : 'Date to be set'

const today = () => new Date().toISOString().slice(0, 10)

/** A new or moved step: booked when its day is ahead, done when logged after the fact, not set without a date. */
function stateFor(date: string | null): StepState {
  if (!date) return 'expected'
  return date.slice(0, 10) >= today() ? 'booked' : 'done'
}

type View = 'scheduled' | 'unset' | 'done' | 'cancelled'

/** Where a step stands for the candidate: the status they picked, or no date yet. */
function stepView(step: Step): View {
  if (step.state === 'expected') return 'unset'
  if (step.state === 'booked') return 'scheduled'
  return step.state === 'cancelled' ? 'cancelled' : 'done'
}

/** The round is behind the candidate: it took place or was aborted. */
const settled = (view: View) => view === 'done' || view === 'cancelled'

/**
 * The application's one progress element once it is sent: Applying, the
 * company's own steps inside Interviewing, then where it ended. A step is only
 * a name and a date; how the application ended is its own block at the end of
 * the line, and the moves that change it sit on the right.
 */
export function JourneyTrack({ appKey, status, sentAt, withdrawn, busy: moving, onStatus, onMove, onJourney }: {
  appKey: string
  status: string
  sentAt: string | null
  /** Closed because the candidate pulled out, not because the company said no. */
  withdrawn: boolean
  /** A status move is saving. */
  busy: boolean
  /** The tracker status the journey settled on after a step change. */
  onStatus: (status: string) => void
  /** Move the application itself: invited, offer, rejected, withdrawn, reopened. `note` goes into the tracker notes. */
  onMove: (status: string, origin?: { x: number; y: number }, note?: string) => void
  onJourney?: (journey: Journey) => void
}) {
  const base = `/api/applications/${encodeURIComponent(appKey)}/journey`
  const [journey, setJourney] = useState<Journey | null>(null)
  const [editing, setEditing] = useState<Step | null>(null)
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    let live = true
    fetch(base).then((response) => readJson<{ journey: Journey }>(response))
      .then((data) => { if (live) setJourney(data.journey) })
      .catch((reason) => { if (live) setError((reason as Error).message) })
    return () => { live = false }
  }, [base])

  async function apply(operations: Operation[]): Promise<boolean> {
    setBusy(true); setError(null)
    try {
      const data = await readJson<{ journey: Journey; status: string | null }>(await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'apply', operations }) }))
      setJourney(data.journey)
      onJourney?.(data.journey)
      if (data.status) onStatus(data.status)
      return true
    } catch (reason) {
      setError((reason as Error).message)
      return false
    } finally {
      setBusy(false)
    }
  }

  function openDialog(step: Step | null) {
    setEditing(step)
    setDraft(step ? { label: step.label, day: step.date?.slice(0, 10) ?? '', time: step.date?.slice(11, 16) ?? '', with: step.with, choice: choiceFor(step.state), picked: false } : EMPTY)
    setError(null); setRemoving(false); setOpen(true)
    dialog.current?.showModal()
  }

  /** A new date moves a round between scheduled and took place, unless the candidate picked its status. */
  function setDay(day: string) {
    const date = when(day, draft.time)
    const auto = !draft.picked && (draft.choice === 'scheduled' || draft.choice === 'done')
    setDraft({ ...draft, day, choice: auto && date ? choiceFor(stateFor(date)) : draft.choice })
  }

  async function save() {
    const date = when(draft.day, draft.time)
    const state: StepState = draft.choice === 'scheduled' ? date ? 'booked' : 'expected' : draft.choice
    const operation: Operation = editing
      ? { op: 'update_step', stepId: editing.id, state, date, with: draft.with.trim(), notes: null }
      : { op: 'add_step', label: draft.label.trim(), date, with: draft.with.trim(), state: stateFor(date) }
    if (await apply([operation])) dialog.current?.close()
  }

  async function remove(step: Step) {
    if (await apply([{ op: 'remove_step', stepId: step.id }])) dialog.current?.close()
  }

  const steps = journey?.steps.filter((step) => step.id !== 'applied') ?? []
  const standing = applicationStanding(status)
  const closed = standing === 'closed'
  const offer = standing === 'offer'
  const interviewing = applicationPhase(status, steps.length > 0) === 'interviewing'
  const locked = busy || moving
  // A closed application ends where it ended: Interviewing shows only once reached, Offer only while still possible.
  const showInterviewing = interviewing || !closed
  const showOffer = !closed

  const withdraw = { label: 'Withdraw', hint: 'You pulled out', run: () => onMove('Rejected', undefined, `Withdrew on ${new Date().toISOString().slice(0, 10)}.`) }
  const moves: { primary?: { label: string; icon: React.ReactNode; status: string }; reject: boolean; more: { label: string; hint: string; run: () => void }[] } =
    standing === 'waiting' ? { primary: { label: 'Invited to interview', icon: <CalendarCheck size={13} aria-hidden="true" />, status: 'Responded' }, reject: true, more: [withdraw, { label: 'Undo sent', hint: 'Marked as sent by mistake', run: () => onMove('Preparing') }] }
    : standing === 'talking' || standing === 'interview' ? { primary: { label: 'Got an offer', icon: <Trophy size={13} aria-hidden="true" />, status: 'Offer' }, reject: true, more: [withdraw] }
    : offer ? { reject: false, more: [{ label: 'Rejected', hint: 'The offer fell through', run: () => onMove('Rejected') }, withdraw] }
    : { reject: false, more: [] }

  const connector = <span aria-hidden="true" className="h-px w-3 shrink-0 bg-[var(--color-border-strong)]" />
  // The last round that happened, for "After the…" and "Since…"; an aborted one never did.
  const lastStep = steps.filter((step) => step.state !== 'cancelled').at(-1)
  // Every round is behind the candidate and nothing else is booked: the ball is in their court.
  const waiting = interviewing && !closed && !offer && !!lastStep && steps.every((step) => settled(stepView(step)))
  const ending = closed
    ? <Outcome tone="bad" icon={<X size={14} strokeWidth={2.5} aria-hidden="true" />} title={withdrawn ? 'Withdrawn' : statusLabel(status)} hint={interviewing && lastStep ? `After the ${lastStep.label.toLowerCase()}` : 'After applying'} />
    : null

  return <nav aria-label="Where this application stands" className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <ol className="flex min-w-0 flex-col gap-4 sm:flex-row sm:gap-0">
        <Phase index={0} label={PHASE_LABEL.applying} here={!interviewing && !closed} done={interviewing} reached rail={showInterviewing ? interviewing ? 'done' : 'todo' : undefined}>
          <div className="flex flex-wrap items-center gap-2">
            <div className={cn(chip, 'border-[var(--color-border)]')}>
              <span className="text-sm font-medium">Application sent</span>
              <span className="mt-0.5 text-xs text-[var(--color-muted)] tnum" suppressHydrationWarning>{sentAt ? fmtStepDate(sentAt.slice(0, 10)) : 'Date to be set'}</span>
            </div>
            {ending && !interviewing ? <>{connector}{ending}</> : null}
          </div>
        </Phase>

        {showInterviewing ? <Phase index={1} label={PHASE_LABEL.interviewing} here={interviewing && !offer && !closed} done={offer} reached={interviewing} rail={showOffer ? offer ? 'done' : 'todo' : undefined}>
          {!journey
            ? error ? <span className="text-xs text-[var(--color-bad)]">{error}</span> : <span className="flex min-h-14 items-center gap-2 text-xs text-[var(--color-muted)]"><Spinner /> Loading steps…</span>
            : !interviewing
              ? <span className="flex min-h-14 items-center text-xs text-[var(--color-muted)]">Once they invite you</span>
              : <ol aria-label="Their steps" className="flex flex-wrap items-center gap-2">
                {steps.map((step, position) => <li key={step.id} className="flex items-center gap-2">
                  {position ? connector : null}
                  <StepChip step={step} closed={closed} disabled={locked} onOpen={() => openDialog(step)} />
                </li>)}
                {ending ? <li className="flex items-center gap-2">{steps.length ? connector : null}{ending}</li> : null}
                {waiting ? <li className="flex items-center gap-2">
                  {connector}
                  <div className={cn(chip, 'flex-row items-center gap-2.5 border-dashed border-[var(--color-border-strong)]')}>
                    <Clock size={16} aria-hidden="true" className="shrink-0 text-[var(--color-muted)]" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">Waiting for their answer</span>
                      <span className="block text-xs text-[var(--color-muted)] tnum" suppressHydrationWarning>{lastStep.date ? `Since ${fmtStepDate(lastStep.date.slice(0, 10))}` : 'Since the last round'}</span>
                    </span>
                  </div>
                </li> : null}
                {interviewing && !closed && !offer ? <li className="flex items-center gap-2">
                  {steps.length ? connector : null}
                  <button type="button" onClick={() => openDialog(null)} disabled={locked} className={cn(chip, 'min-w-0 flex-row items-center gap-1.5 border-dashed border-[var(--color-border-strong)] text-sm text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-accent)]')}>
                    <Plus size={15} aria-hidden="true" /> Add a step
                  </button>
                </li> : null}
              </ol>}
        </Phase> : null}

        {showOffer ? <Phase index={2} label="Offer" here={offer} done={false}>
          {offer ? <Outcome tone="ok" icon={<Trophy size={14} aria-hidden="true" />} title="Offer received" hint="Read it against the posting before you answer" /> : null}
        </Phase> : null}
      </ol>

      <div role="group" aria-label="Update this application" className="flex flex-wrap items-center gap-2">
        {moves.primary ? <button type="button" disabled={locked} onClick={(event) => onMove(moves.primary!.status, { x: event.clientX, y: event.clientY })} className={cn(primary, 'h-8 py-0')}>{moving ? <Spinner /> : moves.primary.icon}{moves.primary.label}</button> : null}
        {moves.reject ? <button type="button" disabled={locked} onClick={() => onMove('Rejected')} className={cn(button, 'h-8 py-0 hover:border-[var(--color-bad)] hover:text-[var(--color-bad)]')}>Rejected</button> : null}
        {closed ? <button type="button" disabled={locked} onClick={() => onMove(interviewing ? 'Interview' : 'Applied')} className={cn(button, 'h-8 py-0')}><RotateCcw size={13} aria-hidden="true" />Reopen</button> : null}
        {moves.more.length ? <Menu label="More status changes" width="w-56">
          {(close) => moves.more.map((item) => <MenuItem key={item.label} label={item.label} hint={item.hint} disabled={locked} onSelect={() => { close(); item.run() }} />)}
        </Menu> : null}
      </div>
    </div>
    {error && journey && !open ? <div className="mt-3"><ErrorNotice error={error} onDismiss={() => setError(null)} /></div> : null}

    <dialog ref={dialog} onClose={() => setOpen(false)} aria-labelledby="step-dialog-title" className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-0 text-[var(--color-text)] shadow-xl backdrop:bg-black/40">
      <form onSubmit={(event) => { event.preventDefault(); void save() }} className="space-y-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 id="step-dialog-title" className="text-base font-semibold">{editing ? editing.label : 'Add a step'}</h2>
          <button type="button" onClick={() => dialog.current?.close()} aria-label="Close" className="grid size-8 place-items-center rounded-lg text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"><X size={16} aria-hidden="true" /></button>
        </div>
        {editing ? null : <label className="block text-xs text-[var(--color-muted)]">Step
          <input required autoFocus list="journey-step-names" value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} placeholder="Introduction call" className={cn(input, 'mt-1')} />
          <datalist id="journey-step-names">{COMMON_STEPS.map((name) => <option key={name} value={name} />)}</datalist>
        </label>}
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs text-[var(--color-muted)]">Date
            <input type="date" value={draft.day} onChange={(event) => setDay(event.target.value)} className={cn(input, 'mt-1')} />
          </label>
          <label className="block text-xs text-[var(--color-muted)]">Time (optional)
            <input type="time" value={draft.time} disabled={!draft.day} onChange={(event) => setDraft({ ...draft, time: event.target.value })} className={cn(input, 'mt-1')} />
          </label>
        </div>
        <label className="block text-xs text-[var(--color-muted)]">With (optional)
          <input value={draft.with} onChange={(event) => setDraft({ ...draft, with: event.target.value })} placeholder="Recruiter, lead engineer…" className={cn(input, 'mt-1')} />
        </label>
        {editing ? <fieldset>
          <legend className="text-xs text-[var(--color-muted)]">Status</legend>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {CHOICES.map((option) => <label key={option.value} className={cn('cursor-pointer rounded-md border px-2.5 py-1.5 text-sm transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--color-accent)]',
              draft.choice === option.value ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] font-medium text-[var(--color-accent)]' : 'border-[var(--color-border)] text-[var(--color-muted)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)]')}>
              <input type="radio" name="step-status" value={option.value} checked={draft.choice === option.value} onChange={() => setDraft({ ...draft, choice: option.value, picked: true })} className="sr-only" />
              {option.label}
            </label>)}
          </div>
        </fieldset> : null}
        {error ? <ErrorNotice error={error} onDismiss={() => setError(null)} /> : null}
        <div className="flex flex-wrap items-center gap-2">
          {editing ? removing
            ? <span className="flex items-center gap-2 text-sm">Remove this step?
              <button type="button" onClick={() => void remove(editing)} disabled={busy} className={cn(button, 'border-[var(--color-bad)] text-[var(--color-bad)] hover:border-[var(--color-bad)] hover:text-[var(--color-bad)]')}>Remove</button>
              <button type="button" onClick={() => setRemoving(false)} disabled={busy} className={button}>Keep</button>
            </span>
            : <button type="button" onClick={() => setRemoving(true)} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-[var(--color-muted)] hover:text-[var(--color-bad)]"><Trash2 size={13} aria-hidden="true" />Remove step</button>
            : null}
          <span className="ml-auto flex gap-2">
            <button type="button" onClick={() => dialog.current?.close()} disabled={busy} className={button}>Cancel</button>
            <button type="submit" disabled={busy || removing || (!editing && !draft.label.trim())} className={primary}>{busy ? <Spinner /> : null}{editing ? 'Save' : 'Add step'}</button>
          </span>
        </div>
      </form>
    </dialog>
  </nav>
}

/**
 * One phase: its number and name on the rail, what happened in it underneath.
 * The rail runs from the name to the next phase, green once this one is done;
 * on narrow screens the phases stack and the rail drops away.
 */
function Phase({ index, label, here, done, reached, rail, children }: { index: number; label: string; here: boolean; done: boolean; reached?: boolean; rail?: 'done' | 'todo'; children: React.ReactNode }) {
  return <li aria-current={here ? 'step' : undefined} className="flex min-w-0 flex-col gap-2.5">
    <span className="flex items-center gap-2">
      <span className={cn('grid size-5 shrink-0 place-items-center rounded-full text-xs font-semibold', done ? 'bg-[var(--color-ok)] text-[var(--color-on-solid)]' : here ? 'bg-[var(--color-accent)] text-[var(--color-on-solid)]' : reached ? 'border border-[var(--color-text)] text-[var(--color-text)]' : 'border border-[var(--color-border-strong)] text-[var(--color-muted)]')}>{done ? <Check size={11} strokeWidth={3} aria-hidden="true" /> : index + 1}</span>
      <span className={cn('whitespace-nowrap text-sm font-semibold', !here && !done && !reached && 'text-[var(--color-muted)]')}>{label}</span>
      {rail ? <span aria-hidden="true" className={cn('ml-1 mr-3 hidden h-px min-w-10 flex-1 sm:block', rail === 'done' ? 'bg-[var(--color-ok)]' : 'bg-[var(--color-border-strong)]')} /> : null}
    </span>
    {children ? <div className={cn(rail && 'sm:pr-10')}>{children}</div> : null}
  </li>
}

const VIEW_LABEL: Record<'scheduled' | 'done' | 'cancelled', string> = { scheduled: 'Scheduled', done: 'Took place', cancelled: 'Aborted' }

/** One round: its name, then its status and date. Opens the dialog to edit it. */
function StepChip({ step, closed, disabled, onOpen }: { step: Step; closed: boolean; disabled: boolean; onOpen: () => void }) {
  const view = closed && !settled(stepView(step)) ? 'unset' : stepView(step)
  const date = fmtStepDate(step.date)
  const meta = view === 'unset' ? date : `${VIEW_LABEL[view]} · ${date}`
  return <button type="button" onClick={onOpen} disabled={disabled} aria-label={`${step.label}, ${meta}${step.with ? `, with ${step.with}` : ''}. Edit`} className={cn(chip,
    view === 'scheduled' ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]'
        : view === 'cancelled' ? 'border-dashed border-[var(--color-border)] hover:border-[var(--color-border-strong)]'
          : 'border-[var(--color-border)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-2)]')}>
    <span className={cn('truncate text-sm font-medium', view === 'cancelled' && 'text-[var(--color-muted)] line-through')}>{step.label}</span>
    <span className={cn('mt-0.5 flex items-center gap-1 truncate text-xs tnum', 'text-[var(--color-muted)]')} suppressHydrationWarning>
      {view === 'done' ? <Check size={12} strokeWidth={2.5} aria-hidden="true" className="shrink-0 text-[var(--color-ok)]" /> : null}
      {view === 'cancelled' ? <Ban size={12} aria-hidden="true" className="shrink-0" /> : null}
      {meta}{step.with ? ` · ${step.with}` : ''}
    </span>
  </button>
}

/** Where the application ended: a rejection or a withdrawal in red, an offer in green. */
function Outcome({ tone, icon, title, hint }: { tone: 'bad' | 'ok'; icon: React.ReactNode; title: string; hint: string }) {
  return <div className={cn(chip, 'flex-row items-center gap-2.5', tone === 'bad' ? 'border-[var(--color-bad)] bg-[var(--color-bad-soft)]' : 'border-[var(--color-ok)] bg-[var(--color-ok-soft)]')}>
    <span className={cn('grid size-6 shrink-0 place-items-center rounded-full text-[var(--color-on-solid)]', tone === 'bad' ? 'bg-[var(--color-bad)]' : 'bg-[var(--color-ok)]')}>{icon}</span>
    <span className="min-w-0">
      <span className="block text-sm font-semibold">{title}</span>
      <span className="block truncate text-xs text-[var(--color-muted)]">{hint}</span>
    </span>
  </div>
}
