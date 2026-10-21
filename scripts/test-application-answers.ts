import { parseAnswers } from '../src/lib/applicationAnswers'

let failed = 0
function check(name: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : `\n       ${detail}`}`)
  if (!ok) failed++
}

console.log('application answers')

const full = parseAnswers(`# Acme — application answers

Submitted 2026-10-06. Edited
before sending.

## Why Acme?

First line of the answer
wrapped by hand.

Second paragraph.

(Removed a generic sentence before sending.)

## Why consulting?

Because of the variety.
`)
check('the intro is kept, joined into one line', full.intro === 'Submitted 2026-10-06. Edited before sending.', JSON.stringify(full.intro))
check('one answer per ## section', full.answers.length === 2 && full.answers[1].question === 'Why consulting?')
check('paragraphs stay apart, wrapped lines join', full.answers[0].answer === 'First line of the answer wrapped by hand.\n\nSecond paragraph.', JSON.stringify(full.answers[0].answer))
check('a parenthesised paragraph is a note, not the answer', full.answers[0].notes[0] === 'Removed a generic sentence before sending.' && !full.answers[0].answer.includes('Removed'))

const bare = parseAnswers('# Title only\n\n## A question with no answer\n')
check('a question with no answer is left out', bare.answers.length === 0 && bare.intro === '')

const plain = parseAnswers('Just some notes, no sections.')
check('a file without sections has no answers', plain.answers.length === 0 && plain.intro === 'Just some notes, no sections.')

if (failed) { console.error(`\n${failed} application answers check(s) failed`); process.exit(1) }
console.log('all application answers checks passed')
