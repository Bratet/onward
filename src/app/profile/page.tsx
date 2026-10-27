import { readFile, stat } from 'fs/promises'
import { resumePdfPath, resumeSourcePath } from '@/lib/paths'
import { parityDiff, profileStats, type ProfileStats } from '@/lib/profile'
import { readProfiles } from '@/lib/resumeProfiles'
import { ProfileShell } from './shell'
import { resumeCatalog, type Source, type SourceMeta } from './sources'

export const dynamic = 'force-dynamic'

/** The profile exposes the editable general resume, its profiles and the master, in both languages. */
export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ src?: string }> }) {
  const { src } = await searchParams
  const profiles = await readProfiles()
  const catalog = resumeCatalog(profiles)
  const source = catalog.source(src)

  // Every source is small, so all are read: the picker shows each file's state,
  // and parity is a property of each EN / FR pair, not of the open file.
  const files = await Promise.all(catalog.sources.map(load))
  const byId = new Map(files.map((f) => [f.source.id, f]))
  const meta: SourceMeta[] = files.map((f) => {
    const twin = files.find((o) => o.source.doc === f.source.doc && o.source.lang !== f.source.lang)
    const [en, fr] = f.source.lang === 'en' ? [f.stats, twin?.stats ?? null] : [twin?.stats ?? null, f.stats]
    return {
      id: f.source.id,
      missing: f.error !== null,
      edited: f.yamlTime,
      pdf: f.pdfTime === null ? 'missing' : f.yamlTime !== null && f.yamlTime > f.pdfTime + 1000 ? 'stale' : 'synced',
      bullets: f.stats?.highlights ?? null,
      parity: parityDiff(en, fr),
    }
  })
  const open = byId.get(source.id)!

  return <ProfileShell src={source.id} profiles={profiles} yaml={open.yaml} error={open.error} stats={open.stats} meta={meta} />
}

async function load(source: Source) {
  const file = resumeSourcePath(source.doc.family, source.lang, source.doc.variant)
  const [yaml, error] = await read(file)
  const [yamlTime, pdfTime] = await Promise.all([mtime(file), mtime(resumePdfPath(file))])
  const stats: ProfileStats | null = error ? null : profileStats(yaml)
  return { source, yaml, error, stats, yamlTime, pdfTime }
}

async function read(file: string): Promise<[string, string | null]> {
  try {
    return [await readFile(file, 'utf-8'), null]
  } catch {
    return ['', `${file} not found`]
  }
}

async function mtime(file: string): Promise<number | null> {
  try {
    return (await stat(file)).mtimeMs
  } catch {
    return null
  }
}
