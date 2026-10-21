'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Sparkles, Undo2 } from 'lucide-react'
import { Badge, Card, Spinner } from '@/components/ui/primitives'
import { ErrorNotice } from '@/components/ErrorNotice'
import { ChatMarkdown } from '@/components/ChatMarkdown'
import {
  currentStep, describeOperation, operationSchema, OUTCOME_LABEL, OUTCOMES, STAGE_LABEL, STAGES, STEP_STATE_LABEL, STEP_STATES,
  type Basis, type Journey, type JourneyProposal, type Operation, type StepState,
} from '@/lib/journey'
import { cn, fmtDate } from '@/lib/utils'

const button = 'inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-muted)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)] disabled:opacity-40'
const primary = 'inline-flex items-center justify-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3.5 py-2 text-xs font-semibold text-[var(--color-bg)] transition-opacity hover:opacity-90 disabled:opacity-40'

const BASIS: Record<Basis, { label: string; tone: 'ok' | 'warn' | 'bad' }> = {
  'from-message': { label: 'From your message', tone: 'ok' },
  guessed: { label: 'Guessed', tone: 'warn' },
  'needs-you': { label: 'Needs you', tone: 'bad' },
}

const STEP_DOT: Record<StepState, string> = {
  expected: 'border border-dashed border-[var(--color-border-strong)] bg-transparent',
  booked: 'bg-[var(--color-accent)]',
  done: 'bg-[var(--color-warn)]',
  passed: 'bg-[var(--color-ok)]',
  'not-passed': 'bg-[var(--color-bad)]',
}

async function readJson<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({ error: `The server answered ${response.status}` }))
  if (!response.ok) throw new Error(data.error ?? `The server answered ${response.status}`)
  return data as T
}

/**
 * Where an application stands, and a companion that turns "here's what
 * happened" into reviewed updates. Nothing changes until the candidate applies
 * a proposal, and the latest applied update can always be undone.
 */
