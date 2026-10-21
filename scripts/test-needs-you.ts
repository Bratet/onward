import type { Application } from '../src/lib/applications'
import { stageLabelForStatus, STAGE_ORDER, stageForStatus } from '../src/lib/journey'
import { interviewsAhead, needsYou } from '../src/lib/needsYou'

let failures = 0
function check(name: string, condition: boolean, detail = '') {
  if (condition) console.log(`  ok   ${name}`)
  else {
    failures++
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

const now = new Date('2026-10-20T09:00:00Z')
let id = 0
function app(status: string, date: string, workspace: Application['workspace'] = { fit: null, pending: false, resume: 'draft' }, pdf = false): Application {
  id++
  const has = { pdf, yaml: true } as unknown as NonNullable<Application['folder']>['has']
  return {
    key: `company-${id}`,
    row: { id, date, company: `Company ${id}`, role: 'Engineer', score: 'N/A', status, pdf: '', report: '', notes: '' },
    folder: { folder: `company-${id}`, slug: `company-${id}`, date, docs: [], has },
    workspace,
  }
}
const ws = (extra: Partial<NonNullable<Application['workspace']>>): Application['workspace'] => ({ fit: null, pending: false, resume: 'draft', ...extra })

console.log('needs you')

const offer = app('Offer', '2026-09-01', ws({ next: { text: 'Answer the offer', due: '2026-10-25' } }))
const interviewSoon = app('Interview', '2026-09-20', ws({ step: { label: 'Technical interview', date: '2026-10-22T10:00', state: 'booked' } }))
const interviewLater = app('Interview', '2026-09-20', ws({ step: { label: 'Final round', date: '2026-11-10', state: 'booked' } }))
const replyDue = app('Interview', '2026-09-25', ws({ next: { text: 'Confirm the slot', due: '2026-10-19' } }))
const quiet = app('Applied', '2026-08-01', ws({ appliedAt: '2026-08-01' }))
const ready = app('Preparing', '2026-10-15', ws({}), true)
const staleReady = app('Preparing', '2026-06-15', ws({}), true)
const closed = app('Rejected', '2026-10-01', ws({ next: { text: 'Ask for feedback', due: '2026-10-20' } }))
const undated = app('Interview', '2026-10-01', ws({ next: { text: 'Wait for them to schedule', due: null } }))

const items = needsYou([ready, replyDue, interviewLater, interviewSoon, offer, quiet, staleReady, closed, undated], now)
const order = items.map((item) => item.app.key)
check('most urgent first: offer, interview soon, overdue action, ready to send', JSON.stringify(order) === JSON.stringify([offer.key, interviewSoon.key, replyDue.key, ready.key]), JSON.stringify(items.map((item) => `${item.app.key}:${item.text}`)))
check('an interview weeks away is not urgent', !order.includes(interviewLater.key))
check('closed applications never need you', !order.includes(closed.key))
check('an application waiting for a reply is not a to-do', !order.includes(quiet.key))
check('an old finished draft is not nagged about', !order.includes(staleReady.key))
check('an undated "wait" action is not a to-do', !order.includes(undated.key))
check('an interview item names the step and its day', items[1].text === 'Technical interview' && items[1].when === '2026-10-22')

const newer = app('Preparing', '2026-10-15', ws({}), true)
const older = app('Preparing', '2026-10-10', ws({}), true)
const ties = needsYou([newer, older], now).map((item) => item.app.key)
check('the finished draft that has waited longest comes first', JSON.stringify(ties) === JSON.stringify([older.key, newer.key]), JSON.stringify(ties))

const ahead = app('Interview', '2026-09-20', ws({ step: { label: 'Final round', date: '2026-11-10', state: 'booked' } }))
const pastBooked = app('Interview', '2026-09-20', ws({ step: { label: 'Intro call', date: '2026-10-19', state: 'booked' } }))
const happened = app('Interview', '2026-09-20', ws({ step: { label: 'Intro call', date: '2026-10-19', state: 'done' } }))
const rejected = app('Rejected', '2026-09-20', ws({ step: { label: 'Tech round', date: '2026-10-25', state: 'booked' } }))
const interviews = interviewsAhead([ahead, happened, rejected, pastBooked, interviewSoon], now)
check('interviews: unconfirmed past ones first, then upcoming by date', JSON.stringify(interviews.map((item) => item.app.key)) === JSON.stringify([pastBooked.key, interviewSoon.key, ahead.key]), JSON.stringify(interviews.map((item) => item.app.key)))
check('interviews: a past booked step asks to be confirmed', interviews[0].confirm && !interviews[1].confirm)
check('interviews: done steps and closed applications stay off the list', !interviews.some((item) => item.app.key === happened.key || item.app.key === rejected.key))

check('stage labels read plainly', stageLabelForStatus('Interview') === 'Interviewing' && stageLabelForStatus('Rejected') === 'Closed · Rejected' && stageLabelForStatus('SKIP') === 'Closed · Did not apply' && stageLabelForStatus('Responded') === 'Interviewing')
check('journey order puts offers first and closed last', STAGE_ORDER[stageForStatus('Offer').stage] < STAGE_ORDER[stageForStatus('Interview').stage] && STAGE_ORDER[stageForStatus('Applied').stage] < STAGE_ORDER[stageForStatus('Preparing').stage] && STAGE_ORDER[stageForStatus('Rejected').stage] === 4)

if (failures) {
  console.log(`\n${failures} needs-you check(s) failed`)
  process.exit(1)
}
console.log('all needs-you checks passed')
