import assert from 'node:assert/strict'
import { applicationPhase, journeyIndex, wasSent } from '../src/lib/applicationPhase'
import {
  applyInterviewPatch, emptyInterviewState, interviewPackSchema, interviewPatchSchema, nextRound, PREP_CHECKLIST, prepProgress,
  type InterviewPack,
} from '../src/lib/interviewPrep'

// Phases follow the tracker status; only real sends count as sent.
assert.equal(applicationPhase('Evaluated'), 'prepare')
assert.equal(applicationPhase(''), 'prepare')
assert.equal(applicationPhase('Applied'), 'waiting')
assert.equal(applicationPhase('Responded'), 'talking')
assert.equal(applicationPhase('Interview'), 'interview')
assert.equal(applicationPhase('Offer'), 'offer')
for (const status of ['Rejected', 'Discarded', 'SKIP']) assert.equal(applicationPhase(status), 'closed')
assert.equal(wasSent('Rejected'), true)
assert.equal(wasSent('Discarded'), false)
assert.equal(wasSent('Preparing'), false)
assert.equal(journeyIndex('Evaluated'), 0)
assert.equal(journeyIndex('Interview'), 3)
assert.equal(journeyIndex('Rejected'), -1)

const pack: InterviewPack = {
  pitch: 'I build production AI systems.',
  questions: ['a', 'b', 'c', 'd'].map((id) => ({ id, category: 'technical' as const, question: `Question ${id}?`, why: 'The posting asks.', answer: ['A real project.'] })),
  stories: [], gaps: [], askThem: ['What is hard right now?'], refresh: [],
}
assert.ok(interviewPackSchema.safeParse(pack).success)
// A pack needs at least four questions and something to ask them.
assert.ok(!interviewPackSchema.safeParse({ ...pack, questions: pack.questions.slice(0, 3) }).success)
assert.ok(!interviewPackSchema.safeParse({ ...pack, askThem: [] }).success)
assert.ok(!interviewPackSchema.safeParse({ ...pack, questions: [{ ...pack.questions[0], category: 'trivia' }, ...pack.questions.slice(1)] }).success)

// Progress weights practice and the checklist equally; shaky counts half.
const base = { ...emptyInterviewState(), pack }
assert.deepEqual(prepProgress(emptyInterviewState()), { practiced: 0, solid: 0, total: 0, checklist: 0, checklistTotal: PREP_CHECKLIST.length, percent: 0 })
const rated = applyInterviewPatch(base, { ratings: { a: 'solid', b: 'shaky' } })
assert.equal(prepProgress(rated).practiced, 2)
assert.equal(prepProgress(rated).solid, 1)
assert.equal(prepProgress(rated).percent, Math.round(((1 + 0.5) / 4) * 50))
const allDone = applyInterviewPatch(rated, {
  ratings: { b: 'solid', c: 'solid', d: 'solid' },
  checklist: Object.fromEntries(PREP_CHECKLIST.map((item) => [item.id, true])),
})
assert.equal(prepProgress(allDone).percent, 100)

// null clears a rating; empty answers are dropped; other fields are left alone.
const cleared = applyInterviewPatch(allDone, { ratings: { a: null, b: null }, answers: { a: 'My answer', b: '   ' } })
assert.deepEqual(Object.keys(cleared.ratings).sort(), ['c', 'd'])
assert.deepEqual(cleared.answers, { a: 'My answer' })
assert.equal(cleared.pack, pack)
assert.equal(prepProgress(cleared).checklist, PREP_CHECKLIST.length)

// Rounds are kept in date order, and the next one is the first on or after today.
const rounds = applyInterviewPatch(base, { rounds: [
  { id: 'r2', date: '2026-10-22T14:00', kind: 'Technical', with: '', notes: '' },
  { id: 'r1', date: '2026-10-16', kind: 'Recruiter screen', with: 'Sam', notes: '' },
] }).rounds
assert.deepEqual(rounds.map((round) => round.id), ['r1', 'r2'])
assert.equal(nextRound(rounds, '2026-10-15')?.id, 'r1')
assert.equal(nextRound(rounds, '2026-10-16')?.id, 'r1')
assert.equal(nextRound(rounds, '2026-10-17')?.id, 'r2')
assert.equal(nextRound(rounds, '2026-10-23'), null)

// The patch schema rejects the pack itself, unknown keys, and malformed rounds.
assert.ok(!interviewPatchSchema.safeParse({ pack }).success)
assert.ok(!interviewPatchSchema.safeParse({ ratings: { a: 'great' } }).success)
assert.ok(!interviewPatchSchema.safeParse({ rounds: [{ id: 'x', date: 'next tuesday', kind: 'Technical' }] }).success)
assert.ok(interviewPatchSchema.safeParse({ rounds: [{ id: 'x', date: '2026-10-20', kind: 'Technical' }] }).success)

console.log('Interview prep: phases, pack schema, progress, rating resets, rounds order and patch validation pass')