export function JourneyCompanion({ appKey, onStatus, onJourney }: { appKey: string; onStatus: (status: string) => void; onJourney?: (journey: Journey) => void }) {
  const base = `/api/applications/${encodeURIComponent(appKey)}/journey`
  const [journey, setJourney] = useState<Journey | null>(null)
  const [message, setMessage] = useState('')
  const [sent, setSent] = useState('')
  const [proposal, setProposal] = useState<JourneyProposal | null>(null)
  const [kept, setKept] = useState<boolean[]>([])
  const [editing, setEditing] = useState<number | null>(null)
  const [edited, setEdited] = useState<Record<number, boolean>>({})
  const [busy, setBusy] = useState<'propose' | 'apply' | 'undo' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const inputId = useId()

  useEffect(() => {
    let live = true
    fetch(base).then((response) => readJson<{ journey: Journey }>(response))
      .then((data) => { if (live) setJourney(data.journey) })
      .catch((reason) => { if (live) setError((reason as Error).message) })
    return () => { live = false; abortRef.current?.abort() }
  }, [base])

  async function propose() {
    const text = message.trim()
    if (!text || busy) return
    const controller = new AbortController()
    abortRef.current = controller
    setBusy('propose'); setError(null); setProposal(null)
    try {
      const data = await readJson<{ proposal: JourneyProposal }>(await fetch(base, {
        method: 'POST', headers: { 'content-type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ action: 'propose', message: text }),
      }))
      setProposal(data.proposal)
      setSent(text)
      setKept(data.proposal.items.map(() => true))
      setEditing(null); setEdited({})
      setAnnouncement(data.proposal.items.length ? `${data.proposal.items.length} proposed changes to review.` : 'Nothing to change.')
    } catch (reason) {
      if ((reason as Error).name !== 'AbortError') setError((reason as Error).message)
    } finally {
      setBusy(null)
      abortRef.current = null
    }
  }

  async function apply() {
    if (!proposal || !journey) return
    const operations = proposal.items.filter((_, index) => kept[index]).map((item) => item.operation)
    if (!operations.length) return
    setBusy('apply'); setError(null)
    try {
      const data = await readJson<{ journey: Journey; status: string | null }>(await fetch(base, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'apply', operations, source: sent }),
      }))
      setJourney(data.journey)
      // The page around the companion leads with the journey, so it hears of each saved change.
      onJourney?.(data.journey)
      if (data.status) onStatus(data.status)
      setProposal(null); setMessage(''); setSent('')
      setAnnouncement(`Applied ${operations.length} change${operations.length === 1 ? '' : 's'}. You can undo it below.`)
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setBusy(null)
    }
  }

  async function undo(entryId: string) {
    setBusy('undo'); setError(null)
    try {
      const data = await readJson<{ journey: Journey; status: string | null }>(await fetch(base, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'undo', entryId }),
      }))
      setJourney(data.journey)
      // The page around the companion leads with the journey, so it hears of each saved change.
      onJourney?.(data.journey)
      if (data.status) onStatus(data.status)
      setAnnouncement('Update undone.')
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setBusy(null)
    }
  }

  if (!journey) {
    return <Card className="p-5">{error ? <ErrorNotice error={error} /> : <p className="flex items-center gap-2 text-sm text-[var(--color-muted)]"><Spinner /> Loading where this application stands…</p>}</Card>
  }

  const now = currentStep(journey)
  const latest = journey.timeline.find((entry) => !entry.undoneAt)
  const keptCount = kept.filter(Boolean).length
  const invalid = (proposal?.items ?? []).map((item) => {
    const result = operationSchema.safeParse(item.operation)
    return result.success ? null : result.error.issues[0]?.message ?? 'This change is not valid'
  })

  // With one step there is nothing the phase strip and the banner don't already say.
  const tracked = journey.steps.length > 1 || !!journey.outcome

  return <Card className="anim-rise overflow-hidden">
    <p role="status" className="sr-only">{announcement}</p>

    {tracked ? <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--color-border)] px-5 py-4">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
          {STAGE_LABEL[journey.stage]}
          {journey.outcome ? <Badge>{OUTCOME_LABEL[journey.outcome]}</Badge> : null}
        </p>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          {now ? <>Current step: <span className="text-[var(--color-text)]">{now.label}</span></> : 'No steps recorded yet. Tell the companion what happened.'}
        </p>
      </div>
    </div> : null}

    {tracked && journey.steps.length ? <ol aria-label="Steps" className="flex gap-2 overflow-x-auto px-5 py-4">
      {journey.steps.map((step) => <li key={step.id} className={cn('min-w-40 max-w-56 shrink-0 rounded-lg border px-3 py-2.5', step === now ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]' : 'border-[var(--color-border)]')}>
        <span className="flex items-center gap-2 text-sm font-medium"><span aria-hidden="true" className={cn('size-2.5 shrink-0 rounded-full', STEP_DOT[step.state])} />{step.label}</span>
        <span className="mt-1 block text-xs text-[var(--color-muted)]">
          {STEP_STATE_LABEL[step.state]}{step.date ? ` · ${fmtDate(step.date.slice(0, 10))}${step.date.includes('T') ? ` ${step.date.slice(11)}` : ''}` : ''}
        </span>
        {step.with ? <span className="mt-0.5 block truncate text-xs text-[var(--color-muted)]">with {step.with}</span> : null}
      </li>)}
    </ol> : null}

    <div className={cn('space-y-3 px-5 py-4', tracked && 'border-t border-[var(--color-border)]')}>
      <label htmlFor={inputId} className="flex items-center gap-1.5 text-sm font-medium"><Sparkles size={14} aria-hidden="true" className="text-[var(--color-accent)]" /> What happened?</label>
      <textarea
        id={inputId}
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !event.nativeEvent.isComposing) { event.preventDefault(); void propose() }
          if (event.key === 'Escape' && busy === 'propose') abortRef.current?.abort()
        }}
        rows={3}
        placeholder="Paste the email, or write something like: passed the intro call, technical interview Tuesday at 10 with their lead engineer."
        className="w-full resize-y rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm leading-relaxed placeholder:text-[var(--color-muted)] focus:border-[var(--color-accent)] focus:outline-none"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void propose()} disabled={!message.trim() || busy !== null} className={primary}>
          {busy === 'propose' ? <Spinner /> : null}{busy === 'propose' ? 'Reading your message…' : 'Propose updates'}
        </button>
        {busy === 'propose' ? <button type="button" onClick={() => abortRef.current?.abort()} className={button}>Stop</button> : null}
        <span className="text-xs text-[var(--color-muted)]">Nothing changes until you apply it. <kbd>⌘</kbd> <kbd>Enter</kbd> to send.</span>
      </div>
      {error ? <ErrorNotice error={error} onDismiss={() => setError(null)} /> : null}
    </div>

    {proposal ? <section aria-label="Proposed updates" className="space-y-3 border-t border-[var(--color-border)] bg-[var(--color-surface-2)] px-5 py-4">
      {proposal.reply ? <ChatMarkdown text={proposal.reply} className="text-sm leading-relaxed" /> : null}
      {proposal.question ? <p className="rounded-lg bg-[var(--color-warn-soft)] px-3 py-2 text-sm text-[var(--color-warn)]">{proposal.question} <span className="text-[var(--color-muted)]">Add the answer to your message and propose again.</span></p> : null}
      {proposal.items.length ? <ul className="space-y-2">
        {proposal.items.map((item, index) => <li key={index} className={cn('flex items-start gap-3 rounded-lg border bg-[var(--color-surface)] px-3 py-2.5', kept[index] ? 'border-[var(--color-border-strong)]' : 'border-[var(--color-border)] opacity-70')}>
          <input
            type="checkbox"
            aria-label={`Keep: ${describeOperation(item.operation, journey)}`}
            checked={kept[index] ?? false}
            onChange={(event) => setKept((current) => current.map((value, at) => at === index ? event.target.checked : value))}
            className="mt-1 accent-[var(--color-accent)]"
          />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
              {describeOperation(item.operation, journey)}
              <Badge tone={edited[index] ? 'neutral' : BASIS[item.basis].tone}>{edited[index] ? 'Edited by you' : BASIS[item.basis].label}</Badge>
              {editable(item.operation) ? <button type="button" onClick={() => setEditing(editing === index ? null : index)} aria-expanded={editing === index} className="text-xs font-normal text-[var(--color-accent)] hover:underline">{editing === index ? 'Done' : 'Edit'}</button> : null}
            </span>
            {item.quote ? <span className="mt-1 block text-xs italic leading-relaxed text-[var(--color-muted)]">“{item.quote}”</span> : null}
            {item.why ? <span className="mt-0.5 block text-xs leading-relaxed text-[var(--color-muted)]">{item.why}</span> : null}
            {editing === index ? <OperationEditor
              operation={item.operation}
              journey={journey}
              onChange={(operation) => {
                setProposal({ ...proposal, items: proposal.items.map((entry, at) => at === index ? { ...entry, operation } : entry) })
                setEdited((current) => ({ ...current, [index]: true }))
              }}
            /> : null}
            {invalid[index] ? <span role="alert" className="mt-1 block text-xs text-[var(--color-bad)]">{invalid[index]}</span> : null}
          </span>
        </li>)}
      </ul> : <p className="text-sm text-[var(--color-muted)]">Nothing to change.</p>}
      <div className="flex flex-wrap gap-2">
        {proposal.items.length ? <button type="button" onClick={() => void apply()} disabled={!keptCount || busy !== null || proposal.items.some((_, index) => kept[index] && invalid[index])} className={primary}>
          {busy === 'apply' ? <Spinner /> : null}Apply {keptCount} change{keptCount === 1 ? '' : 's'}
        </button> : null}
        <button type="button" onClick={() => setProposal(null)} disabled={busy !== null} className={button}>{proposal.items.length ? 'Discard' : 'Dismiss'}</button>
      </div>
    </section> : null}

    {journey.timeline.length ? <section aria-label="Updates" className="border-t border-[var(--color-border)] px-5 py-4">
      <h3 className="text-sm font-semibold">Updates</h3>
      <ul className="mt-2 space-y-2">
        {journey.timeline.slice(0, 6).map((entry) => <li key={entry.id} className="flex items-start justify-between gap-3 text-sm">
          <span className={cn('min-w-0', entry.undoneAt && 'text-[var(--color-muted)] line-through')}>
            <span className="text-xs text-[var(--color-muted)] tnum">{fmtDate(entry.at.slice(0, 10))}</span> · {entry.summary}
          </span>
          {entry.undoneAt ? <span className="shrink-0 text-xs text-[var(--color-muted)]">Undone</span>
            : entry.id === latest?.id ? <button type="button" onClick={() => void undo(entry.id)} disabled={busy !== null} className={cn(button, 'shrink-0')}>{busy === 'undo' ? <Spinner /> : <Undo2 size={13} aria-hidden="true" />}Undo</button> : null}
        </li>)}
      </ul>
    </section> : null}
  </Card>
}

