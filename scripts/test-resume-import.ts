import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { parse } from 'yaml'
import { PATHS } from '../src/lib/paths'
import { checkContent } from '../src/lib/validate'
import {
  blankResumeYaml, designBlock, importedResumeParser, importSummary, importedResumeYaml, type ImportedResume,
} from '../src/lib/resumeImport'

const design = designBlock(await readFile(PATHS.tailoredDesign, 'utf-8'))

const resume: ImportedResume = importedResumeParser.parse({
  language: 'en',
  headline: 'Data Engineer',
  email: 'sam@example.com',
  phone: '0612345678',
  website: 'example.com',
  profiles: [
    { network: 'LinkedIn', username: 'https://www.linkedin.com/in/sam-rivera/' },
    { network: 'GitHub', username: 'sam rivera' },
  ],
  summary: 'Builds data pipelines — mostly batch,  some streaming.',
  experience: [
    { company: 'Example Co', position: 'Data Engineer', start_date: '2022-03', end_date: 'Present', highlights: ['Moved **12** jobs to Airflow.', ' '] },
    { company: 'Example Labs', position: 'Intern', start_date: 'Summer 2021', end_date: null, highlights: [] },
  ],
  education: [{ institution: 'Example University', area: 'Computer Science', degree: 'BSc', start_date: '2018', end_date: '2021', highlights: [] }],
  projects: [{ name: 'Example Tool', date: null, highlights: ['Wrote a CLI.'] }],
  skills: [{ label: 'Languages', details: 'Python, SQL' }, { label: '', details: '' }],
  other: [{ title: 'Languages', items: ['English, French'] }, { title: 'Certifications', items: ['Example Cert'] }],
})

const yaml = importedResumeYaml(resume, 'Sam Rivera', design)
const doc = parse(yaml)
const cv = doc.cv

// The name is the one the user typed at setup; contact details come from the resume.
assert.equal(cv.name, 'Sam Rivera')
assert.equal(cv.email, 'sam@example.com')
assert.equal(cv.website, 'https://example.com/')
// RenderCV cannot format a number without a country code, so it is left out.
assert.equal(cv.phone, undefined)
// Profile URLs become usernames; anything still unusable is dropped.
assert.deepEqual(cv.social_networks, [{ network: 'LinkedIn', username: 'sam-rivera' }])

assert.deepEqual(Object.keys(cv.sections), ['Summary', 'Experience', 'Projects', 'Skills', 'Education', 'Languages', 'Certifications'])
assert.equal(cv.sections.Summary[0], 'Builds data pipelines, mostly batch, some streaming.')
assert.deepEqual(cv.sections.Experience[0], { company: 'Example Co', position: 'Data Engineer', start_date: '2022-03', end_date: 'present', highlights: ['Moved **12** jobs to Airflow.'] })
// A date RenderCV cannot read goes in the free-text field rather than breaking the render.
assert.deepEqual(cv.sections.Experience[1], { company: 'Example Labs', position: 'Intern', date: 'Summer 2021' })
assert.deepEqual(cv.sections.Skills, [{ label: 'Languages', details: 'Python, SQL' }])
assert.deepEqual(cv.sections.Certifications, [{ bullet: 'Example Cert' }])

// The result passes the rules every master is held to: design block, no location, no em dash.
assert.deepEqual((await checkContent(yaml, 'master')).failures, [])
assert.deepEqual((await checkContent(yaml, 'general')).failures, [])

// French resumes get the French section names the app uses.
const french = parse(importedResumeYaml({ ...resume, language: 'fr' }, 'Sam Rivera', design)).cv.sections
assert.deepEqual(Object.keys(french).slice(0, 5), ['Résumé', 'Expérience', 'Projets', 'Compétences', 'Formation'])

// Without an email on the resume, the fallback is used.
assert.equal(parse(importedResumeYaml({ ...resume, email: 'not an email' }, 'Sam Rivera', design, 'me@example.com')).cv.email, 'me@example.com')

assert.deepEqual(importSummary(resume), {
  language: 'en', roles: 2, bullets: 2, education: 1, projects: 1, skills: 2, other: ['Languages', 'Certifications'],
})

const blank = blankResumeYaml('Sam Rivera', design)
assert.deepEqual(parse(blank).cv, { name: 'Sam Rivera' })
assert.deepEqual((await checkContent(blank, 'master')).failures, [])

// The model's answer is checked before anything is built from it.
assert.equal(importedResumeParser.safeParse({ ...resume, language: 'de' }).success, false)
assert.equal(importedResumeParser.safeParse({ ...resume, profiles: [{ network: 'MySpace', username: 'x' }] }).success, false)

console.log('resume import ok')
