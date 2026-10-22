import { readFile } from 'fs/promises'
import { NextResponse } from 'next/server'
import { CANDIDATE } from '@/lib/candidate'
import { getEngine } from '@/lib/engine'
import { PATHS } from '@/lib/paths'
import { pdfText } from '@/lib/pdf'
import {
  blankResumeYaml, designBlock, importedResumeParser, importedResumeSchema, importedResumeYaml, importSummary,
  MAX_RESUME_CHARS, MIN_RESUME_CHARS, resumeImportPrompt,
} from '@/lib/resumeImport'

export const runtime = 'nodejs'
export const maxDuration = 300

const MAX_FILE_BYTES = 10 * 1024 * 1024

/**
 * Turns the resume a new user already has into Onward resume YAML. Nothing is
 * saved here: the welcome page shows what was found, then saves it as the
 * master and general resumes through /api/masters.
 *
 * Form fields: `file` (a PDF or text file) or `text`; `blank=1` skips the AI
 * and returns a resume with only the user's name.
 */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'Send the resume as a form.' }, { status: 400 })
  const design = designBlock(await readFile(PATHS.tailoredDesign, 'utf-8'))

  if (form.get('blank')) return NextResponse.json({ yaml: blankResumeYaml(CANDIDATE.fullName, design), language: 'en' })

  const resume = await resumeText(form)
  if ('error' in resume) return NextResponse.json({ error: resume.error }, { status: 400 })

  try {
    const engine = await getEngine('editor-chat')
    const raw = await engine.runStructured<unknown>({ prompt: resumeImportPrompt(resume.text), schema: importedResumeSchema, signal: req.signal })
    const parsed = importedResumeParser.parse(raw)
    const summary = importSummary(parsed)
    if (summary.roles + summary.education + summary.projects === 0) {
      return NextResponse.json({ error: 'No experience, education or projects were found in that resume. Check that it is the right file, or paste the text instead.' }, { status: 422 })
    }
    return NextResponse.json({ yaml: importedResumeYaml(parsed, CANDIDATE.fullName, design), language: parsed.language, summary, engine: engine.id })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Reading the resume failed.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

async function resumeText(form: FormData): Promise<{ text: string } | { error: string }> {
  const file = form.get('file')
  let text = typeof form.get('text') === 'string' ? String(form.get('text')) : ''
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_FILE_BYTES) return { error: 'That file is over 10 MB. A resume PDF is usually well under 1 MB.' }
    const bytes = new Uint8Array(await file.arrayBuffer())
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name) || Buffer.from(bytes.subarray(0, 5)).toString() === '%PDF-'
    if (isPdf) {
      const extracted = await pdfText(bytes)
      if (extracted === null) return { error: 'That PDF could not be opened. Try exporting it again, or paste the text instead.' }
      text = extracted
      if (text.trim().length < MIN_RESUME_CHARS) {
        return { error: 'That PDF has almost no text in it, which usually means it is a scan or an image. Paste the text instead.' }
      }
    } else if (/\.(txt|md|markdown)$/i.test(file.name) || file.type.startsWith('text/')) {
      text = new TextDecoder().decode(bytes)
    } else {
      return { error: 'Onward reads PDF and plain text files. Save a Word or Pages resume as PDF first, or paste its text.' }
    }
  }
  text = text.trim()
  if (text.length < MIN_RESUME_CHARS) return { error: 'That is too short to be a resume. Paste the whole text, or choose your resume file.' }
  if (text.length > MAX_RESUME_CHARS) return { error: 'That is longer than a resume usually is. Paste only the resume itself.' }
  return { text }
}
