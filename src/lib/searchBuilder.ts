export type Platform = 'linkedin' | 'indeed'
export type Workplace = 'onsite' | 'hybrid' | 'remote'
export type Experience = 'internship' | 'entry' | 'associate' | 'mid' | 'director' | 'executive'
export type Sort = 'recent' | 'relevant'

export type SearchFilters = {
  platform: Platform
  titles: string[]
  exclude: string[]
  location: string
  workplace: Workplace[]
  postedDays: number | null
  sort: Sort
  experience: Experience[]
  indeedSite: string
}

export const PLATFORMS: { value: Platform; label: string }[] = [
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'indeed', label: 'Indeed' },
]

export const WORKPLACES: { value: Workplace; label: string; code: string }[] = [
  { value: 'onsite', label: 'On-site', code: '1' },
  { value: 'hybrid', label: 'Hybrid', code: '3' },
  { value: 'remote', label: 'Remote', code: '2' },
]

export const EXPERIENCE_LEVELS: { value: Experience; label: string; code: string }[] = [
  { value: 'internship', label: 'Internship', code: '1' },
  { value: 'entry', label: 'Entry level', code: '2' },
  { value: 'associate', label: 'Associate', code: '3' },
  { value: 'mid', label: 'Mid-senior', code: '4' },
  { value: 'director', label: 'Director', code: '5' },
  { value: 'executive', label: 'Executive', code: '6' },
]

const POSTED: { days: number; label: string; platforms: Platform[] }[] = [
  { days: 1, label: 'Past 24 hours', platforms: ['linkedin', 'indeed'] },
  { days: 3, label: 'Past 3 days', platforms: ['linkedin', 'indeed'] },
  { days: 7, label: 'Past week', platforms: ['linkedin', 'indeed'] },
  { days: 14, label: 'Past 2 weeks', platforms: ['linkedin', 'indeed'] },
  { days: 30, label: 'Past month', platforms: ['linkedin'] },
]

export const INDEED_SITES: { value: string; label: string }[] = [
  { value: 'www', label: 'United States' },
  { value: 'be', label: 'Belgium' },
  { value: 'ca', label: 'Canada' },
  { value: 'fr', label: 'France' },
  { value: 'de', label: 'Germany' },
  { value: 'ie', label: 'Ireland' },
  { value: 'it', label: 'Italy' },
  { value: 'lu', label: 'Luxembourg' },
  { value: 'ma', label: 'Morocco' },
  { value: 'nl', label: 'Netherlands' },
  { value: 'pt', label: 'Portugal' },
  { value: 'es', label: 'Spain' },
  { value: 'ch', label: 'Switzerland' },
  { value: 'uk', label: 'United Kingdom' },
]

export function postedOptions(platform: Platform) {
  return POSTED.filter((option) => option.platforms.includes(platform))
}

export function defaultFilters(platform: Platform = 'linkedin'): SearchFilters {
  return { platform, titles: [], exclude: [], location: '', workplace: [], postedDays: null, sort: 'recent', experience: [], indeedSite: 'www' }
}

// Strict RFC 3986 encoding, so parentheses and quotes are escaped the way job boards emit them.
function encode(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => '%' + char.charCodeAt(0).toString(16).toUpperCase())
}

function query(params: [string, string][]) {
  return params.map(([key, value]) => `${key}=${encode(value)}`).join('&')
}

function phrase(term: string) {
  return `"${term.replace(/"/g, '')}"`
}

export function buildKeywords(filters: Pick<SearchFilters, 'platform' | 'titles' | 'exclude'>) {
  const titles = filters.titles.map(phrase)
  let keywords = titles.length > 1 ? `(${titles.join(' OR ')})` : titles[0] ?? ''
  for (const term of filters.exclude) keywords += filters.platform === 'linkedin' ? ` NOT ${phrase(term)}` : ` -${phrase(term)}`
  return keywords.trim()
}

