/**
 * The few applications that need the candidate now, most urgent first: an offer
 * deadline, an interview in the next three days, a next action coming due, a
 * fair moment to follow up, then a finished application not yet sent. Within
 * one kind, the one that has waited longest comes first.
 * Client-safe.
 */
import type { Application } from './applications'
import { followUpDue, daysSinceApplied } from './followUp'
import { stageForStatus } from './journey'

export interface NeedsYouItem {
  app: Application
  /** What to do, in a few words. */
  text: string
  /** The date it is due or happens, when there is one. */
  when: string | null
  rank: number
  /** Breaks ties within a rank: the earlier date has waited longer. */
  since: string
}

const SOON_DAYS = 3
const READY_FOR_DAYS = 14

const addDays = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10)

function itemFor(app: Application, today: string, now: Date): Omit<NeedsYouItem, 'since'> | null {
  const { stage } = stageForStatus(app.row?.status)
  if (!app.row || stage === 'closed') return null
  const soon = addDays(today, SOON_DAYS)
  const next = app.workspace?.next ?? null
  const due = next?.due?.slice(0, 10) ?? null

  if (stage === 'offer' && next) return { app, text: next.text, when: due, rank: 0 }
  const step = app.workspace?.step
  const stepDay = step?.state === 'booked' ? step.date?.slice(0, 10) ?? null : null
  const round = stepDay ?? app.workspace?.nextRound?.slice(0, 10) ?? null
  if (round && round >= today && round <= soon) return { app, text: step?.state === 'booked' ? step.label : 'Interview', when: round, rank: 1 }
  if (next && due && due <= soon) return { app, text: next.text, when: due, rank: 2 }
  if (followUpDue(app, now)) return { app, text: `Follow up: applied ${daysSinceApplied(app, now)} days ago, no reply`, when: null, rank: 3 }
  if (stage === 'preparing' && app.folder?.has.pdf && app.row.date >= addDays(today, -READY_FOR_DAYS)) return { app, text: 'Resume ready: send the application', when: null, rank: 4 }
  return null
}

export function needsYou(apps: Application[], now = new Date()): NeedsYouItem[] {
  const today = now.toISOString().slice(0, 10)
  return apps
    .map((app) => { const item = itemFor(app, today, now); return item ? { ...item, since: (app.workspace?.appliedAt ?? app.row?.date ?? '').slice(0, 10) } : null })
    .filter((item): item is NeedsYouItem => item !== null)
    .sort((a, b) => a.rank - b.rank || (a.when ?? '9999').localeCompare(b.when ?? '9999') || a.since.localeCompare(b.since))
}
