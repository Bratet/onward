'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import type { Application } from '@/lib/applications'
import { Card, Badge, statusTone, Empty, Spinner } from '@/components/ui/primitives'
import { DocDots } from '@/components/DocDots'
import { CompanyAvatar, SegmentedNav } from '@/components/ui/flair'
import { applicationPhase, applicationStanding, type Phase } from '@/lib/applicationPhase'
import { daysSince } from '@/lib/postingSource'
import { followUpDue, goneQuiet } from '@/lib/followUp'
import { fmtDate, cn } from '@/lib/utils'
import { missingFolder, statusLabel } from '@/lib/statuses'
import { STAGE_ORDER, stageForStatus, stageLabelForStatus, STEP_STATE_LABEL } from '@/lib/journey'

type PhaseFilter = 'all' | 'follow-up' | 'closed' | Phase

// Interviewing first: that is where time matters most. Closed applications leave both phases.
const PHASE_FILTERS: { value: PhaseFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'interviewing', label: 'Interviewing' },
  { value: 'applying', label: 'Applying' },
  { value: 'closed', label: 'Closed' },
]

/** The list's phase bucket for an application: its phase while open, else Closed. */
function phaseBucket(status: string | null | undefined): PhaseFilter {
  return applicationStanding(status) === 'closed' ? 'closed' : applicationPhase(status)
}

type SortKey = 'stage' | 'date' | 'company' | 'score'

