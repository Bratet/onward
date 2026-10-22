import { CoverLetterConflict, coverLetterSchema, type CoverLetter, type LetterTurn } from './coverLetter'

export interface LetterReview {
  before: CoverLetter
  after: CoverLetter
}

export interface LetterChatSnapshot {
  turns: LetterTurn[]
  message: string
  review: LetterReview | null
}

/** Preserve older conversations while also retaining unfinished requests and AI reviews. */
export function parseLetterChat(value: string | null): LetterChatSnapshot | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value)
    const rows = Array.isArray(parsed) ? parsed : parsed?.turns
    if (!Array.isArray(rows)) return null
    const turns = rows.filter((turn): turn is LetterTurn =>
      (turn?.role === 'user' || turn?.role === 'assistant') && typeof turn.content === 'string',
    ).slice(-100)
    const before = coverLetterSchema.safeParse(parsed?.review?.before)
    const after = coverLetterSchema.safeParse(parsed?.review?.after)
    return {
      turns,
      message: typeof parsed?.message === 'string' ? parsed.message.slice(0, 8000) : '',
      review: before.success && after.success ? { before: before.data, after: after.data } : null,
    }
  } catch {
    return null
  }
}

/** Every write starts from the last successful save, including after a failed request. */
export function createLetterSaveQueue(
  initial: CoverLetter | null,
  write: (letter: CoverLetter, base: CoverLetter | null) => Promise<void>,
) {
  let base = initial
  let tail: Promise<void> = Promise.resolve()
  let conflicted = false
  return {
    base: () => base,
    idle: () => tail,
    saved: (letter: CoverLetter) => { base = letter },
    save(letter: CoverLetter): Promise<void> {
      const request = tail.then(async () => {
        if (conflicted) throw new CoverLetterConflict()
        try {
          await write(letter, base)
          base = letter
        } catch (error) {
          if (error instanceof CoverLetterConflict) conflicted = true
          throw error
        }
      })
      // A network failure must not poison the queue or advance its base.
      tail = request.catch(() => {})
      return request
    },
  }
}