export function buildSearchUrl(filters: SearchFilters) {
  const keywords = buildKeywords(filters)
  const location = filters.location.trim()
  if (filters.platform === 'linkedin') {
    const params: [string, string][] = [['keywords', keywords]]
    if (location) params.push(['location', location])
    const workplace = WORKPLACES.filter((item) => filters.workplace.includes(item.value)).map((item) => item.code).sort()
    if (workplace.length) params.push(['f_WT', workplace.join(',')])
    if (filters.postedDays) params.push(['f_TPR', `r${filters.postedDays * 86400}`])
    const experience = EXPERIENCE_LEVELS.filter((item) => filters.experience.includes(item.value)).map((item) => item.code)
    if (experience.length) params.push(['f_E', experience.join(',')])
    params.push(['sortBy', filters.sort === 'recent' ? 'DD' : 'R'])
    return `https://www.linkedin.com/jobs/search/?${query(params)}`
  }
  const params: [string, string][] = [['q', keywords]]
  if (location) params.push(['l', location])
  if (filters.postedDays) params.push(['fromage', String(filters.postedDays)])
  if (filters.sort === 'recent') params.push(['sort', 'date'])
  return `https://${filters.indeedSite}.indeed.com/jobs?${query(params)}`
}

function parseKeywords(keywords: string, platform: Platform) {
  const [include, ...rest] = platform === 'linkedin' ? keywords.split(/\s+NOT\s+/) : keywords.split(/\s+-(?=")/)
  const phrases = (text: string) => [...text.matchAll(/"([^"]+)"/g)].map((match) => match[1])
  return { titles: phrases(include), exclude: rest.flatMap(phrases) }
}

/** Reads a saved URL back into builder fields. Returns null unless rebuilding gives the exact same URL. */
export function parseSearchUrl(value: string): SearchFilters | null {
  let url: URL
  try { url = new URL(value) } catch { return null }
  const params = url.searchParams
  let filters: SearchFilters
  if (url.hostname === 'www.linkedin.com' && url.pathname === '/jobs/search/') {
    const days = Number(params.get('f_TPR')?.match(/^r(\d+)$/)?.[1]) / 86400
    const workplaceCodes = params.get('f_WT')?.split(',') ?? []
    const experienceCodes = params.get('f_E')?.split(',') ?? []
    filters = {
      ...defaultFilters('linkedin'),
      ...parseKeywords(params.get('keywords') ?? '', 'linkedin'),
      location: params.get('location') ?? '',
      workplace: WORKPLACES.filter((item) => workplaceCodes.includes(item.code)).map((item) => item.value),
      postedDays: Number.isInteger(days) && days > 0 ? days : null,
      sort: params.get('sortBy') === 'R' ? 'relevant' : 'recent',
      experience: EXPERIENCE_LEVELS.filter((item) => experienceCodes.includes(item.code)).map((item) => item.value),
    }
  } else {
    const site = url.hostname.match(/^([a-z]{2,3})\.indeed\.com$/)?.[1]
    if (!site || !INDEED_SITES.some((item) => item.value === site) || url.pathname !== '/jobs') return null
    const days = Number(params.get('fromage'))
    filters = {
      ...defaultFilters('indeed'),
      ...parseKeywords(params.get('q') ?? '', 'indeed'),
      location: params.get('l') ?? '',
      postedDays: Number.isInteger(days) && days > 0 ? days : null,
      sort: params.get('sort') === 'date' ? 'recent' : 'relevant',
      indeedSite: site,
    }
  }
  if (!filters.titles.length) return null
  return buildSearchUrl(filters) === value ? filters : null
}

function sentenceList(items: string[]) {
  if (items.length < 2) return items[0] ?? ''
  const list = `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
  return list.charAt(0) + list.slice(1).toLowerCase()
}

/** One-line description in the style of the hand-written notes, e.g. "Belgium · On-site and hybrid · Past 24 hours · Most recent." */
export function describeFilters(filters: SearchFilters) {
  const parts = [filters.location.trim() || (filters.platform === 'indeed' ? INDEED_SITES.find((item) => item.value === filters.indeedSite)?.label ?? '' : 'Any location')]
  if (filters.platform === 'linkedin') {
    parts.push(sentenceList(WORKPLACES.filter((item) => filters.workplace.includes(item.value)).map((item) => item.label)))
    parts.push(sentenceList(EXPERIENCE_LEVELS.filter((item) => filters.experience.includes(item.value)).map((item) => item.label)))
  }
  parts.push(POSTED.find((option) => option.days === filters.postedDays)?.label ?? '')
  parts.push(filters.sort === 'recent' ? 'Most recent' : 'Most relevant')
  return parts.filter(Boolean).join(' · ') + '.'
}
