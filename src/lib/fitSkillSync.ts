import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { parseDocument } from 'yaml'
import type { ProfileFitReport } from './profileFit'
import { postingKeywordStatus } from './keywordCoverage'
import { PATHS } from './paths'
import { confirmsSkill, keywordEquivalents, mentionsSkill, normalizeSkillText, skillTermPattern, type KeywordMapping } from './skillTerms'

/** Only a clear first-person assertion can create new skill evidence. */
export function explicitSkillConfirmations(message: string, keywords: string[], mappings: KeywordMapping[] = []): string[] {
  const lines = message.split(/(?<=[.!?;])\s+|\n+/u)
  return keywords.filter((term) => lines.some((line) => {
    if (line.trimEnd().endsWith('?')) return false
    const normalized = normalizeSkillText(line)
    const aliases = keywordEquivalents(term, mappings)
    const match = skillTermPattern(term, aliases)?.exec(normalized)
    if (!match) return false
    const after = normalized.slice(match.index + match[0].length)
    const assertion = /\bI\s+(?:(?:also|do|already|really)\s+)*(?:have|use|used|know|work with|worked with)\b|\bmy\s+skills\s+(?:include|are)\b/iu.test(normalized)
      || /\b(?:is|are)\s+(?:a\s+)?skills?\s+I\s+(?:do\s+)?have\b/iu.test(after)
    return assertion && confirmsSkill(line, term, aliases)
  }))
}

function skillBucket(term: string, labels: string[]): number {
  const preferred = /LlamaIndex|LangChain|LangGraph|LangSmith|GenAI|AI |LLM|RAG|prompt|vector/iu.test(term)
    ? /generative|générative|agents/iu
    : /engineering|ingénierie|MLOps|Data|tools|outils/iu
  const found = labels.findIndex((label) => preferred.test(label))
  if (found >= 0) return found
  return labels.findIndex((label) => !/languages|langues/iu.test(label))
}

export function addConfirmedSkills(yaml: string, terms: string[], report: ProfileFitReport | null = null): string {
  const missing = terms.filter((term) => postingKeywordStatus(term, yaml, report) !== 'inResume')
  if (!missing.length) return yaml
  const doc = parseDocument(yaml)
  const sections = doc.getIn(['cv', 'sections'])
  if (!sections || typeof sections !== 'object' || !('items' in sections)) throw new Error('The application resume has no editable Skills section.')
  const skillName = ['Skills', 'Compétences', 'Competences'].find((name) => doc.hasIn(['cv', 'sections', name]))
  if (!skillName) throw new Error('The application resume has no editable Skills section.')
  const skills = doc.getIn(['cv', 'sections', skillName])
  if (!skills || typeof skills !== 'object' || !('items' in skills) || !Array.isArray(skills.items)) throw new Error('The application resume has no editable Skills section.')
  const labels = skills.items.map((_: unknown, index: number) => String(doc.getIn(['cv', 'sections', skillName, index, 'label']) ?? ''))
  for (const term of missing) {
    const index = skillBucket(term, labels)
    if (index < 0) throw new Error('The application resume has no editable Skills category.')
    const path = ['cv', 'sections', skillName, index, 'details']
    const details = doc.getIn(path)
    if (typeof details !== 'string') throw new Error('The application resume has no editable Skills details.')
    doc.setIn(path, `${details.replace(/\s+$/u, '')}, ${term}`)
  }
  return doc.toString()
}

/** Reconcile the report before saving, so the keyword card and draft agree. */
export function reconcileConfirmedSkills(
  message: string, keywords: string[], report: ProfileFitReport, yaml: string,
): { report: ProfileFitReport; yaml: string; confirmed: string[] } {
  const explicit = explicitSkillConfirmations(message, keywords, report.keywordMappings)
  const mentions = (text: string, term: string) => mentionsSkill(text, term, keywordEquivalents(term, report.keywordMappings))
  const rows = report.requirements.map((row) => {
    const confirmed = explicit.filter((term) => mentions(row.requirement, term))
    if (!confirmed.length) return row
    const evidence = row.evidence.filter((line) => !confirmed.some((term) =>
      mentions(line, term) && /\b(?:absent|missing|does not|not confirmed|not used|no evidence)\b/iu.test(line)))
    for (const term of confirmed) {
      if (!evidence.some((line) => /user[- ]confirmed/iu.test(line) && mentions(line, term))) {
        evidence.unshift(`User-confirmed: ${term} is a skill you have`)
      }
    }
    return { ...row, classification: 'direct' as const, evidence: evidence.slice(0, 6) }
  })
  const allConfirmed = keywords.filter((term) => explicit.includes(term) || rows.some((row) =>
    row.classification === 'direct' && row.evidence.some((line) =>
      /^User[- ]confirmed:/iu.test(line) && confirmsSkill(line, term, keywordEquivalents(term, report.keywordMappings)))))
  const keyGaps = report.keyGaps.filter((gap) => !explicit.some((term) =>
    mentions(gap, term) && /\b(?:absent|missing|no evidence|not confirmed|should not claim|does not appear)\b/iu.test(gap)))
  return { report: { ...report, requirements: rows, keyGaps }, yaml: addConfirmedSkills(yaml, allConfirmed, report), confirmed: explicit }
}

/** Keep a direct confirmation available to later applications as well. */
export async function rememberConfirmedSkills(terms: string[], mappings: KeywordMapping[] = []): Promise<void> {
  if (!terms.length) return
  const path = PATHS.candidateGuidance
  const before = await readFile(path, 'utf-8').catch(() => '')
  const missing = terms.filter((term) => !before.split('\n').some((line) =>
    confirmsSkill(line, term, keywordEquivalents(term, mappings))))
  if (!missing.length) return
  const bullets = missing.map((term) => `- User-confirmed skill: ${term}.`).join('\n')
  const heading = '## Skills confirmed in fit chat'
  const marker = before.indexOf(heading)
  const nextHeading = marker >= 0 ? before.indexOf('\n## ', marker + heading.length) : -1
  const after = marker < 0
    ? `${before.trimEnd()}\n\n${heading}\n\n${bullets}\n`
    : nextHeading < 0
      ? `${before.trimEnd()}\n${bullets}\n`
      : `${before.slice(0, nextHeading).trimEnd()}\n${bullets}\n${before.slice(nextHeading)}`
  await mkdir(dirname(path), { recursive: true })
  const temp = `${path}.${randomUUID()}.tmp`
  await writeFile(temp, after, { flag: 'wx' })
  await rename(temp, path)
}
