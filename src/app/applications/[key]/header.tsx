'use client'

import Link from 'next/link'
import { ArrowLeft, CalendarCheck, Check, ExternalLink, Lock, Sparkles } from 'lucide-react'
import type { Application } from '@/lib/applications'
import { applicationPhase, applicationStanding, PHASE_LABEL, PHASE_STEPS, phaseStep } from '@/lib/applicationPhase'
import { stageLabelForStatus } from '@/lib/journey'
import { daysSince } from '@/lib/postingSource'
import { STATUSES, statusLabel } from '@/lib/statuses'
import { Badge, Spinner, statusTone } from '@/components/ui/primitives'
import { CompanyAvatar } from '@/components/ui/flair'
import { Menu, MenuItem as MenuRow } from '@/components/ui/Menu'
import { cn, fmtDate } from '@/lib/utils'

/** A step of the Applying phase, shown as a tab inside the phase strip while preparing. */
export interface ApplyingStep<T extends string> {
  value: T
  label: string
  done: boolean
  locked: boolean
  /** The step to do next, marked so it can be found without a glow. */
  next: boolean
}

/**
 * Company, role, status, and the one progress indicator on the page: a strip
 * with the two phases. While preparing, the Applying segment holds the
 * steps themselves, so where you are and where you're looking are one control.
 */
export function ApplicationHeader<T extends string>({ app, status, interviewed, busy, postingUrl, appliedAt, onStatus, steps, step, onStep }: {
  app: Application
  status: string
  /** Whether any interview was logged, which places a rejection in Interviewing rather than Applying. */
  interviewed: boolean
  busy: boolean
  postingUrl: string | null
  appliedAt: string | null
  /** `note` is added to the tracker notes, for moves the status alone can't say, like withdrawing. */
  onStatus: (status: string, origin?: { x: number; y: number }, note?: string) => void
  steps?: ApplyingStep<T>[]
  step?: T
  onStep?: (step: T) => void
}) {
  const company = app.row?.company ?? app.folder?.slug ?? 'Application'
  const standing = applicationStanding(status)
  const phase = applicationPhase(status, interviewed)
  const closed = standing === 'closed'
  const sentAt = appliedAt ?? (standing !== 'prepare' && !['Discarded', 'SKIP'].includes(status) ? app.row?.date ?? null : null)
  const days = standing !== 'prepare' && !closed ? daysSince(sentAt) : null
  // While preparing, sending is recorded from the Send step; once sent and waiting, only the moves
  // that make sense from there. Interviewing and closed applications keep the full status select.
  const menu: MenuItem[] | null = standing === 'prepare'
    ? [
      { status: 'Discarded', label: 'Set aside', hint: 'Not applying for now' },
      { status: 'SKIP', label: 'Skip this role', hint: 'Not a fit' },
    ]
    : standing === 'waiting'
      ? [
        { status: 'Responded', label: 'Invited to interview', hint: 'A call, a screening or an interview' },
        { status: 'Rejected', label: 'Rejected', hint: 'They said no' },
        { status: 'Rejected', label: 'Withdraw', hint: 'You pulled out', note: `Withdrew on ${new Date().toISOString().slice(0, 10)}.` },
        { status: 'Preparing', label: 'Undo sent', hint: 'Marked as sent by mistake' },
      ]
      : null
  const link = 'inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 text-xs text-[var(--color-muted)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)]'

  return <header className="anim-rise relative z-30 space-y-3">
    <div className="flex flex-wrap items-center gap-3">
      <Link href="/applications" aria-label="Back to applications" title="Applications" className="grid size-8 place-items-center rounded-lg text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"><ArrowLeft size={16} aria-hidden="true" /></Link>
      <CompanyAvatar name={company} size={40} />
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-lg font-semibold leading-tight tracking-tight">{company}</h1>
        <p className="truncate text-sm text-[var(--color-muted)]">
          {app.row?.role ?? 'No tracker row linked'}
          {days !== null ? <span className="tnum" suppressHydrationWarning> · day {days}</span> : null}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {postingUrl ? <a href={postingUrl} target="_blank" rel="noreferrer" title={postingUrl} className={link}><ExternalLink size={13} aria-hidden="true" /> Posting</a> : null}
        {app.folder ? <Link href={`/runs?applicationKey=${encodeURIComponent(app.key)}`} className={link}><Sparkles size={13} aria-hidden="true" /> AI runs</Link> : null}
        {app.row && menu ? <ActionMenu busy={busy} items={menu} onSelect={(item) => onStatus(item.status, undefined, item.note)} /> : null}
        {app.row && !menu ? <select aria-label="Change status" title="Change status" value={status} disabled={busy} onChange={(event) => onStatus(event.target.value)} className="h-8 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-xs text-[var(--color-muted)]">{STATUSES.map((value) => <option key={value} value={value}>{statusLabel(value)}</option>)}{!STATUSES.includes(status as never) && status ? <option value={status}>{statusLabel(status)}</option> : null}</select> : null}
        {app.row && standing === 'waiting' ? <button disabled={busy} onClick={(event) => onStatus('Responded', { x: event.clientX, y: event.clientY })} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--color-accent)] px-3 text-xs font-semibold text-[var(--color-accent)] hover:bg-[var(--color-accent-soft)] disabled:opacity-40">{busy ? <Spinner /> : <CalendarCheck size={13} aria-hidden="true" />} Invited to interview</button> : null}
      </div>
    </div>

    {app.row ? <nav aria-label="Where this application stands" className="phase-strip">
      <Segment index={0} label={PHASE_LABEL.applying} here={phase === 'applying' && !closed} done={phase === 'interviewing'}>
        {steps && phase === 'applying' && !closed
          ? <ol className="flex flex-wrap items-center gap-1">
            {steps.map((each, position) => <li key={each.value} className="flex items-center gap-1">
              {position ? <span aria-hidden="true" className="text-[var(--color-faint)]">›</span> : null}
              <button
                type="button"
                onClick={() => onStep?.(each.value)}
                aria-current={each.value === step ? 'page' : undefined}
                aria-disabled={each.locked || undefined}
                title={each.locked ? 'Finalize your resume first' : undefined}
                className={cn('phase-step', each.value === step && 'phase-step-active', each.locked && 'cursor-not-allowed')}
              >
                {each.done ? <Check size={13} strokeWidth={2.5} className="text-[var(--color-ok)]" aria-hidden="true" /> : each.locked ? <Lock size={12} aria-hidden="true" /> : null}
                {each.label}
                {each.done ? <span className="sr-only">(done)</span> : each.locked ? <span className="sr-only">(locked)</span> : null}
                {each.next ? <span className="rounded-full bg-[var(--color-accent)] px-1.5 text-xs font-semibold text-[var(--color-bg)]">Next</span> : null}
              </button>
            </li>)}
          </ol>
          : <span className="text-xs text-[var(--color-muted)]" suppressHydrationWarning>{sentAt ? `Sent ${fmtDate(sentAt.slice(0, 10))}` : closed ? 'Not sent' : phase === 'interviewing' ? 'Done' : 'Preparing'}</span>}
      </Segment>
      <span aria-hidden="true" className="phase-link" />
      <Segment index={1} label={PHASE_LABEL.interviewing} here={phase === 'interviewing' && !closed} done={false}>
        {phase === 'interviewing'
          ? <ol className="flex items-center gap-2 text-xs">
            {PHASE_STEPS.interviewing.map((each, position) => {
              const at = phaseStep(standing)
              return <li key={each} className={cn(position === at && !closed ? 'font-semibold text-[var(--color-text)]' : 'text-[var(--color-muted)]')}>{position ? <span aria-hidden="true" className="mr-2 text-[var(--color-faint)]">›</span> : null}{each}</li>
            })}
          </ol>
          : <span className="text-xs text-[var(--color-muted)]">Once they invite you</span>}
      </Segment>
      {closed ? <Badge tone={statusTone(status)}>{stageLabelForStatus(status)}</Badge> : null}
    </nav> : null}
  </header>
}

