import type { Application } from './applications'
import { daysSince, FOLLOW_UP_AFTER_DAYS, FOLLOW_UP_UNTIL_DAYS } from './postingSource'

/** Days since the application went out: the recorded applied date, else the tracker date. Client-safe. */
export function daysSinceApplied(app: Application, now = new Date()): number | null {
  return daysSince(app.workspace?.appliedAt ?? app.row?.date, now)
}

/** Applied, no reply yet, and quiet for long enough that a follow-up is fair, but not so long it is pointless. */
export function followUpDue(app: Application, now = new Date()): boolean {
  if (app.row?.status !== 'Applied') return false
  const days = daysSinceApplied(app, now)
  return days !== null && days >= FOLLOW_UP_AFTER_DAYS && days <= FOLLOW_UP_UNTIL_DAYS
}

/** Applied over a month ago and never heard back. */
export function goneQuiet(app: Application, now = new Date()): boolean {
  if (app.row?.status !== 'Applied') return false
  const days = daysSinceApplied(app, now)
  return days !== null && days > FOLLOW_UP_UNTIL_DAYS
}
