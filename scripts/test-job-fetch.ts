import assert from 'node:assert/strict'
import { fetchPosting, htmlToText, JobFetchError, linkedinJobId, parseJsonLdPosting, parseLinkedinPosting } from '../src/lib/jobFetch'

// Job ids from every LinkedIn link shape.
assert.equal(linkedinJobId('https://www.linkedin.com/jobs/search/?currentJobId=4477578386&f_TPR=r259200&keywords=(%22ml%22)&location=Belgium'), '4477578386')
assert.equal(linkedinJobId('https://www.linkedin.com/jobs/view/4477578386/'), '4477578386')
assert.equal(linkedinJobId('https://be.linkedin.com/jobs/view/ml-engineer-eng-fr-at-acme-analytics-4477578386?trk=x'), '4477578386')
assert.equal(linkedinJobId('https://www.linkedin.com/jobs/collections/recommended/?currentJobId=123456789'), '123456789')
assert.equal(linkedinJobId('https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/4477578386'), '4477578386')
assert.equal(linkedinJobId('https://www.linkedin.com/jobs/search/?keywords=ml'), null)
assert.equal(linkedinJobId('https://evil-linkedin.com/jobs/view/4477578386/'), null)
assert.equal(linkedinJobId('not a url'), null)

// LinkedIn guest page.
const linkedin = `
<h2 class="top-card-layout__title topcard__title">ML Engineer - ENG/ FR</h2>
<a class="topcard__org-name-link topcard__flavor--black-link" href="#">
  Acme Analytics
</a>
<span class="topcard__flavor topcard__flavor--bullet">
  Liège, Walloon Region, Belgium
</span>
<div class="show-more-less-html__markup show-more-less-html__markup--clamp-after-5">
  Machine Learning Engineer<br><br><p><strong>Permanent contract</strong></p><ul><li>Python &amp; PyTorch</li><li>MLOps</li></ul>
</div>
<h3 class="description__job-criteria-subheader">
  Seniority level
</h3>
<span class="description__job-criteria-text description__job-criteria-text--criteria">
  Mid-Senior level
</span>`
const text = parseLinkedinPosting(linkedin)
assert.ok(text.startsWith('ML Engineer - ENG/ FR\n\nAcme Analytics · Liège, Walloon Region, Belgium'), text)
assert.ok(text.includes('Seniority level: Mid-Senior level'))
assert.ok(text.includes('- Python & PyTorch\n- MLOps'))
assert.throws(() => parseLinkedinPosting('<h2 class="top-card-layout__title">Closed</h2>'), JobFetchError)

// schema.org JobPosting, including @graph and escaped HTML descriptions.
const description = '&lt;p&gt;' + 'Build and ship ML models in production. '.repeat(5) + '&lt;/p&gt;'
const jsonLd = `<script type="application/ld+json">${JSON.stringify({
  '@context': 'https://schema.org',
  '@graph': [{ '@type': 'Organization', name: 'Acme' }, {
    '@type': 'JobPosting', title: 'Data Scientist', description,
    hiringOrganization: { name: 'Acme' }, jobLocation: { address: { addressLocality: 'Brussels', addressCountry: 'BE' } },
  }],
})}</script>`
const structured = parseJsonLdPosting(jsonLd)
assert.ok(structured?.startsWith('Data Scientist\n\nAcme · Brussels, BE\n\nBuild and ship ML models'), structured ?? 'null')
assert.equal(parseJsonLdPosting('<script type="application/ld+json">{not json</script>'), null)
assert.equal(parseJsonLdPosting('<p>no data</p>'), null)

assert.equal(htmlToText('a&nbsp;&#233;&#x2014;b<br>c'), 'a é—b\nc')

// Inputs rejected before any request is made.
for (const [url, message] of [
  ['ftp://example.com/job', /http and https/],
  ['nonsense', /valid URL/],
  ['https://www.linkedin.com/jobs/search/?keywords=ml', /no job id/],
  ['https://be.indeed.com/viewjob?jk=abc', /Indeed blocks/],
] as const) {
  await assert.rejects(fetchPosting(url), (error: Error) => error instanceof JobFetchError && message.test(error.message))
}

console.log('Job fetch: LinkedIn ids and pages, structured data, text cleanup, and rejected links pass')
