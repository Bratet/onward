/**
 * Where an application stands, from its tracker status. Before it is sent the
 * page is a workshop (analyze, tailor, apply); after, it is about the people on
 * the other side: following up, preparing for interviews, keeping a record.
 * Client-safe.
 */

export type Phase = 'prepare' | 'waiting' | 'talking' | 'interview' | 'offer' | 'closed'

export function applicationPhase(status: string | null | undefined): Phase {
  switch (status) {
    case 'Applied': return 'waiting'
    case 'Responded': return 'talking'
    case 'Interview': return 'interview'
    case 'Offer': return 'offer'
    case 'Rejected':
    case 'Discarded':
    case 'SKIP': return 'closed'
    default: return 'prepare'
  }
}

/** Whether something was actually sent; Discarded and SKIP were never applied to. */
export function wasSent(status: string | null | undefined): boolean {
  return ['Applied', 'Responded', 'Interview', 'Offer', 'Rejected'].includes(status ?? '')
}

/** The milestones shown in the journey bar, in order. */
export const JOURNEY = ['Preparing', 'Applied', 'Responded', 'Interview', 'Offer'] as const

/** How far along the journey a status is: an index into JOURNEY, or -1 when off the path. */
export function journeyIndex(status: string | null | undefined): number {
  if (status === 'Evaluated' || status === 'Preparing' || !status) return 0
  return JOURNEY.indexOf(status as typeof JOURNEY[number])
}

export const PHASE_COPY: Record<Phase, { title: string; hint: string }> = {
  prepare: { title: 'Getting ready to apply', hint: 'Analyze the role, tailor your resume, then send it.' },
  waiting: { title: 'Waiting to hear back', hint: 'Follow up after a week, and start preparing in case they call.' },
  talking: { title: 'They replied', hint: 'Log what they said and get ready for the first conversation.' },
  interview: { title: 'Interviewing', hint: 'Practice the likely questions and keep track of each round.' },
  offer: { title: 'Offer on the table', hint: 'Review the posting and your notes before you negotiate.' },
  closed: { title: 'Closed', hint: 'Everything stays here for reference.' },
}
