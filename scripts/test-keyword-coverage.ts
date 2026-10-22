import assert from 'node:assert/strict'
import { postingKeywordStatus } from '../src/lib/keywordCoverage'
import type { ProfileFitReport } from '../src/lib/profileFit'
import { addConfirmedSkills, explicitSkillConfirmations, reconcileConfirmedSkills } from '../src/lib/fitSkillSync'
import { parseProfileFit, profileFitPrompt, profileFitRefreshPrompt } from '../src/lib/profileFit'
import { jdAnalysisParser } from '../src/lib/tailoring/jd'
import type { KeywordMapping } from '../src/lib/skillTerms'
import { parse } from 'yaml'

const report: ProfileFitReport = {
  requirements: [
    { requirement: 'Experience with cloud services', weight: 'must', rank: 1, classification: 'direct', evidence: ['User-confirmed: cloud services on Azure'] },
    { requirement: 'Experience with object-oriented programming', weight: 'nice', rank: 2, classification: 'direct', evidence: ['User-confirmed: object-oriented programming'] },
    { requirement: 'Knowledge of Git', weight: 'nice', rank: 3, classification: 'direct', evidence: ['User-confirmed: Git in daily work'] },
    { requirement: 'Familiarity with VSCode and Jupyter', weight: 'nice', rank: 4, classification: 'direct', evidence: ['User-confirmed: Jupyter', 'User-confirmed: VS Code'] },
    { requirement: 'Experience with Databricks', weight: 'must', rank: 5, classification: 'gap', evidence: [] },
  ],
  coverage: { must: { evidenced: 1, total: 2 }, nice: { evidenced: 3, total: 3 } },
  verdict: 'Partial',
  keyGaps: [],
  recommendedEmphasis: [],
}

for (const word of ['cloud services', 'object-oriented programming', 'Git', 'VSCode', 'Jupyter']) {
  assert.equal(postingKeywordStatus(word, 'Python and Azure', report), 'backed', `${word} is confirmed but absent from resume wording`)
}
assert.equal(postingKeywordStatus('Git', 'Git, Python', report), 'inResume')
assert.equal(postingKeywordStatus('VSCode', 'VS Code and Python', report), 'inResume')
assert.equal(postingKeywordStatus('Databricks', 'Python', report), 'missing')
assert.equal(postingKeywordStatus('Git', 'GitHub Actions', null), 'missing', 'a substring cannot count as resume wording')
assert.equal(postingKeywordStatus('cloud services', 'Python', null), 'missing')
assert.equal(postingKeywordStatus('VSCode', 'Python', { ...report, requirements: report.requirements.map((row) => row.rank === 4 ? { ...row, evidence: ['User-confirmed: Jupyter'] } : row) }), 'missing', 'a shared requirement does not confirm every listed tool')

const evaluationReport: ProfileFitReport = {
  ...report,
  requirements: [
    { requirement: 'Apply Agile Scrum', weight: 'must', rank: 1, classification: 'direct', evidence: ['User-confirmed: Agile/Scrum used on projects'] },
    { requirement: 'AI observability and evaluation tooling (Arize Phoenix, LangSmith)', weight: 'must', rank: 2, classification: 'direct', evidence: ['User-confirmed: LangSmith used hands-on', 'Arize Phoenix is absent from the resume'] },
    { requirement: 'Experience with LlamaIndex and/or LangChain', weight: 'must', rank: 3, classification: 'direct', evidence: ['LangChain used to build a workflow', 'LlamaIndex does not appear in the resume'] },
  ],
}
assert.equal(postingKeywordStatus('Agile Scrum', 'Skills: Agile/Scrum', evaluationReport), 'inResume')
assert.equal(postingKeywordStatus('AI evaluation', 'Skills: AI and LLM evaluation', evaluationReport), 'inResume')
assert.equal(postingKeywordStatus('GenAI', 'Generative AI systems', evaluationReport), 'inResume')
assert.equal(postingKeywordStatus('AI observability', '', evaluationReport), 'backed', 'a direct concept with positive evidence is backed')
assert.equal(postingKeywordStatus('Arize Phoenix', '', evaluationReport), 'missing', 'negative evidence must not back a named tool')
assert.equal(postingKeywordStatus('LlamaIndex', '', evaluationReport), 'missing', 'an alternative tool does not back the absent one')
assert.equal(postingKeywordStatus('LangSmith', '', evaluationReport), 'backed')