interface MenuItem {
  status: string
  label: string
  hint: string
  note?: string
}

/** A small ⋯ menu of status moves. */
function ActionMenu({ items, busy, onSelect }: { items: MenuItem[]; busy: boolean; onSelect: (item: MenuItem) => void }) {
  return <Menu label="More actions" width="w-56">
    {(close) => items.map((item) => <MenuRow key={item.label} label={item.label} hint={item.hint} disabled={busy} onSelect={() => { close(); onSelect(item) }} />)}
  </Menu>
}

function Segment({ index, label, here, done, children }: { index: number; label: string; here: boolean; done: boolean; children: React.ReactNode }) {
  return <div aria-current={here ? 'step' : undefined} className={cn('flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1', here && 'phase-segment-here')}>
    <span className="flex items-center gap-2">
      <span className={cn('grid size-5 shrink-0 place-items-center rounded-full text-xs font-semibold', done ? 'bg-[var(--color-ok)] text-[var(--color-bg)]' : here ? 'bg-[var(--color-accent)] text-[var(--color-bg)]' : 'border border-[var(--color-border-strong)] text-[var(--color-muted)]')}>{done ? <Check size={11} strokeWidth={3} aria-hidden="true" /> : index + 1}</span>
      <span className={cn('text-sm font-semibold', !here && !done && 'text-[var(--color-muted)]')}>{label}</span>
    </span>
    {children}
  </div>
}