export function ApplicationsTable({ applications, folders }: { applications: Application[]; folders: string[] }) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<string>('all')
  const [phase, setPhase] = useState<PhaseFilter>('all')
  const [sort, setSort] = useState<SortKey>('stage')
  const [asc, setAsc] = useState(true)
  const [linking, setLinking] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirm, setConfirm] = useState<string[] | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const statuses = useMemo(
    () => [...new Set(applications.map((a) => a.row?.status).filter(Boolean) as string[])].sort(),
    [applications],
  )

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const filtered = applications.filter((a) => {
      if (status !== 'all' && a.row?.status !== status) return false
      if (phase === 'follow-up' ? !followUpDue(a) : phase !== 'all' && phaseBucket(a.row?.status) !== phase) return false
      if (!needle) return true
      return [a.row?.company, a.row?.role, a.folder?.folder, a.row?.notes]
        .filter(Boolean)
        .some((s) => (s as string).toLowerCase().includes(needle))
    })

    const dir = asc ? 1 : -1
    return [...filtered].sort((a, b) => {
      switch (sort) {
        case 'company':
          return dir * (a.row?.company ?? a.folder?.slug ?? '').localeCompare(b.row?.company ?? b.folder?.slug ?? '')
        case 'score': {
          const pa = Number.parseFloat(a.row?.score ?? '') || -1
          const pb = Number.parseFloat(b.row?.score ?? '') || -1
          return dir * (pa - pb)
        }
        case 'stage':
          return dir * (STAGE_ORDER[stageForStatus(a.row?.status).stage] - STAGE_ORDER[stageForStatus(b.row?.status).stage])
            || (a.workspace?.next?.due ?? '9999').localeCompare(b.workspace?.next?.due ?? '9999')
            || (b.row?.date ?? b.folder?.date ?? '').localeCompare(a.row?.date ?? a.folder?.date ?? '')
        default:
          return dir * (a.row?.date ?? a.folder?.date ?? '').localeCompare(b.row?.date ?? b.folder?.date ?? '')
      }
    })
  }, [applications, q, status, phase, sort, asc])

  const phaseCounts = useMemo(() => {
    const counts = new Map<PhaseFilter, number>([['all', applications.length]])
    for (const a of applications) {
      const key = phaseBucket(a.row?.status)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return counts
  }, [applications])
  const dueCount = useMemo(() => applications.filter((a) => followUpDue(a)).length, [applications])

  const byKey = useMemo(() => new Map(applications.map((a) => [a.key, a])), [applications])
  const selectedShown = rows.filter((r) => selected.has(r.key)).map((r) => r.key)
  const allShownSelected = rows.length > 0 && selectedShown.length === rows.length

  const unlinked = applications.filter(missingFolder).length
  const orphanFolders = applications.filter((a) => !a.row && a.folder).length

  async function autoLink() {
    setLinking(true)
    try {
      const r = await fetch('/api/applications/link', { method: 'POST' })
      const d = await r.json()
      alert(`Linked ${d.linked} folder(s).\n${d.stillUnlinkedRows} rows and ${d.stillUnclaimedFolders} folders still unmatched.`)
      location.reload()
    } finally {
      setLinking(false)
    }
  }

  function toggleSelected(key: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function deleteKeys(keys: string[]) {
    setDeleting(true)
    setErr(null)
    const failures: string[] = []
    for (const key of keys) {
      try {
        const r = await fetch(`/api/applications/${encodeURIComponent(key)}`, { method: 'DELETE' })
        const d = await r.json()
        if (!r.ok) throw new Error(d.error ?? 'delete failed')
      } catch (e) {
        failures.push(`${key}: ${(e as Error).message}`)
      }
    }
    setDeleting(false)
    setConfirm(null)
    setSelected(new Set())
    if (failures.length) setErr(failures.join(' · '))
    router.refresh()
  }

  function toggle(key: SortKey) {
    if (sort === key) setAsc((v) => !v)
    else { setSort(key); setAsc(key === 'company' || key === 'stage') }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Applications</h1>
          <p className="text-xs text-[var(--color-faint)]">
            {rows.length} of {applications.length}
            {unlinked ? ` · ${unlinked} row${unlinked === 1 ? '' : 's'} with no folder` : ''}
            {orphanFolders ? ` · ${orphanFolders} folder${orphanFolders === 1 ? '' : 's'} with no row` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectedShown.length > 0 ? (
            <button
              onClick={() => setConfirm(selectedShown)}
              disabled={deleting}
              className="rounded-md border border-[var(--color-bad-soft)] px-2.5 py-1.5 text-xs text-[var(--color-bad)] transition-colors hover:border-[var(--color-bad)] disabled:opacity-40"
            >
              Delete {selectedShown.length} selected
            </button>
          ) : null}
          {unlinked > 0 ? (
            <button
              onClick={autoLink}
              disabled={linking}
              className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-xs transition-colors hover:border-[var(--color-border-strong)] disabled:opacity-50"
            >
              {linking ? <Spinner /> : null} Auto-link folders
            </button>
          ) : null}
        </div>
      </div>

      <SegmentedNav label="Filter by phase" value={phase} onChange={setPhase} items={[
        ...PHASE_FILTERS.filter((entry) => entry.value !== 'closed' || phaseCounts.get(entry.value)).map((entry) => ({
          value: entry.value,
          label: entry.label,
          badge: <span className="text-[10px] text-[var(--color-faint)] tnum">{phaseCounts.get(entry.value) ?? 0}</span>,
        })),
        ...(dueCount ? [{ value: 'follow-up' as PhaseFilter, label: 'Follow up', badge: <span className="rounded-full bg-[var(--color-accent-soft)] px-1.5 text-[10px] font-semibold text-[var(--color-accent)] tnum">{dueCount}</span> }] : []),
      ]} />

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search company, role, notes…"
          className="h-8 min-w-64 flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 text-[13px] outline-none placeholder:text-[var(--color-faint)] focus:border-[var(--color-accent)]"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="h-8 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-[13px] outline-none focus:border-[var(--color-accent)]"
        >
          <option value="all">All statuses</option>
          {statuses.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
        </select>
      </div>

      {err ? (
        <Card className="border-[var(--color-bad-soft)]">
          <p className="px-4 py-2.5 text-xs text-[var(--color-bad)]">{err}</p>
        </Card>
      ) : null}

      {confirm ? (
        <Card className="border-[var(--color-bad)]">
          <div className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-64 flex-1">
              <p className="text-sm font-medium">
                Delete {confirm.length === 1 ? 'this application' : `these ${confirm.length} applications`}?
              </p>
              <p className="mt-0.5 text-xs text-[var(--color-muted)]">
                {confirm.map((k) => label(byKey.get(k))).join(', ')} will be removed from Applications and the
                tracker. Document folders are moved to recoverable local trash.
              </p>
            </div>
            <button
              type="button"
              disabled={deleting}
              onClick={() => setConfirm(null)}
              className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-muted)] hover:text-[var(--color-text)] disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={() => void deleteKeys(confirm)}
              className="rounded-md bg-[var(--color-bad)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
            >
              {deleting ? 'Deleting…' : 'Yes, delete'}
            </button>
          </div>
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <Empty title="Nothing matches" hint="Try clearing the search or the status filter." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-left text-[11px] text-[var(--color-faint)]">
                  <th className="w-8 px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label="Select all shown applications"
                      checked={allShownSelected}
                      onChange={() => setSelected(allShownSelected ? new Set() : new Set(rows.map((r) => r.key)))}
                      className="cursor-pointer align-middle accent-[var(--color-accent)]"
                    />
                  </th>
                  <Th w="w-12" onClick={() => toggle('date')} active={sort === 'date'} asc={asc}>#</Th>
                  <Th w="w-28" onClick={() => toggle('date')} active={sort === 'date'} asc={asc}>Date</Th>
                  <Th onClick={() => toggle('company')} active={sort === 'company'} asc={asc}>Company</Th>
                  <Th>Role</Th>
                  <Th w="w-16" onClick={() => toggle('score')} active={sort === 'score'} asc={asc}>Score</Th>
                  <Th w="w-36" onClick={() => toggle('stage')} active={sort === 'stage'} asc={asc}>Stage</Th>
                  <Th w="w-20">Docs</Th>
                  <Th w="w-56">Next</Th>
                  <Th w="w-16"><span className="sr-only">Actions</span></Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a, index) => (
                  <tr
                    key={a.key}
                    style={{ ['--delay' as string]: `${Math.min(index, 14) * 22}ms` }}
                    role="link"
                    tabIndex={0}
                    aria-label={`Open workspace for ${a.row?.company ?? a.folder?.slug ?? 'application'}`}
                    onClick={() => router.push(`/applications/${encodeURIComponent(a.key)}`)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        router.push(`/applications/${encodeURIComponent(a.key)}`)
                      }
                    }}
                    className="anim-rise group cursor-pointer border-b border-[var(--color-border)] outline-none transition-colors last:border-0 hover:bg-[var(--color-surface-2)] focus-visible:bg-[var(--color-accent-soft)]"
                  >
                    <td className="px-3 py-2" onClick={(event) => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Select ${label(a)}`}
                        checked={selected.has(a.key)}
                        onChange={() => toggleSelected(a.key)}
                        className="cursor-pointer align-middle accent-[var(--color-accent)]"
                      />
                    </td>
                    <td className="px-3 py-2 text-[var(--color-faint)] tnum">{a.row?.id ?? '—'}</td>
                    <td className="px-3 py-2 text-[var(--color-muted)] tnum whitespace-nowrap">
                      {fmtDate(a.row?.date ?? a.folder?.date ?? '')}
                    </td>
                    <td className="max-w-56 px-3 py-2">
                      <span className="flex items-center gap-2.5"><CompanyAvatar name={a.row?.company ?? a.folder?.slug ?? '?'} size={26} /><span className="truncate font-medium">{a.row?.company ?? a.folder?.slug ?? '—'}</span></span>
                    </td>
                    <td className="max-w-80 truncate px-3 py-2 text-[var(--color-muted)]">
                      {a.row?.role ?? <span className="text-[var(--color-faint)]">folder only, no tracker row</span>}
                    </td>
                    <td className="px-3 py-2 text-[var(--color-muted)] tnum">{a.row?.score ?? '—'}</td>
                    <td className="px-3 py-2">
                      {a.row ? <Badge tone={statusTone(a.row.status)}>{stageLabelForStatus(a.row.status)}</Badge> : <Badge>No tracker row</Badge>}
                    </td>
                    <td className="px-3 py-2"><DocDots has={a.folder?.has ?? null} /></td>
                    <td className="px-3 py-2">
                      {a.workspace?.next || a.workspace?.step ? <JourneyNext app={a} /> : applicationStanding(a.row?.status) !== 'prepare' ? <Standing app={a} /> : <div className="flex flex-wrap gap-1">
                        {a.workspace?.fit ? <Badge tone={a.workspace.fit === 'Strong' ? 'ok' : a.workspace.fit === 'Partial' ? 'warn' : 'bad'}>{a.workspace.fit} fit</Badge> : null}
                        <Badge tone={a.workspace?.resume === 'finalized' ? 'ok' : a.workspace?.resume === 'draft' ? 'warn' : 'neutral'}>{a.workspace?.resume ?? 'missing'}</Badge>
                        {a.workspace?.pending ? <Badge tone="warn">review</Badge> : null}
                      </div>}
                    </td>
                    <td className="px-3 py-2 text-right" onClick={(event) => event.stopPropagation()}>
                      <button
                        type="button"
                        disabled={deleting}
                        aria-label={`Delete ${label(a)}`}
                        onClick={() => setConfirm([a.key])}
                        className="rounded-md border border-transparent px-2 py-1 text-xs text-[var(--color-faint)] opacity-0 transition-opacity hover:border-[var(--color-bad)] hover:text-[var(--color-bad)] focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-40"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

/** After applying: how long it has been, whether to follow up, and interview readiness. */
function Standing({ app }: { app: Application }) {
  const phase = applicationStanding(app.row?.status)
  const days = daysSince(app.workspace?.appliedAt ?? app.row?.date)
  return <div className="flex flex-wrap items-center gap-1" suppressHydrationWarning>
    {phase !== 'closed' && days !== null ? <span className="text-[11px] text-[var(--color-faint)] tnum">day {days}</span> : null}
    {followUpDue(app) ? <Badge tone="accent">follow up</Badge> : goneQuiet(app) ? <Badge>no reply</Badge> : null}
    {app.workspace?.nextRound ? <Badge tone="warn">interview {fmtDate(app.workspace.nextRound.slice(0, 10)).replace(/ \d{4}$/, '')}</Badge> : null}
    {app.workspace?.prep !== null && app.workspace?.prep !== undefined && phase !== 'closed' ? <Badge tone={app.workspace.prep >= 80 ? 'ok' : 'neutral'}>prep {app.workspace.prep}%</Badge> : null}
  </div>
}

/** The journey's next action, else its current step. */
function JourneyNext({ app }: { app: Application }) {
  const next = app.workspace?.next
  const step = app.workspace?.step
  if (next) return <span className="block max-w-56 truncate text-xs" suppressHydrationWarning>{next.text}{next.due ? <span className="text-[var(--color-muted)]"> · {fmtDate(next.due.slice(0, 10))}</span> : null}</span>
  if (!step) return null
  return <span className="block max-w-56 truncate text-xs text-[var(--color-muted)]" suppressHydrationWarning>{step.label} · {STEP_STATE_LABEL[step.state].toLowerCase()}{step.date ? `, ${fmtDate(step.date.slice(0, 10))}` : ''}</span>
}

function label(a?: Application): string {
  return a?.row?.company ?? a?.folder?.slug ?? a?.key ?? 'application'
}

function Th({
  children, w, onClick, active, asc,
}: {
  children?: React.ReactNode
  w?: string
  onClick?: () => void
  active?: boolean
  asc?: boolean
}) {
  return (
    <th className={cn('px-3 py-2 font-medium', w)}>
      {onClick ? (
        <button onClick={onClick} className={cn('hover:text-[var(--color-text)]', active && 'text-[var(--color-text)]')}>
          {children}
          {active ? <span className="ml-1">{asc ? '↑' : '↓'}</span> : null}
        </button>
      ) : (
        children
      )}
    </th>
  )
}