type Field = { key: string; label: string; kind: 'text' | 'when' | 'select'; options?: readonly { value: string; label: string }[] }

const stateOptions = STEP_STATES.map((value) => ({ value, label: STEP_STATE_LABEL[value] }))

/** The fields a candidate may correct on each operation; clear_next_action has none. */
function fieldsFor(operation: Operation): Field[] {
  const when: Field = { key: 'date', label: 'Date', kind: 'when' }
  switch (operation.op) {
    case 'set_stage': return [
      { key: 'stage', label: 'Stage', kind: 'select', options: STAGES.map((value) => ({ value, label: STAGE_LABEL[value] })) },
      ...(operation.stage === 'closed' ? [{ key: 'outcome', label: 'Outcome', kind: 'select' as const, options: OUTCOMES.map((value) => ({ value, label: OUTCOME_LABEL[value] })) }] : []),
    ]
    case 'add_step': return [{ key: 'label', label: 'Step', kind: 'text' }, when, { key: 'with', label: 'With', kind: 'text' }, { key: 'state', label: 'State', kind: 'select', options: stateOptions }]
    case 'update_step': return [{ key: 'state', label: 'State', kind: 'select', options: stateOptions }, when, { key: 'with', label: 'With', kind: 'text' }]
    case 'set_next_action': return [{ key: 'text', label: 'Next action', kind: 'text' }, { key: 'due', label: 'Due', kind: 'when' }]
    case 'add_contact': return [{ key: 'name', label: 'Name', kind: 'text' }, { key: 'role', label: 'Role', kind: 'text' }, { key: 'email', label: 'Email', kind: 'text' }]
    case 'add_note': return [{ key: 'text', label: 'Note', kind: 'text' }]
    case 'clear_next_action': return []
  }
}

