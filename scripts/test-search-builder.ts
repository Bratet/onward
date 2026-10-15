import assert from 'node:assert/strict'
import { buildSearchUrl, defaultFilters, describeFilters, parseSearchUrl } from '../src/lib/searchBuilder'

const belgium = 'https://www.linkedin.com/jobs/search/?keywords=%28%22machine%20learning%20engineer%22%20OR%20%22AI%20engineer%22%20OR%20%22ML%20engineer%22%20OR%20%22data%20scientist%22%29&location=Belgium&f_WT=1%2C3&f_TPR=r86400&sortBy=DD'
const parsed = parseSearchUrl(belgium)
assert.ok(parsed, 'Hand-made LinkedIn searches open in the builder')
assert.deepEqual(parsed.titles, ['machine learning engineer', 'AI engineer', 'ML engineer', 'data scientist'])
assert.deepEqual(parsed.workplace, ['onsite', 'hybrid'])
assert.equal(parsed.postedDays, 1)
assert.equal(buildSearchUrl(parsed), belgium, 'Rebuilding leaves the URL byte-identical')
assert.equal(describeFilters(parsed), 'Belgium · On-site and hybrid · Past 24 hours · Most recent.')

const linkedin = { ...defaultFilters(), titles: ['AI engineer'], exclude: ['senior', 'lead'], workplace: ['remote' as const], experience: ['entry' as const, 'associate' as const], postedDays: 7, sort: 'relevant' as const }
const linkedinUrl = buildSearchUrl(linkedin)
assert.equal(linkedinUrl, 'https://www.linkedin.com/jobs/search/?keywords=%22AI%20engineer%22%20NOT%20%22senior%22%20NOT%20%22lead%22&f_WT=2&f_TPR=r604800&f_E=2%2C3&sortBy=R')
assert.deepEqual(parseSearchUrl(linkedinUrl), linkedin)
assert.equal(describeFilters(linkedin), 'Any location · Remote · Entry level and associate · Past week · Most relevant.')

const indeed = { ...defaultFilters('indeed'), titles: ['data scientist', 'ML engineer'], exclude: ['intern'], location: 'Bruxelles', postedDays: 3, indeedSite: 'be' }
const indeedUrl = buildSearchUrl(indeed)
assert.equal(indeedUrl, 'https://be.indeed.com/jobs?q=%28%22data%20scientist%22%20OR%20%22ML%20engineer%22%29%20-%22intern%22&l=Bruxelles&fromage=3&sort=date')
assert.deepEqual(parseSearchUrl(indeedUrl), indeed)

for (const url of [
  'https://www.linkedin.com/jobs/search/?keywords=AI%20OR%20ML&f_WT=2',
  belgium + '&geoId=100565514',
  'https://www.welcometothejungle.com/fr/jobs?query=ai',
  'https://xx.indeed.com/jobs?q=%22AI%22',
  'not a url',
]) assert.equal(parseSearchUrl(url), null, `Keep ${url} as a pasted URL`)

console.log('search builder: LinkedIn and Indeed building, exact round-trips, summaries and pasted-URL fallback passed')