const keywords = ['Git', 'LlamaIndex', 'LangChain', 'Arize Phoenix']
assert.deepEqual(explicitSkillConfirmations('Git is a skill I have and LlamaIndex AGAIN.', keywords), ['Git', 'LlamaIndex'])
assert.deepEqual(explicitSkillConfirmations('I have Git but not LlamaIndex.', keywords), ['Git'])
assert.deepEqual(explicitSkillConfirmations('Do I have Git?', keywords), [])
assert.deepEqual(explicitSkillConfirmations('I do not have Git, but I use LangChain.', keywords), ['LangChain'])
assert.deepEqual(explicitSkillConfirmations('I have no experience with LlamaIndex.', keywords), [])
assert.deepEqual(explicitSkillConfirmations('I have not worked with LlamaIndex.', keywords), [])

const skillYaml = 'cv:\n  name: Example Candidate\n  sections:\n    Skills:\n      - label: Generative AI & Agents\n        details: LangChain\n      - label: Engineering & MLOps\n        details: Python\n      - label: Languages\n        details: English\n'
const synced = reconcileConfirmedSkills('Git is a skill I have and LlamaIndex AGAIN.', keywords, {
  ...evaluationReport,
  requirements: [
    { requirement: 'Experience with LlamaIndex and/or LangChain', weight: 'must', rank: 1, classification: 'direct', evidence: ['LangChain used', 'LlamaIndex does not appear in the master'] },
    { requirement: 'Git version control', weight: 'must', rank: 2, classification: 'direct', evidence: ['User-confirmed: Git used hands-on'] },
  ],
  keyGaps: ['LlamaIndex is absent; do not claim it.', 'Arize Phoenix has no evidence.'],
}, skillYaml)
assert.equal(postingKeywordStatus('Git', synced.yaml, synced.report), 'inResume')
assert.equal(postingKeywordStatus('LlamaIndex', synced.yaml, synced.report), 'inResume')
assert.deepEqual(synced.report.keyGaps, ['Arize Phoenix has no evidence.'])
assert.equal(synced.report.requirements[0].evidence.some((line) => line.includes('does not appear')), false)
const skills = parse(synced.yaml).cv.sections.Skills
assert.match(skills[0].details, /LlamaIndex/)
assert.match(skills[1].details, /Git/)
assert.equal(reconcileConfirmedSkills('I have Git and LlamaIndex.', keywords, synced.report, synced.yaml).yaml, synced.yaml, 'a repeat confirmation does not duplicate Skills')

console.log('Posting keyword coverage separates resume wording, confirmed experience, and gaps')

for (const [keyword, wording] of [
  ['REST API', 'REST APIs (FastAPI)'],
  ['REST APIs', 'RESTful API'],
  ['prompt engineering', 'prompt and context engineering'],
  ['prompt engineering', 'Prompt & Context Engineering'],
  ['prompt engineering', 'prompt/context engineering'],
  ['RAG', 'Retrieval-Augmented Generation'],
  ['OOP', 'object oriented programming'],
  ['OAuth2', 'OAuth 2.0'],
  ['C#', 'C sharp'],
  ['C++', 'C plus plus'],
  ['VSCode', 'Visual Studio Code'],
  ['Microsoft 365', 'M365'],
  ['AI evaluation', 'AI & LLM evaluation'],
  ['cloud services', 'cloud\u00a0\u00a0services'],
]) assert.equal(postingKeywordStatus(keyword, wording, null), 'inResume', `${wording} includes ${keyword}`)

