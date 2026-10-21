/**
 * Where an application stands, from its tracker status. A search has two
 * phases: Applying is the candidate's move, from the posting until the
 * company answers (prepare, send, wait, follow up); Interviewing is the
 * company's process once it has picked the application (calls, interviews,
 * the offer). Closed is how either one ends, not a third phase. Client-safe.
 */

export type Phase = 'applying' | 'interviewing'

export const PHASES: readonly Phase[] = ['applying', 'interviewing']

export const PHASE_LABEL: Record<Phase, string> = {
  applying: 'Applying',
  interviewing: 'Interviewing',
}

/**
 * The phase a status belongs to. A rejection can come on the application or
 * after interviews, and the status alone cannot tell which; `interviewed`
 * says whether any interview was logged.
 */
export function applicationPhase(status: string | null | undefined, interviewed = false): Phase {
  switch (status) {
    case 'Responded':
    case 'Interview':
    case 'Offer': return 'interviewing'
    case 'Rejected': return interviewed ? 'interviewing' : 'applying'
    default: return 'applying'
  }
}

/** The finer step inside a phase. */
export type Standing = 'prepare' | 'waiting' | 'talking' | 'interview' | 'offer' | 'closed'

export function applicationStanding(status: string | null | undefined): Standing {
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

/** The steps inside each phase, in order, as the phase bar shows them. */
export const PHASE_STEPS: Record<Phase, readonly string[]> = {
  applying: ['Prepare', 'Sent'],
  interviewing: ['Interviews', 'Offer'],
}

/** The step a standing is on inside its phase: an index into PHASE_STEPS[phase], or -1 when closed. */
export function phaseStep(standing: Standing): number {
  switch (standing) {
    case 'prepare': return 0
    case 'waiting': return 1
    case 'talking':
    case 'interview': return 0
    case 'offer': return 1
    case 'closed': return -1
  }
}

export const STANDING_COPY: Record<Standing, { title: string; hint: string }> = {
  prepare: { title: 'Getting your application ready', hint: 'Analyze the role, tailor your resume, then send it.' },
  waiting: { title: 'Sent, waiting for their answer', hint: 'Follow up after a week. Once they reply, you move to Interviewing.' },
  talking: { title: 'They selected your application', hint: 'Log what they said and get ready for the first conversation.' },
  interview: { title: 'In their interview process', hint: 'Practice the likely questions and keep track of each round.' },
  offer: { title: 'Offer on the table', hint: 'Review the posting and your notes before you negotiate.' },
  closed: { title: 'Closed', hint: 'Everything stays here for reference.' },
}
