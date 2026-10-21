import {
  applyOperations, currentStep, describeOperation, initialJourney, journeyFocus, parseCompanionOutput, parseJourney, stageForStatus, statusForStage, stepProgress,
  type Journey,
} from '../src/lib/journey'

let failures = 0
function check(name: string, condition: boolean, detail = '') {
  if (condition) console.log(`  ok   ${name}`)
  else {
    failures++
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
}
const json = (value: unknown) => JSON.stringify(value)

console.log('journey')

const applied = initialJourney({ status: 'Applied', appliedAt: '2026-10-06T09:00:00Z', rounds: [] })
check('an applied row starts in Applied with the sent step', applied.stage === 'applied' && applied.steps.length === 1 && applied.steps[0].state === 'done', json(applied))
check('a rejected row starts closed as rejected', json(stageForStatus('Rejected')) === json({ stage: 'closed', outcome: 'rejected' }))
check('Responded folds into Interviewing', stageForStatus('Responded').stage === 'interviewing')

const fromRounds = initialJourney({ status: 'Interview', appliedAt: null, rounds: [{ id: 'r1', date: '2999-01-02', kind: 'Technical', with: 'Lead engineer', notes: '' }] })
check('existing interview rounds become booked steps', fromRounds.steps[0]?.state === 'booked' && fromRounds.steps[0].with === 'Lead engineer', json(fromRounds.steps))

const { journey: moved, notes } = applyOperations(applied, [
  { op: 'set_stage', stage: 'interviewing', outcome: null },
  { op: 'add_step', label: 'Intro call', date: '2026-10-14', with: '', state: 'passed' },
  { op: 'add_step', label: 'Technical interview', date: '2026-10-28T10:00', with: 'Lead engineer', state: 'booked' },
  { op: 'set_next_action', text: 'Confirm the slot', due: '2026-10-21' },
  { op: 'add_contact', name: 'Sam Doe', role: 'Recruiter', email: '' },
  { op: 'add_note', text: 'Passed the intro call.' },
])
check('stage moves', moved.stage === 'interviewing' && moved.outcome === null)
check('steps are added in date order', json(moved.steps.map((step) => step.label)) === json(['Application sent', 'Intro call', 'Technical interview']), json(moved.steps.map((step) => step.label)))
check('the current step is the booked one', currentStep(moved)?.label === 'Technical interview')
check('next action is set', moved.next?.text === 'Confirm the slot' && moved.next.due === '2026-10-21')
check('notes come back for the tracker, not the journey', json(notes) === json(['Passed the intro call.']) && !('pendingNotes' in moved))
check('applying does not mutate the original', applied.steps.length === 1 && applied.stage === 'applied')

const again = applyOperations(moved, [{ op: 'add_contact', name: 'sam doe', role: '', email: '' }, { op: 'add_step', label: 'Intro call', date: null, with: '', state: 'expected' }]).journey
check('a repeated contact is not duplicated', again.contacts.length === 1)
check('a repeated step label gets its own id', new Set(again.steps.map((step) => step.id)).size === again.steps.length, json(again.steps.map((step) => step.id)))

const passed = applyOperations(moved, [{ op: 'update_step', stepId: 'technical-interview', state: 'passed', date: null, with: null, notes: null }]).journey
check('update_step changes only what it names', passed.steps.find((step) => step.id === 'technical-interview')?.state === 'passed' && passed.steps.find((step) => step.id === 'technical-interview')?.with === 'Lead engineer')

let threw = false
try { applyOperations(moved, [{ op: 'update_step', stepId: 'nope', state: 'passed', date: null, with: null, notes: null }]) } catch { threw = true }
check('an unknown step id is rejected', threw)

const closed = applyOperations(moved, [{ op: 'set_stage', stage: 'closed', outcome: null }]).journey
check('closing without an outcome means rejected', closed.outcome === 'rejected')
check('reopening clears the outcome', applyOperations(closed, [{ op: 'set_stage', stage: 'interviewing', outcome: null }]).journey.outcome === null)

check('stages map back to tracker statuses', statusForStage('interviewing', null, 'Applied') === 'Interview' && statusForStage('closed', 'rejected', 'Interview') === 'Rejected' && statusForStage('closed', 'did-not-apply', 'SKIP') === 'SKIP' && statusForStage('preparing', null, 'Evaluated') === 'Preparing')

const output = parseCompanionOutput({
  reply: 'You passed the intro call.',
  question: '  ',
  items: [
    { op: 'set_stage', stage: 'interviewing', outcome: null, stepId: null, label: null, date: null, with: null, state: null, text: null, due: null, name: null, role: null, email: null, quote: 'we would like to invite you', basis: 'from-message', why: '' },
    { op: 'add_step', stage: null, outcome: null, stepId: null, label: 'Technical', date: 'next tuesday', with: null, state: 'booked', text: null, due: null, name: null, role: null, email: null, quote: '', basis: 'guessed', why: '' },
    { op: 'set_next_action', stage: null, outcome: null, stepId: null, label: null, date: null, with: null, state: null, text: null, due: null, name: null, role: null, email: null, quote: '', basis: 'guessed', why: '' },
  ],
})
check('valid model items become operations', output.items.length === 1 && output.items[0].operation.op === 'set_stage' && output.items[0].basis === 'from-message', json(output))
check('invalid dates and missing fields are dropped', output.dropped === 2)
check('a blank question is null', output.question === null)
check('garbage output is empty, not a crash', parseCompanionOutput('nonsense').items.length === 0)

check('operations read in plain words', describeOperation({ op: 'set_stage', stage: 'closed', outcome: 'no-reply' }, moved) === 'Close it: no reply' && describeOperation({ op: 'update_step', stepId: 'intro-call', state: 'passed', date: null, with: null, notes: null }, moved) === 'Intro call: passed')

const roundTrip = parseJourney(JSON.parse(json(moved)) as Journey)
check('a saved journey parses back', json(roundTrip?.steps) === json(moved.steps) && roundTrip?.stage === 'interviewing')
check('a corrupt journey is ignored', parseJourney({ stage: 'nowhere' }) === null)

const focus = journeyFocus(moved, '2026-10-20')
check('the Overview leads with the booked step ahead', focus?.kind === 'step' && focus.step.label === 'Technical interview', json(focus))
const afterInterview = journeyFocus(moved, '2026-10-29')
check('once the step is past it falls back to the next action, marked overdue', afterInterview?.kind === 'next' && afterInterview.overdue, json(afterInterview))
check('a fresh journey has no focus, so the status view stays', journeyFocus(applied, '2026-10-20') === null)
check('a closed journey has no focus', journeyFocus({ ...moved, stage: 'closed', outcome: 'rejected' }, '2026-10-20') === null)
check('steps finished are counted', json(stepProgress(moved)) === json({ finished: 2, total: 3 }), json(stepProgress(moved)))

if (failures) {
  console.log(`\n${failures} journey check(s) failed`)
  process.exit(1)
}
console.log('all journey checks passed')
