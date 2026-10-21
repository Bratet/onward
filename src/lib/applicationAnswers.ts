/**
 * The answers given in an application form, kept as markdown in the
 * application folder (`application-answers.md`): a `# Title`, an optional
 * intro, then one `## Question` section per answer. A paragraph wholly in
 * parentheses is a note about the answer, not part of it. Client-safe.
 */

export const ANSWERS_FILE = 'application-answers.md'

export interface Answer {
  question: string
  /** Paragraphs separated by a blank line, as written. */
  answer: string
  /** Notes about the answer, such as what was cut before sending. */
  notes: string[]
}

export interface ApplicationAnswers {
  intro: string
  answers: Answer[]
}

export function parseAnswers(markdown: string): ApplicationAnswers {
  const [head, ...sections] = markdown.replace(/\r\n/g, '\n').split(/^## +/m)
  const intro = head.replace(/^# .*$/m, '').trim().replace(/\s*\n\s*/g, ' ')
  const answers = sections.flatMap((section) => {
    const [first, ...rest] = section.split('\n')
    const paragraphs = rest.join('\n').split(/\n\s*\n/).map((paragraph) => paragraph.trim().replace(/\s*\n\s*/g, ' ')).filter(Boolean)
    const note = (paragraph: string) => /^\(.*\)$/s.test(paragraph)
    const answer = paragraphs.filter((paragraph) => !note(paragraph)).join('\n\n')
    return first.trim() && answer ? [{ question: first.trim(), answer, notes: paragraphs.filter(note).map((paragraph) => paragraph.slice(1, -1).trim()) }] : []
  })
  return { intro, answers }
}
