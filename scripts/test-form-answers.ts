import { answerAgentPrompt, formAnswersSchema, fromMarkdownAnswers, isAnswered, newFormAnswer, overLimit, toApplicationAnswers } from '../src/lib/formAnswers'
import { parseAnswers } from '../src/lib/applicationAnswers'

let failed = 0
function check(name: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : `\n       ${detail}`}`)
  if (!ok) failed++
}

console.log('form answers')

const imported = fromMarkdownAnswers(parseAnswers('# Acme\n\n## Why Acme?\n\nBecause.\n\n(Cut a line.)\n'))
check('a markdown file imports as one answer per question, notes kept', imported.length === 1 && imported[0].answer === 'Because.' && imported[0].note === 'Cut a line.' && !!imported[0].id)

const entry = { ...newFormAnswer('Notice period?'), answer: 'One month.', limit: 5 }
check('an answer longer than its limit is flagged', overLimit(entry) && !overLimit({ ...entry, limit: null }))
check('a question without an answer is not answered', !isAnswered(newFormAnswer('Why?')) && isAnswered(entry))
check('only answered questions reach the sent page', toApplicationAnswers([entry, newFormAnswer('Empty?')]).answers.length === 1)

check('the stored shape is validated', formAnswersSchema.safeParse([entry]).success && !formAnswersSchema.safeParse([{ ...entry, id: '' }]).success)
const defaults = formAnswersSchema.parse([{ id: 'a', question: 'Q', answer: '' }])
check('limit and note default when absent', defaults[0].limit === null && defaults[0].note === '')

const prompt = answerAgentPrompt({ skill: 'SKILL', humanizer: null, company: 'Acme', role: 'ML Engineer', language: 'English', resumeYaml: 'cv: {}', masterYaml: null, guidance: '', jd: null, coverLetter: null, questions: [entry], focus: entry.id, conversation: [], message: 'Shorter.' })
check('the prompt carries the question id, limit and focus', prompt.includes(`### ${entry.id}`) && prompt.includes('Character limit: 5') && prompt.includes(`working on question ${entry.id}`))

if (failed) { console.error(`\n${failed} form answers check(s) failed`); process.exit(1) }
console.log('all form answers checks passed')
