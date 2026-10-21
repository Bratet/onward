/**
 * Status constants live apart from tracker.ts because client components need
 * them, and tracker.ts imports fs/promises — importing it from the browser
 * bundle would fail the build.
 */

export const STATUSES = [
  'Preparing',
  'Applied',
  'Responded',
  'Interview',
  'Offer',
  'Rejected',
  'Discarded',
  'SKIP',
] as const

export type Status = (typeof STATUSES)[number]

const STATUS_LABEL: Record<string, string> = { Applied: 'Sent', Discarded: 'Set aside', SKIP: 'Skipped' }

/**
 * How a status reads in the app. The tracker keeps its own words ("Applied",
 * "SKIP"); the app uses the candidate's: "Sent", "Set aside", "Skipped".
 */
export function statusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status
}

/** Statuses that mean the company came back to us, for response-rate stats. */
export const RESPONDED_STATUSES: readonly string[] = ['Responded', 'Interview', 'Offer', 'Rejected']

/** Statuses that mean we actually sent something. */
export const SENT_STATUSES: readonly string[] = ['Applied', ...RESPONDED_STATUSES]

/** Statuses where nothing was prepared, so a row with no documents folder is expected. */
export const NO_FOLDER_STATUSES: readonly string[] = ['SKIP']

/** A tracker row that should have a documents folder but has none linked. */
export function missingFolder(application: { row: { status: string } | null; folder: unknown }) {
  return Boolean(application.row && !application.folder && !NO_FOLDER_STATUSES.includes(application.row.status))
}
