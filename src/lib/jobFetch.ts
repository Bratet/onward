/**
 * Fetch a job posting from its URL so the candidate can skip copy-pasting.
 *
 * LinkedIn goes through its public guest endpoint (no login, no browser): the
 * candidate's own LinkedIn session is never touched, which would risk the
 * account. Other sites are read from their schema.org JobPosting data, which
 * most career pages publish for search engines, with the page text as a
 * fallback. Indeed blocks automated requests outright, so it gets a clear
 * "paste it" message instead of a confusing failure.
 */

export interface FetchedPosting {
  /** Plain text ready for the analysis step. */
  text: string
  /** The canonical posting URL, stored on line 1 of jd.md. */
  url: string
  source: 'linkedin' | 'structured-data' | 'page-text'
}

export class JobFetchError extends Error {}

const HEADERS = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  accept: 'text/html,application/xhtml+xml',
  'accept-language': 'en-US,en;q=0.9,fr;q=0.8',
}

/** The job id in any LinkedIn job link: search pages, view pages, or the guest endpoint. */
export function linkedinJobId(raw: string): string | null {
  let url: URL
  try { url = new URL(raw) } catch { return null }
  if (!/(^|\.)linkedin\.com$/.test(url.hostname)) return null
  const param = url.searchParams.get('currentJobId')
  if (param && /^\d+$/.test(param)) return param
  const path = url.pathname.match(/\/jobs\/view\/(?:[^/]*?-)?(\d{6,})\/?$/) ?? url.pathname.match(/\/jobPosting\/(\d+)\/?$/)
  return path ? path[1] : null
}

export async function fetchPosting(raw: string, signal?: AbortSignal): Promise<FetchedPosting> {
  let url: URL
  try { url = new URL(raw.trim()) } catch { throw new JobFetchError('That is not a valid URL.') }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new JobFetchError('Only http and https links can be fetched.')

  if (/(^|\.)linkedin\.com$/.test(url.hostname)) {
    const id = linkedinJobId(url.href)
    if (!id) throw new JobFetchError('This LinkedIn link has no job id. Open the job and copy its link, or a search link with currentJobId=… in it.')
    const html = await get(`https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${id}`, signal, 'LinkedIn')
    return { text: parseLinkedinPosting(html), url: `https://www.linkedin.com/jobs/view/${id}/`, source: 'linkedin' }
  }

  if (/(^|\.)indeed\./.test(url.hostname)) {
    throw new JobFetchError('Indeed blocks automated requests, so this link cannot be fetched. Paste the job description instead.')
  }

  const html = await get(url.href, signal, url.hostname)
  const structured = parseJsonLdPosting(html)
  if (structured) return { text: structured, url: url.href, source: 'structured-data' }
  const text = pageText(html)
  if (text.length < 500) {
    throw new JobFetchError('This page loads the posting with JavaScript, so it cannot be read from the link. Paste the job description instead.')
  }
  return { text, url: url.href, source: 'page-text' }
}

async function get(url: string, signal: AbortSignal | undefined, site: string): Promise<string> {
  // LinkedIn answers the occasional burst with a 429 challenge page that clears within seconds.
  for (let attempt = 0; attempt < 3; attempt++) {
    let response: Response
    try {
      const timeout = AbortSignal.timeout(20_000)
      response = await fetch(url, { headers: HEADERS, redirect: 'follow', signal: signal ? AbortSignal.any([signal, timeout]) : timeout })
    } catch (error) {
      if (signal?.aborted) throw error
      throw new JobFetchError(`Could not reach ${site}. Check the link or your connection.`)
    }
    if (response.ok) return response.text()
    if (response.status === 429 && attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 2_000 * (attempt + 1)))
      continue
    }
    if (response.status === 404 || response.status === 410) throw new JobFetchError(`${site} says this posting no longer exists.`)
    if (response.status === 429) throw new JobFetchError(`${site} is rate-limiting requests right now. Try again in a minute, or paste the job description.`)
    throw new JobFetchError(`${site} refused the request (HTTP ${response.status}). Paste the job description instead.`)
  }
  throw new JobFetchError(`${site} did not return the posting.`)
}