for (const [keyword, wording] of [
  ['REST API', 'FastAPI'],
  ['OAuth2', 'REST APIs (FastAPI)'],
  ['webhooks', 'REST APIs (FastAPI)'],
  ['document processing', 'OCR / Document AI'],
  ['Azure OpenAI', 'Azure'],
  ['C', 'C# and C++'],
  ['Java', 'JavaScript'],
  ['prompt and context engineering', 'prompt engineering'],
  ['AI and LLM evaluation', 'AI evaluation'],
]) assert.equal(postingKeywordStatus(keyword, wording, null), 'missing', `${wording} must not imply ${keyword}`)

assert.equal(postingKeywordStatus('Git', 'Skills: Git is not confirmed', null), 'missing')
assert.equal(postingKeywordStatus('n8n', 'No-code workflows with n8n', null), 'inResume')
assert.equal(postingKeywordStatus('Python', 'No OAuth2\nSkills: Python', null), 'inResume', 'negation cannot leak into another line')
assert.equal(postingKeywordStatus('REST API', 'REST\nAPIs', null), 'inResume', 'wrapped text still contains the phrase')
assert.deepEqual(explicitSkillConfirmations('I use REST APIs and prompt and context engineering.', ['REST API', 'prompt engineering']), ['REST API', 'prompt engineering'])
assert.deepEqual(explicitSkillConfirmations('I have no OAuth 2.0 or webhooks, but I use REST APIs.', ['OAuth2', 'webhooks', 'REST API']), ['REST API'])
assert.deepEqual(explicitSkillConfirmations('I use .NET and C#.', ['.NET', 'C#']), ['.NET', 'C#'])

const mappings: KeywordMapping[] = [
  { keyword: 'message-oriented middleware', equivalents: ['messaging middleware'], related: [] },
  { keyword: 'document processing', equivalents: [], related: ['OCR / Document AI'] },
  { keyword: 'REST API', equivalents: [], related: ['FastAPI'] },
]
const mappedReport: ProfileFitReport = {
  ...report,
  keywordMappings: mappings,
  requirements: [
    { requirement: 'Work with message-oriented middleware', weight: 'must', rank: 1, classification: 'direct', evidence: ['Built messaging middleware for event pipelines'] },
    { requirement: 'Deliver document processing workflows', weight: 'must', rank: 2, classification: 'direct', evidence: ['Delivered OCR / Document AI workflows'] },
    { requirement: 'Build integrations through REST API', weight: 'must', rank: 3, classification: 'direct', evidence: ['User-confirmed: deployed API services using FastAPI; no OAuth2 or webhooks'] },
  ],
}
assert.equal(postingKeywordStatus('message-oriented middleware', 'Skills: messaging middleware', mappedReport), 'inResume', 'contextual equivalents are reusable')
assert.equal(postingKeywordStatus('message-oriented middleware', 'Skills: messaging middleware', null), 'missing', 'a contextual mapping does not leak into other applications')
assert.equal(postingKeywordStatus('message-oriented middleware', 'Skills: Python', mappedReport), 'backed', 'an edit removing an equivalent removes resume coverage')
assert.equal(postingKeywordStatus('document processing', 'Skills: OCR / Document AI', mappedReport), 'backed', 'a related capability is not literal resume wording')
assert.equal(postingKeywordStatus('REST API', 'Skills: FastAPI', mappedReport), 'backed')
for (const term of ['OAuth2', 'webhooks']) assert.equal(postingKeywordStatus(term, 'Skills: FastAPI', mappedReport), 'missing', 'negated list members do not become evidence')
assert.equal(postingKeywordStatus('document processing', 'Skills: OCR / Document AI', { ...mappedReport, requirements: mappedReport.requirements.map((row) => ({ ...row, classification: 'supporting' })) }), 'missing', 'related evidence cannot upgrade a supporting assessment')
assert.equal(postingKeywordStatus('document processing', 'Skills: OCR / Document AI', { ...mappedReport, requirements: [{ ...mappedReport.requirements[1], requirement: 'Unrelated requirement' }] }), 'missing', 'related evidence must belong to the assessed concept')
assert.equal(postingKeywordStatus('document processing', '', { ...mappedReport, requirements: [{ ...mappedReport.requirements[1], evidence: ['OCR / Document AI is not confirmed'] }] }), 'missing')
assert.deepEqual(explicitSkillConfirmations('I use messaging middleware and FastAPI.', ['message-oriented middleware', 'REST API'], mappings), ['message-oriented middleware'], 'a subskill is not an explicit confirmation of its broader concept')

