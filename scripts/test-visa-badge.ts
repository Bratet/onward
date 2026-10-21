import { jevRequest, parseJevResponse, JEV_MODEL } from '../extension/visa-badge/lib/jev'
import { cleanDescription, guestPostingUrl, isAboutHeading, jobIdFromUrl, textKey } from '../extension/visa-badge/lib/linkedin'

let failures = 0
function check(name: string, condition: boolean, detail = '') {
  if (condition) console.log(`  ok   ${name}`)
  else {
    failures++
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

console.log('visa badge: jev request')

const request = jevRequest({ header: 'h'.repeat(1000), description: 'x'.repeat(50_000) })
check('targets pinned Jev on OpenRouter', request.model === 'typesafe/jev-1.13' && JEV_MODEL === request.model)
check('state carries header and description, capped',
  request.state.posting_header.length === 600 && request.state.job_description.length === 40_000)
check('asks only about sponsorship', Object.keys(request.questions).join() === 'sponsorship')
check('sponsorship is a four-way choice',
  request.questions.sponsorship.type === 'choice'
  && Object.keys(request.questions.sponsorship.criteria).join() === 'yes,no,likely_no,unknown')
check('questions stay small (billed as input)', JSON.stringify(request.questions).length < 1400,
  `${JSON.stringify(request.questions).length} chars`)

console.log('visa badge: jev response')

const sponsorshipAnswer = (sponsorship: unknown) => ({ answers: { sponsorship } })

// OpenRouter adds id, provider, and usage.cost to TypeSafe's response shape.
const { verdict, usage } = parseJevResponse({
  id: 'gen-123',
  provider: 'TypeSafe',
  model: 'typesafe/jev-1.13',
  answers: {
    sponsorship: {
      type: 'choice',
      choice: 'likely_no',
      probabilities: { yes: 0.05, no: 0.15, likely_no: 0.77, unknown: 0.03 },
      confidence: 0.77,
    },
  },
  usage: { input_tokens: 512, output_tokens: 40, cost: 0.0000215 },
})
check('maps likely_no to likely-no', verdict.visa.label === 'likely-no' && verdict.visa.confidence === 0.77)
check('maps probabilities to labels',
  verdict.visa.probabilities['likely-no'] === 0.77)
check('reads usage', usage.model === 'typesafe/jev-1.13' && usage.provider === 'TypeSafe' && usage.inputTokens === 512 && usage.cost === 0.0000215)
check('tolerates missing usage', parseJevResponse(sponsorshipAnswer({ choice: 'no', confidence: 0.9 })).usage.cost === undefined)
check('accepts a sponsorship-only response', parseJevResponse(sponsorshipAnswer({ choice: 'yes', confidence: 0.9 })).verdict.visa.label === 'yes')

for (const [name, body] of [
  ['missing answers', {}],
  ['missing sponsorship answer', { answers: {} }],
  ['unknown visa choice', sponsorshipAnswer({ choice: 'maybe', confidence: 0.9 })],
  ['missing confidence', sponsorshipAnswer({ choice: 'yes' })],
  ['error body', { error: { message: 'Missing Authentication header', code: 401 } }],
  ['null body', null],
] as const) {
  let rejected = false
  try { parseJevResponse(body) } catch { rejected = true }
  check(`rejects ${name}`, rejected)
}

console.log('visa badge: linkedin helpers')

check('job id from search list', jobIdFromUrl('https://www.linkedin.com/jobs/search/?currentJobId=4012345678&keywords=ml') === '4012345678')
check('job id from collections', jobIdFromUrl('https://www.linkedin.com/jobs/collections/recommended/?currentJobId=4099') === '4099')
check('job id from view page', jobIdFromUrl('https://www.linkedin.com/jobs/view/4012345678/') === '4012345678')
check('job id from slugged view page', jobIdFromUrl('https://www.linkedin.com/jobs/view/ml-engineer-at-acme-4012345678') === '4012345678')
check('no job id on jobs home', jobIdFromUrl('https://www.linkedin.com/jobs/') === null)
check('job id from AI search results', jobIdFromUrl('https://www.linkedin.com/jobs/search-results/?currentJobId=4423662270&keywords=AI%20engineer%20Visa&origin=BLENDED_SEARCH_RESULT_NAVIGATION_JOB_CARD') === '4423662270')
check('guest posting url', guestPostingUrl('4423662270') === 'https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/4423662270')
check('about heading in English', isAboutHeading('  About the job\n'))
check('about heading in French', isAboutHeading('À propos de l’offre d’emploi'))
check('other headings are not the description', !isAboutHeading('About the company') && !isAboutHeading('About the job and more'))
check('non-numeric currentJobId ignored', jobIdFromUrl('https://www.linkedin.com/jobs/search/?currentJobId=abc') === null)

check('description cleaned', cleanDescription('About the job\n\n  We   build ML.\n\n\n  Visa  sponsorship available.  ') === 'We build ML.\nVisa sponsorship available.')
check('cleaning keeps text without heading', cleanDescription('Hello  world') === 'Hello world')
check('text key is stable', textKey('same text') === textKey('same text'))
check('text key differs by content', textKey('posting a') !== textKey('posting b'))

if (failures) {
  console.log(`\n${failures} failure(s)`)
  process.exit(1)
}
console.log('\nall visa badge checks passed')
