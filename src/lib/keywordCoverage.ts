import type { ProfileFitReport } from './profileFit'
import { confirmsSkill, keywordEquivalents, mentionsSkill, normalizeSkillText } from './skillTerms'

export type PostingKeywordStatus = 'inResume' | 'backed' | 'missing'

/** Keep resume wording separate from experience the fit analysis has confirmed. */
export function postingKeywordStatus(word: string, resumeText: string, report: ProfileFitReport | null): PostingKeywordStatus {
  const aliases = keywordEquivalents(word, report?.keywordMappings)
  if (confirmsSkill(resumeText, word, aliases)) return 'inResume'
  const related = report?.keywordMappings?.filter((mapping) => normalizeSkillText(mapping.keyword) === normalizeSkillText(word))
    .flatMap((mapping) => mapping.related) ?? []
  if (report?.requirements.some((row) =>
    row.classification === 'direct' && (
      row.evidence.some((line) => confirmsSkill(line, word, aliases))
      || (normalizeSkillText(row.requirement).startsWith(`${normalizeSkillText(word)} `)
        && row.evidence.some((line) => line.trim() && !/\b(?:no evidence|absent|missing|unconfirmed|not (?:recorded|confirmed|used|named)|does not appear)\b/iu.test(line)))
      // A subskill only backs the broader concept when this specific requirement
      // was assessed as direct and positively cites it. It never counts as wording.
      || (mentionsSkill(row.requirement, word, aliases)
        && row.evidence.some((line) => related.some((term) => confirmsSkill(line, term))))
    ),
  )) return 'backed'
  return 'missing'
}
