import assert from 'node:assert/strict'
import { applicationPhase, applicationStanding, phaseStep, wasSent } from '../src/lib/applicationPhase'

// Two phases: Applying until the company answers, Interviewing after it does.
for (const status of ['Evaluated', '', 'Preparing', 'Applied', 'Discarded', 'SKIP']) assert.equal(applicationPhase(status), 'applying')
for (const status of ['Responded', 'Interview', 'Offer']) assert.equal(applicationPhase(status), 'interviewing')
// A rejection lands in the phase it ended in: on the application, or after interviews.
assert.equal(applicationPhase('Rejected'), 'applying')
assert.equal(applicationPhase('Rejected', true), 'interviewing')
assert.equal(applicationPhase('Applied', true), 'applying')

// Inside a phase, the standing follows the tracker status; only real sends count as sent.
assert.equal(applicationStanding('Evaluated'), 'prepare')
assert.equal(applicationStanding(''), 'prepare')
assert.equal(applicationStanding('Applied'), 'waiting')
assert.equal(applicationStanding('Responded'), 'talking')
assert.equal(applicationStanding('Interview'), 'interview')
assert.equal(applicationStanding('Offer'), 'offer')
for (const status of ['Rejected', 'Discarded', 'SKIP']) assert.equal(applicationStanding(status), 'closed')
assert.equal(wasSent('Rejected'), true)
assert.equal(wasSent('Discarded'), false)
assert.equal(wasSent('Preparing'), false)
assert.equal(phaseStep('prepare'), 0)
assert.equal(phaseStep('waiting'), 1)
assert.equal(phaseStep('talking'), 0)
assert.equal(phaseStep('offer'), 1)
assert.equal(phaseStep('closed'), -1)

console.log('Application phase: phases, standings and sent statuses pass')