/** Title, company, location, criteria, and description from LinkedIn's guest job page. */
export function parseLinkedinPosting(html: string): string {
  const title = textOf(html.match(/<h2[^>]*top-card-layout__title[^>]*>([\s\S]*?)<\/h2>/)?.[1])
  const company = textOf(html.match(/<a[^>]*topcard__org-name-link[^>]*>([\s\S]*?)<\/a>/)?.[1])
  const location = textOf(html.match(/<span[^>]*topcard__flavor--bullet[^>]*>([\s\S]*?)<\/span>/)?.[1])
  const description = html.match(/<div[^>]*show-more-less-html__markup[^>]*>([\s\S]*?)<\/div>/)?.[1]
  if (!description) throw new JobFetchError('LinkedIn returned the page without a job description. The posting may be closed; paste the description instead.')

  const criteria: string[] = []
  const pattern = /description__job-criteria-subheader[^>]*>([\s\S]*?)<\/h3>[\s\S]*?description__job-criteria-text[^>]*>([\s\S]*?)<\/span>/g
  for (const match of html.matchAll(pattern)) criteria.push(`${textOf(match[1])}: ${textOf(match[2])}`)

  return [
    title,
    [company, location].filter(Boolean).join(' · '),
    criteria.join('\n'),
    htmlToText(description),
  ].filter(Boolean).join('\n\n')
}

/** A schema.org JobPosting, as most career sites embed it for search engines. */
export function parseJsonLdPosting(html: string): string | null {
  for (const match of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let data: unknown
    try { data = JSON.parse(match[1].trim()) } catch { continue }
    const posting = findJobPosting(data)
    if (!posting) continue
    const description = typeof posting.description === 'string' ? htmlToText(decodeEntities(posting.description)) : ''
    if (description.length < 100) continue
    const org = posting.hiringOrganization as Record<string, unknown> | undefined
    const places = [posting.jobLocation].flat().map((place) => {
      const address = (place as Record<string, unknown> | undefined)?.address as Record<string, unknown> | undefined
      return [address?.addressLocality, address?.addressRegion, address?.addressCountry].filter((part) => typeof part === 'string').join(', ')
    }).filter(Boolean)
    return [
      typeof posting.title === 'string' ? decodeEntities(posting.title) : '',
      [typeof org?.name === 'string' ? org.name : '', places.join(' / '), posting.jobLocationType === 'TELECOMMUTE' ? 'Remote' : ''].filter(Boolean).join(' · '),
      description,
    ].filter(Boolean).join('\n\n')
  }
  return null
}

function findJobPosting(data: unknown): Record<string, unknown> | null {
  if (Array.isArray(data)) {
    for (const item of data) {
      const found = findJobPosting(item)
      if (found) return found
    }
    return null
  }
  if (!data || typeof data !== 'object') return null
  const record = data as Record<string, unknown>
  const type = record['@type']
  if (type === 'JobPosting' || (Array.isArray(type) && type.includes('JobPosting'))) return record
  return record['@graph'] ? findJobPosting(record['@graph']) : null
}

/** The readable text of a whole page, minus scripts, styles and site chrome. */
export function pageText(html: string): string {
  const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? html
  const main = body.match(/<main[^>]*>([\s\S]*?)<\/main>/i)?.[1] ?? body
  return htmlToText(main.replace(/<(script|style|noscript|svg|nav|header|footer)[^>]*>[\s\S]*?<\/\1>/gi, ''))
}

/** HTML to plain text that keeps paragraphs and list items readable. */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<li[^>]*>/gi, '\n- ')
      .replace(/<\/(p|div|ul|ol|h[1-6]|section|article|tr)>/gi, '\n\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function textOf(html: string | undefined): string {
  return html ? htmlToText(html).replace(/\s+/g, ' ').trim() : ''
}

function decodeEntities(text: string): string {
  const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
    if (code[0] === '#') {
      const point = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
      return Number.isFinite(point) ? String.fromCodePoint(point) : entity
    }
    return named[code.toLowerCase()] ?? entity
  })
}