function editable(operation: Operation): boolean {
  return fieldsFor(operation).length > 0
}

const input = 'w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-sm focus:border-[var(--color-accent)] focus:outline-none'

/** Correct one proposed change in place; dates accept a day, or a day and a time. */
function OperationEditor({ operation, journey, onChange }: { operation: Operation; journey: Journey; onChange: (operation: Operation) => void }) {
  const values = operation as unknown as Record<string, string | null>
  const set = (key: string, value: string) => {
    const nullable = key === 'date' || key === 'due' || key === 'outcome' || (key === 'state' && operation.op === 'update_step')
    onChange({ ...operation, [key]: nullable && !value ? null : value } as Operation)
  }
  return <span className="mt-2 grid gap-2 sm:grid-cols-2">
    {operation.op === 'update_step' ? <span className="text-xs text-[var(--color-muted)] sm:col-span-2">Step: {journey.steps.find((step) => step.id === operation.stepId)?.label ?? operation.stepId}</span> : null}
    {fieldsFor(operation).map((field) => <label key={field.key} className={cn('block text-xs text-[var(--color-muted)]', field.key === 'text' && 'sm:col-span-2')}>
      {field.label}{field.kind === 'when' ? ' (2026-10-28 or 2026-10-28T10:00)' : ''}
      {field.kind === 'select'
        ? <select value={values[field.key] ?? ''} onChange={(event) => set(field.key, event.target.value)} className={cn(input, 'mt-1')}>
          {field.key === 'state' && operation.op === 'update_step' ? <option value="">Unchanged</option> : null}
          {field.options!.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        : <input value={values[field.key] ?? ''} onChange={(event) => set(field.key, event.target.value)} placeholder={field.kind === 'when' ? 'No date' : undefined} className={cn(input, 'mt-1')} />}
    </label>)}
  </span>
}
