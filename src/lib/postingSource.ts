/**
 * jd.md keeps the posting's URL on line 1 (see tailoring/seed.ts jdMarkdown),
 * or a placeholder when none was given. Older folders wrote their own
 * placeholder ("Source URL: not provided; ..."). This splits that line from the
 * posting text so the page can link the original and show the text on its own.
 * Client-safe: no fs imports.
 */

export interface PostingSource {
  url: string | null
  /** "linkedin.com", for the link label. */
  host: string | null
  /** The posting text without the source line. */
  body: string
}

const URL_LINE = /^https?:\/\/\S+$/i
const PLACEHOLDER_LINE = /^(?:\(no source url given\)|source url:.*)$/i

export function parsePostingSource(jd: string | null | undefined): PostingSource {
  const text = (jd ?? '').replace(/\r\n/g, '\n')
  const lines = text.split('\n')
  const first = lines.findIndex((line) => line.trim() !== '')
  if (first === -1) return { url: null, host: null, body: '' }
  const line = lines[first].trim()
  const rest = lines.slice(first + 1).join('\n').trim()
  if (URL_LINE.test(line)) {
    const url = normalizePostingUrl(line)
    if (url) return { url, host: postingHost(url), body: rest }
  }
  if (PLACEHOLDER_LINE.test(line)) return { url: null, host: null, body: rest }
  return { url: null, host: null, body: text.trim() }
}

/** An http(s) URL, trimmed, or null for anything else (javascript:, mailto:, garbage). */
export function normalizePostingUrl(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const trimmed = input.trim()
  if (!trimmed || /\s/.test(trimmed)) return null
  try {
    const url = new URL(trimmed)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

export function postingHost(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

/**
 * The jd.md text with `url` on line 1: replaces an existing URL or placeholder
 * line, otherwise puts the URL above the posting. The posting text is untouched.
 */
export function withPostingUrl(jd: string, url: string): string {
  const normalized = normalizePostingUrl(url)
  if (!normalized) throw new Error('the posting link must be an http(s) URL')
  const text = jd.replace(/\r\n/g, '\n')
  const lines = text.split('\n')
  const first = lines.findIndex((line) => line.trim() !== '')
  if (first !== -1) {
    const line = lines[first].trim()
    if (URL_LINE.test(line) || PLACEHOLDER_LINE.test(line)) {
      return [...lines.slice(0, first), normalized, ...lines.slice(first + 1)].join('\n')
    }
  }
  return `${normalized}\n\n${text.trim()}\n`
}

/** Whole days from an ISO timestamp or date to `now`, or null when unparseable. */
export function daysSince(iso: string | null | undefined, now = new Date()): number | null {
  if (!iso) return null
  const t = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00` : iso)
  if (Number.isNaN(t)) return null
  return Math.max(0, Math.floor((now.getTime() - t) / 86_400_000))
}

/** After this long with no reply the application has most likely gone quiet. */
export const QUIET_AFTER_DAYS = 30
