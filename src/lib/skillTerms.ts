/** A mapping describes wording, never a new fact about the candidate. */
export interface KeywordMapping {
  keyword: string
  equivalents: string[]
  /** Narrower or adjacent capabilities: these are not interchangeable names. */
  related: string[]
}

// Common, unambiguous forms work immediately, including in older applications.
// Less common/contextual wording comes from the fit analysis, not an ever-growing
// hand-maintained taxonomy of tools and their supposed prerequisites.
const EQUIVALENTS = [
  ['VSCode', 'VS Code', 'Visual Studio Code'],
  ['GenAI', 'generative AI', 'generative artificial intelligence'],
  ['REST API', 'REST APIs', 'RESTful API', 'RESTful APIs'],
  ['prompt and context engineering', 'prompt & context engineering', 'prompt/context engineering'],
  ['AI and LLM evaluation', 'AI & LLM evaluation', 'AI/LLM evaluation'],
  ['LLM', 'LLMs', 'large language model', 'large language models'],
  ['RAG', 'retrieval augmented generation'],
  ['NLP', 'natural language processing'],
  ['OOP', 'object oriented programming'],
  ['CI/CD', 'continuous integration and continuous delivery', 'continuous integration and continuous deployment'],
  ['OAuth2', 'OAuth 2', 'OAuth 2.0'],
  ['Microsoft 365', 'M365', 'MS 365'],
  ['C#', 'C sharp', 'C-sharp'],
  ['C++', 'C plus plus'],
  ['JSON', 'JavaScript Object Notation'],
] as const

export function normalizeSkillText(value: string): string {
  return value.normalize('NFKC').toLowerCase()
    .replace(/[‐‑‒–—]/gu, '-')
    .replace(/(?<=\p{L})[/-](?=\p{L})/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

const equivalentGroups = EQUIVALENTS.map((group) => group.map(normalizeSkillText))
const includedTerms: Record<string, string[]> = {
  'prompt engineering': ['prompt and context engineering', 'prompt & context engineering', 'prompt/context engineering'],
  'context engineering': ['prompt and context engineering', 'prompt & context engineering', 'prompt/context engineering'],
  'ai evaluation': ['AI and LLM evaluation', 'AI & LLM evaluation', 'AI/LLM evaluation'],
  'llm evaluation': ['AI and LLM evaluation', 'AI & LLM evaluation', 'AI/LLM evaluation'],
}

/** Extra aliases are directional: a keyword's aliases do not become global rules. */
export function skillTermPattern(term: string, aliases: readonly string[] = [], global = false): RegExp | null {
  const terms = new Set<string>()
  for (const value of [term, ...aliases]) {
    const normalized = normalizeSkillText(value)
    if (!normalized) continue
    terms.add(normalized)
    // A coordinated phrase includes each part; one part does not establish both.
    for (const included of includedTerms[normalized] ?? []) terms.add(normalizeSkillText(included))
    for (const group of equivalentGroups) {
      if (group.includes(normalized)) group.forEach((alias) => terms.add(alias))
    }
  }
  if (!terms.size) return null
  const alternatives = [...terms].sort((a, b) => b.length - a.length)
    .map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /gu, '\\s+'))
  // + and # matter in skill names: C cannot stand in for C++ or C#.
  return new RegExp(`(?<![\\p{L}\\p{N}+#])(?:${alternatives.join('|')})(?![\\p{L}\\p{N}+#])`, global ? 'gu' : 'u')
}

export function mentionsSkill(text: string, term: string, aliases: readonly string[] = []): boolean {
  return skillTermPattern(term, aliases)?.test(normalizeSkillText(text)) ?? false
}

/** Apply negation to a clause/list, so "no OAuth2 or webhooks" denies both. */
export function deniedSkillMention(before: string, after: string): boolean {
  const clause = before.split(/\b(?:but|however|whereas)\b|\.(?=\s|$)|[\n;]/u).at(-1) ?? ''
  const deniedBefore = /\b(?:no(?![ -]code\b)|without|missing|absent|lacks?|lacking|not(?!\s+(?:only|just)\b)|never|cannot|can't|haven't|have not|don't|do not)\b[\s\S]*$/u.test(clause)
  const deniedAfter = /^\s*(?:(?:is|was|are|were|does|do|did|has|have)\s+)?(?:not\b|isn't\b|wasn't\b|aren't\b|weren't\b|absent\b|missing\b|unconfirmed\b|unrecorded\b|lacking\b)/u.test(after.split('\n')[0])
  return deniedBefore || deniedAfter
}

/** Missing/unconfirmed text is not evidence, even when it contains an alias. */
export function confirmsSkill(text: string, term: string, aliases: readonly string[] = []): boolean {
  const pattern = skillTermPattern(term, aliases, true)
  if (!pattern) return false
  const normalized = text.split(/\r?\n/u).map(normalizeSkillText).join('\n')
  for (const match of normalized.matchAll(pattern)) {
    if (!deniedSkillMention(normalized.slice(0, match.index), normalized.slice(match.index + match[0].length))) return true
  }
  return false
}

export function keywordEquivalents(term: string, mappings: readonly KeywordMapping[] = []): string[] {
  return mappings.filter((mapping) => normalizeSkillText(mapping.keyword) === normalizeSkillText(term))
    .flatMap((mapping) => mapping.equivalents)
}
