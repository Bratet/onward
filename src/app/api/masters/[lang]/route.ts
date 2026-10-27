import { copyFile, mkdir, readFile, writeFile, rename } from 'fs/promises'
import { dirname } from 'path'
import { NextResponse } from 'next/server'
import { resumePdfPath, resumeSourcePath } from '@/lib/paths'
import { readProfiles } from '@/lib/resumeProfiles'
import { cleanupRender, renderYaml } from '@/lib/render'
import { keepRevision } from '@/lib/resumeRevisions'
import { parse } from 'yaml'
import { randomUUID } from 'crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** The source file the query names; a `variant` must be a registered profile of the general resume. */
async function target(lang: string, req: Request): Promise<{ file: string; family: 'masters' | 'ownCv' } | null> {
  const query = new URL(req.url).searchParams
  const family = query.get('family') ?? 'masters'
  const variant = query.get('variant')
  if (family !== 'masters' && family !== 'ownCv') return null
  if (variant !== null && (family !== 'ownCv' || !(await readProfiles()).some((profile) => profile.id === variant))) return null
  return lang === 'en' || lang === 'fr' ? { file: resumeSourcePath(family, lang, variant), family } : null
}

/** The YAML as JSON, or with `?pdf=1` the saved PDF beside it. */
export async function GET(req: Request, { params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  const source = await target(lang, req)
  if (!source) return NextResponse.json({ error: 'lang must be en or fr, and variant a resume profile' }, { status: 400 })

  if (new URL(req.url).searchParams.get('pdf')) {
    try {
      const pdf = await readFile(resumePdfPath(source.file))
      return new NextResponse(new Uint8Array(pdf), {
        headers: { 'content-type': 'application/pdf', 'cache-control': 'no-store' },
      })
    } catch {
      return NextResponse.json({ error: 'No saved PDF for this resume yet' }, { status: 404 })
    }
  }

  try {
    return NextResponse.json({ lang, yaml: await readFile(source.file, 'utf-8') })
  } catch {
    return NextResponse.json({ error: 'master not found' }, { status: 404 })
  }
}

/**
 * Save the YAML, then refresh the PDF that sits beside it. The YAML is the
 * source of truth, so a render that fails or breaks a rule still saves the
 * YAML; it only leaves the old PDF in place and says why. A save that changes
 * the file first keeps the text it replaces as a revision; one that changes
 * nothing leaves the file alone and only refreshes the PDF.
 */
export async function PUT(req: Request, { params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  const source = await target(lang, req)
  if (!source) return NextResponse.json({ error: 'lang must be en or fr, and variant a resume profile' }, { status: 400 })

  const { yaml } = (await req.json()) as { yaml: string }
  if (typeof yaml !== 'string' || !yaml.trim()) {
    return NextResponse.json({ error: 'yaml (non-empty string) is required' }, { status: 400 })
  }

  try {
    if (!parse(yaml)?.cv) throw new Error('missing cv')
  } catch {
    return NextResponse.json({ error: 'Valid resume YAML with a cv section is required' }, { status: 400 })
  }
  const previous = await readFile(source.file, 'utf-8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null
    throw error
  })
  const changed = previous !== yaml
  const revision = changed && previous !== null ? await keepRevision(source.file, previous) : null
  if (changed) await atomicWrite(source.file, yaml)
  const saved = { lang, saved: true, changed, revisionKept: revision !== null }

  const result = await renderYaml(yaml, source.family === 'masters' ? 'master' : 'general')
  try {
    if (result.ok && result.pdfPath) {
      const pdf = resumePdfPath(source.file)
      const tmp = `${pdf}.tmp-${randomUUID()}`
      await copyFile(result.pdfPath, tmp)
      await rename(tmp, pdf)
      return NextResponse.json({ ...saved, pdf: { updated: true, pages: result.pages } })
    }
    const reason = result.failures[0]?.why ?? 'the render did not produce a PDF'
    return NextResponse.json({ ...saved, pdf: { updated: false, reason } })
  } finally {
    if (result.pdfPath) await cleanupRender(result.pdfPath)
  }
}

async function atomicWrite(file: string, text: string) {
  await mkdir(dirname(file), { recursive: true })
  const tmp = `${file}.tmp-${randomUUID()}`
  await writeFile(tmp, text, 'utf-8')
  await rename(tmp, file)
}
