'use client'

import Link from 'next/link'
import { Check, ExternalLink, Send, Sparkles } from 'lucide-react'
import type { Application } from '@/lib/applications'
import { JOURNEY, journeyIndex, PHASE_COPY, type Phase } from '@/lib/applicationPhase'
import { daysSince } from '@/lib/postingSource'
import { STATUSES } from '@/lib/statuses'
import { Badge, Spinner, statusTone } from '@/components/ui/primitives'
import { CompanyAvatar } from '@/components/ui/flair'
import { cn } from '@/lib/utils'

/** Company, role, status controls, and where this application is on its way to an offer. */
export function ApplicationHeader({ app, status, phase, busy, postingUrl, appliedAt, onStatus }: {
  app: Application
  status: string
  phase: Phase
  busy: boolean
  postingUrl: string | null
  appliedAt: string | null
  onStatus: (status: string, origin?: { x: number; y: number }) => void
}) {
  const company = app.row?.company ?? app.folder?.slug ?? 'Application'
  const at = journeyIndex(status)
  const closed = phase === 'closed'
  const days = phase !== 'prepare' && phase !== 'closed' ? daysSince(appliedAt ?? app.row?.date) : null
  const copy = PHASE_COPY[phase]

  return <header className="anim-rise space-y-4">
    <Link href="/applications" className="text-xs text-[var(--color-faint)] hover:text-[var(--color-accent)]">← Applications</Link>
    <div className="flex flex-wrap items-start gap-4">
      <CompanyAvatar name={company} size={52} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="truncate text-xl font-semibold tracking-tight">{company}</h1>
          {app.row ? <Badge tone={statusTone(status)}>{status}</Badge> : null}
          {days !== null ? <span className="text-xs text-[var(--color-faint)] tnum" suppressHydrationWarning>· day {days}</span> : null}
        </div>
        <p className="mt-0.5 truncate text-sm text-[var(--color-muted)]">{app.row?.role ?? 'No tracker row linked'}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {postingUrl ? <a href={postingUrl} target="_blank" rel="noreferrer" title={postingUrl} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 text-xs text-[var(--color-muted)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)]"><ExternalLink size={13} aria-hidden="true" /> Posting</a> : null}
        {app.folder ? <Link href={`/runs?applicationKey=${encodeURIComponent(app.key)}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 text-xs text-[var(--color-muted)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)]"><Sparkles size={13} aria-hidden="true" /> AI runs</Link> : null}
        {app.row ? <select aria-label="Status" value={status} disabled={busy} onChange={(event) => onStatus(event.target.value)} className="h-8 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-xs">{STATUSES.map((value) => <option key={value}>{value}</option>)}{!STATUSES.includes(status as never) && status ? <option>{status}</option> : null}</select> : null}
        {app.row && phase === 'prepare' ? <button disabled={busy} onClick={(event) => onStatus('Applied', { x: event.clientX, y: event.clientY })} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 text-xs font-semibold text-[var(--color-bg)] hover:opacity-90 disabled:opacity-40">{busy ? <Spinner /> : <Send size={13} aria-hidden="true" />} Mark as applied</button> : null}
      </div>
    </div>

    {app.row && phase !== 'prepare' ? <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold">{copy.title}</p>
        <p className="text-xs text-[var(--color-muted)]">{copy.hint}</p>
      </div>
      <div className="mt-4">
        <div className="journey-track"><span className={cn('journey-fill', closed && 'opacity-40')} style={{ width: `${at <= 0 ? 4 : (at / (JOURNEY.length - 1)) * 100}%` }} /></div>
        <ol className="relative mt-2 h-5 text-[11px]">
          {JOURNEY.map((step, index) => {
            const done = at >= index && !closed
            const current = at === index && !closed
            const left = (index / (JOURNEY.length - 1)) * 100
            // Each milestone's dot sits exactly where the bar reaches it.
            return <li key={step} className={cn("absolute top-0 flex items-center gap-1.5 whitespace-nowrap", index === JOURNEY.length - 1 && "flex-row-reverse")} style={{ left: `${left}%`, transform: index === 0 ? 'none' : index === JOURNEY.length - 1 ? 'translateX(-100%)' : 'translateX(-8px)' }}>
              <span className={cn('grid size-4 place-items-center rounded-full border text-[9px]', done ? 'border-transparent bg-[var(--color-accent)] text-[var(--color-bg)]' : 'border-[var(--color-border-strong)] text-transparent', current && 'anim-pulse')}>{done ? <Check size={10} strokeWidth={3} /> : null}</span>
              <span className={cn(current ? 'font-semibold text-[var(--color-text)]' : done ? 'text-[var(--color-muted)]' : 'text-[var(--color-faint)]')}>{step}</span>
            </li>
          })}
        </ol>
        {closed ? <p className="mt-2 text-xs text-[var(--color-muted)]">{status === 'Rejected' ? 'This one didn’t work out. Your materials and notes are kept below.' : 'This application was set aside.'}</p> : null}
      </div>
    </div> : null}
  </header>
}