const equivalentYaml = skillYaml.replace('LangChain', 'prompt and context engineering').replace('Python', 'REST APIs, messaging middleware')
assert.equal(addConfirmedSkills(equivalentYaml, ['prompt engineering', 'REST API', 'message-oriented middleware'], mappedReport), equivalentYaml, 'recognized equivalents are not duplicated in Skills')

const analysis = jdAnalysisParser.parse({
  company: 'Example', role: 'Engineer', archetype: 'software', language: 'en', paperSize: 'a4',
  keywords: mappings.map((mapping) => mapping.keyword),
  requirements: mappedReport.requirements.map((row) => ({ text: row.requirement, weight: row.weight, rank: row.rank })),
})
const sources = 'Skills: messaging middleware, OCR / Document AI, FastAPI'
const parsed = parseProfileFit({
  ...mappedReport,
  keywordMappings: [
    ...mappings,
    { keyword: 'MESSAGE-ORIENTED MIDDLEWARE', equivalents: ['Messaging Middleware', 'Invented phrase'], related: [] },
    { keyword: 'document processing', equivalents: ['OCR / Document AI'], related: [] },
    { keyword: 'Invented keyword', equivalents: ['FastAPI'], related: [] },
  ],
}, analysis, sources)
assert.equal(parsed.keywordMappings?.length, 3, 'unknown keywords are removed and duplicates merged')
assert.deepEqual(parsed.keywordMappings?.[0], { keyword: 'message-oriented middleware', equivalents: ['Messaging Middleware'], related: [] }, 'equivalents must be grounded in the supplied sources')
assert.deepEqual(parsed.keywordMappings?.[1], mappings[1], 'a conflicting equivalent stays related')
assert.deepEqual(parseProfileFit(JSON.parse(JSON.stringify(parsed)), analysis, sources), parsed, 'mappings survive report serialization and chat validation')
assert.equal(parseProfileFit(report, analysis).keywordMappings, undefined, 'legacy reports remain supported')
assert.throws(() => parseProfileFit({ ...mappedReport, keywordMappings: [{ keyword: 'REST API', equivalents: [''], related: [] }] }, analysis), /too_small/)
assert.throws(() => parseProfileFit({ ...mappedReport, keywordMappings: [{ keyword: 'REST API', equivalents: Array(13).fill('FastAPI'), related: [] }] }, analysis), /too_big/)
const prompt = profileFitPrompt('JD {{JD_ANALYSIS}} CV {{MASTER_RESUME}}', analysis, sources)
assert.match(prompt, /keywordMappings/)
assert.match(prompt, /related: narrower/)
assert.match(profileFitRefreshPrompt('JD {{JD_ANALYSIS}} CV {{MASTER_RESUME}}', analysis, sources, '', parsed, null), /Messaging Middleware/)
const wordingPrompt = profileFitPrompt('JD {{JD_ANALYSIS}} CV {{MASTER_RESUME}}', analysis, sources, '', 'Skills: message routing')
assert.match(wordingPrompt, /Skills: message routing/)
assert.match(wordingPrompt, /wording reference for keywordMappings only/)

console.log('Keyword matching: wording variants, directional equivalents, grounded AI mappings, subskills, negation, persistence and duplicate prevention pass')
