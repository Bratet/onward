'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { BrainCircuit, ChartScatter, CodeXml, Cpu, ExternalLink, FileText, FileUser, FlaskConical, Keyboard, Layers3, Plus, Settings2, type LucideIcon } from 'lucide-react'
import { EditorPane } from '@/components/EditorPane'
import { Badge, Card, Empty, Spinner } from '@/components/ui/primitives'
import type { ProfileStats } from '@/lib/profile'
import { GENERAL_BASE, type Archetype, type ResumeProfile } from '@/lib/tailoring/baseCv'
import { cn } from '@/lib/utils'
import { ProfileDialog, type ManageProfile } from './profile-dialog'
import { resumeCatalog, type Document, type Lang, type Source, type SourceMeta } from './sources'

/** A profile wears the icon of the first role type it is picked for. */
const ARCHETYPE_ICON: Record<Archetype, LucideIcon> = {
  'ai-llm': BrainCircuit,
  'ml-engineering': Cpu,
  'ml-performance': Cpu,
  'data-science': ChartScatter,
  'applied-research': FlaskConical,
  software: CodeXml,
  other: FileUser,
}

/** Alt+digit reaches the first nine documents. */
const SHORTCUTS = 9

const LANG_NAME: Record<Lang, string> = { en: 'English', fr: 'French' }

type PdfNotice = { tone: 'ok' | 'warn'; text: string } | null

export function ProfileShell({
  src,
  profiles,
  yaml,
  error,
  stats,
  meta,
}: {
  src: string
  profiles: ResumeProfile[]
  yaml: string
  error: string | null
  stats: ProfileStats | null
  meta: SourceMeta[]
}) {
  const router = useRouter()
  const catalog = useMemo(() => resumeCatalog(profiles), [profiles])
  const { documents, sourceFor } = catalog
  const source = catalog.source(src)
  const doc = source.doc
  const profile = profiles.find((p) => p.id === doc.variant) ?? null
  const [dirty, setDirty] = useState(false)
  const [pdfNotice, setPdfNotice] = useState<PdfNotice>(null)
  const [pending, startTransition] = useTransition()
  const [target, setTarget] = useState<string | null>(null)
  const [manage, setManage] = useState<ManageProfile | null>(null)
  const metaOf = (id: string) => meta.find((m) => m.id === id)
  const current = metaOf(src)
  const hasFiles = (item: Document) => [sourceFor(item, 'en'), sourceFor(item, 'fr')].some((s) => metaOf(s.id)?.missing === false)
  const startable = documents.filter((item) => item.family === 'ownCv' && hasFiles(item)).map((item) => item.variant ?? GENERAL_BASE.id)
  const iconOf = (item: Document) => docIcon(item, profiles)
  const DocIcon = iconOf(doc)

  function go(id: string) {
    setDirty(false)
    setPdfNotice(null)
    setTarget(id)
    startTransition(() => router.push(`/profile?src=${id}`))
  }

  function open(id: string) {
    if (id === src) return
    if (dirty && !window.confirm('You have unsaved resume changes. Switch and discard them?')) return
    go(id)
  }

  function create() {
    if (dirty && !window.confirm('You have unsaved resume changes. Discard them and add a profile?')) return
    setManage({ kind: 'create' })
  }

  // Alt+1..9 opens a document in the current language, Alt+L flips the language.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!event.altKey || event.ctrlKey || event.metaKey || manage) return
      const index = Number(event.key) - 1
      if (index >= 0 && index < Math.min(documents.length, SHORTCUTS)) {
        event.preventDefault()
        open(sourceFor(documents[index], source.lang).id)
      } else if (event.key.toLowerCase() === 'l') {
        event.preventDefault()
        open(sourceFor(doc, source.lang === 'en' ? 'fr' : 'en').id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Closing the tab or reloading would drop the buffer as quietly as switching would.
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  async function save(text: string) {
    const variant = doc.variant ? `&variant=${doc.variant}` : ''
    const response = await fetch(`/api/masters/${source.lang}?family=${doc.family}${variant}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ yaml: text }),
    })
    const body = await response.json()
    if (!response.ok) throw new Error(body.error ?? 'Could not save this resume.')
    const kept = body.revisionKept ? ' · previous version kept' : ''
    setPdfNotice(body.pdf?.updated
      ? { tone: 'ok', text: `PDF updated${body.pdf.pages ? ` · ${body.pdf.pages} page${body.pdf.pages === 1 ? '' : 's'}` : ''}${kept}` }
      : { tone: 'warn', text: `${body.changed ? 'YAML saved' : 'YAML unchanged'}${kept}, PDF kept as before: ${body.pdf?.reason ?? 'render failed'}` })
    router.refresh()
  }

  const available = meta.filter((m) => !m.missing)
  const tab = (item: Document) => {
    const id = sourceFor(item, source.lang).id
    const index = documents.indexOf(item)
    return (
      <DocTab
        key={item.key}
        doc={item}
        standing={standingOf(item, sourceFor, metaOf)}
        icon={iconOf(item)}
        shortcut={index < SHORTCUTS ? index + 1 : null}
        active={item.key === doc.key}
        loading={pending && target === id}
        sourceFor={sourceFor}
        metaOf={metaOf}
        onClick={() => open(id)}
      />
    )
  }
  const firstActive = documents[0] === doc
  const lastActive = doc.family === 'masters'

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-lg leading-tight">Resume sources</h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--color-muted)]">
            The resumes new applications start from. Each application takes its own copy, so edits here never change one already made.
          </p>
        </div>
        <LangSwitch
          lang={source.lang}
          onChange={(lang) => open(sourceFor(doc, lang).id)}
          dots={{ en: metaOf(sourceFor(doc, 'en').id), fr: metaOf(sourceFor(doc, 'fr').id) }}
        />
      </header>

      <div>
        <nav aria-label="Resume documents" className="folder-strip">
          {documents.filter((item) => item.family === 'ownCv').map(tab)}
          <button type="button" onClick={create} className="folder-tab folder-tab-add" title="Add a profile: a general resume aimed at one kind of role">
            <span className="folder-label"><Plus aria-hidden="true" size={15} strokeWidth={2.5} /></span>
            Add profile
          </button>
          <span className="min-w-4 flex-1" />
          {documents.filter((item) => item.family === 'masters').map(tab)}
        </nav>

        <section
          aria-label={`${doc.name} · ${LANG_NAME[source.lang]}`}
          className={cn('rounded-b-xl border bg-[var(--color-surface)] px-4 py-3 shadow-[var(--shadow-sheet)]', !firstActive && 'rounded-tl-xl', !lastActive && 'rounded-tr-xl')}
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="folder-label size-8">
              <DocIcon aria-hidden="true" size={16} />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-tight">
                {doc.name} <span className="font-normal text-[var(--color-muted)]">· {LANG_NAME[source.lang]}</span>
              </p>
              <p className="mt-0.5 truncate text-xs text-[var(--color-muted)]">{doc.hint}</p>
            </div>
            {profile ? (
              <button
                type="button"
                onClick={() => setManage({ kind: 'edit', profile })}
                className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-[var(--color-border-strong)] px-3 text-xs font-medium transition-colors hover:bg-[var(--color-surface-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
              >
                <Settings2 aria-hidden="true" size={14} />Profile settings
              </button>
            ) : null}

            <span className="ml-auto flex flex-wrap items-center gap-2 text-xs">
              {dirty ? <Badge tone="warn"><span className="size-1.5 rounded-full bg-current" />Unsaved changes</Badge> : null}
              {current?.parity ? (
                <Badge tone="warn" className="max-w-[28rem] truncate">EN / FR differ: {current.parity}</Badge>
              ) : current && !current.missing ? (
                <Badge tone="ok">EN / FR in step</Badge>
              ) : null}
              {pdfNotice ? (
                <Badge tone={pdfNotice.tone} className="max-w-[28rem] truncate">{pdfNotice.text}</Badge>
              ) : current?.pdf === 'stale' ? (
                <Badge tone="warn">PDF older than the YAML</Badge>
              ) : current?.pdf === 'missing' ? (
                <Badge tone="warn">No PDF yet</Badge>
              ) : null}
              {current && current.pdf !== 'missing' ? (
                <a
                  href={`/api/masters/${source.lang}?family=${doc.family}${doc.variant ? `&variant=${doc.variant}` : ''}&pdf=1`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-7 items-center gap-1 rounded-md px-2 font-medium text-[var(--color-accent)] hover:bg-[var(--color-accent-soft)]"
                >
                  Saved PDF <ExternalLink aria-hidden="true" size={12} />
                </a>
              ) : null}
            </span>
          </div>

          {stats?.sections.length || current?.edited ? (
            <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-[var(--color-border)] pt-2.5 text-xs text-[var(--color-muted)]">
              {stats?.sections.length ? (
                <div className="index-line tnum min-w-0">
                  <ul aria-label="Sections and their entries">
                    {stats.sections.map((section) => (
                      <li key={section.name}>
                        {section.name} <span className="font-medium text-[var(--color-text)]">{section.entries}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <span className="ml-auto flex items-center gap-3 text-[var(--color-muted)]">
                {current?.edited ? <span suppressHydrationWarning title={new Date(current.edited).toLocaleString()}>Saved {ago(current.edited)}</span> : null}
                <span
                  className="hidden items-center lg:inline-flex"
                  title={`Alt+1–${Math.min(documents.length, SHORTCUTS)}: open a document · Alt+L: switch language · Ctrl+S: save`}
                >
                  <Keyboard aria-hidden="true" size={14} />
                </span>
              </span>
            </div>
          ) : null}
        </section>
      </div>

      {error ? (
        <Card>
          <Empty title="This resume file does not exist yet" hint={error} />
          <div className="flex flex-wrap justify-center gap-2 px-5 pb-6">
            {available.slice(0, 4).map((item) => (
              <button key={item.id} type="button" onClick={() => open(item.id)} className="min-h-9 rounded-lg border px-3 text-xs font-medium hover:bg-[var(--color-surface-2)]">
                Open {catalog.source(item.id).label}
              </button>
            ))}
          </div>
        </Card>
      ) : (
        <div className={cn('transition-opacity', pending && 'pointer-events-none opacity-60')}>
          <EditorPane
            key={src}
            initialYaml={yaml}
            mode="master"
            title={`${doc.family === 'ownCv' ? `${doc.name} general` : 'Master'} resume · ${source.lang.toUpperCase()}`}
            general={doc.family === 'ownCv'}
            onSave={save}
            saveLabel={`${doc.name} ${source.lang.toUpperCase()}`}
            outputStale={!!current && !current.missing && current.pdf !== 'synced'}
            onDirtyChange={setDirty}
            chatScope={`profile:${src}`}
            reviewSource={source.id}
          />
        </div>
      )}

      {manage ? (
        <ProfileDialog
          manage={manage}
          profiles={profiles}
          startable={startable}
          unsaved={dirty}
          onClose={() => setManage(null)}
          onCreated={(created) => { setManage(null); go(`${created.id}-${source.lang}`) }}
          onUpdated={() => { setManage(null); router.refresh() }}
          onDeleted={() => { setManage(null); go(sourceFor(documents[0], source.lang).id) }}
        />
      ) : null}
    </div>
  )
}

function docIcon(doc: Document, profiles: ResumeProfile[]): LucideIcon {
  if (doc.family === 'masters') return Layers3
  if (!doc.variant) return FileText
  const first = profiles.find((p) => p.id === doc.variant)?.archetypes[0]
  return first ? ARCHETYPE_ICON[first] : FileUser
}

const healthy = (meta: SourceMeta | undefined) => !!meta && !meta.missing && !meta.parity && meta.pdf === 'synced'

/** A resume's standing for its folder tab's edge: in shape when every language file is present, rendered and in step. */
function standingOf(doc: Document, sourceFor: (doc: Document, lang: Lang) => Source, metaOf: (id: string) => SourceMeta | undefined): Standing {
  return (['en', 'fr'] as const).every((lang) => healthy(metaOf(sourceFor(doc, lang).id))) ? 'ok' : 'warn'
}

type Standing = 'ok' | 'warn'

/** A folder tab whose top edge shows the resume's standing; the open one rises to join the sheet below it. One dot per language says whether that file is in shape. */
function DocTab({
  doc, standing, icon: Icon, shortcut, active, loading, sourceFor, metaOf, onClick,
}: {
  doc: Document
  standing: Standing
  icon: LucideIcon
  shortcut: number | null
  active: boolean
  loading: boolean
  sourceFor: (doc: Document, lang: Lang) => Source
  metaOf: (id: string) => SourceMeta | undefined
  onClick: () => void
}) {
  const langs = (['en', 'fr'] as const).map((lang) => ({ lang, meta: metaOf(sourceFor(doc, lang).id) }))
  const summary = langs.map(({ lang, meta }) => `${lang.toUpperCase()}: ${meta?.missing ? 'missing' : healthy(meta) ? 'up to date' : statusText(meta)}`).join(' · ')
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      aria-keyshortcuts={shortcut ? `Alt+${shortcut}` : undefined}
      title={`${doc.hint}\n${summary}${shortcut ? `\nAlt+${shortcut}` : ''}`}
      data-standing={standing}
      className="folder-tab"
    >
      <span className="folder-label">{loading ? <Spinner className="size-3.5" /> : <Icon size={15} aria-hidden="true" />}</span>
      {doc.name}
      <span className="flex items-center gap-1" aria-label={summary}>
        {langs.map(({ lang, meta }) => (
          <span
            key={lang}
            className={cn('size-1.5 rounded-full', meta?.missing ? 'border border-[var(--color-faint)]' : healthy(meta) ? 'bg-[var(--color-ok)]' : 'bg-[var(--color-warn)]')}
          />
        ))}
      </span>
    </button>
  )
}

function LangSwitch({
  lang, onChange, dots,
}: {
  lang: Lang
  onChange: (lang: Lang) => void
  dots: Record<Lang, SourceMeta | undefined>
}) {
  return (
    <div role="radiogroup" aria-label="Resume language" aria-keyshortcuts="Alt+L" className="inline-flex rounded-lg border bg-[var(--color-surface-2)] p-0.5">
      {(['en', 'fr'] as const).map((value) => {
        const meta = dots[value]
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={lang === value}
            onClick={() => onChange(value)}
            className={cn(
              'inline-flex min-h-8 items-center gap-2 rounded-md px-3 text-xs font-medium text-[var(--color-muted)] transition-colors hover:text-[var(--color-text)]',
              lang === value && 'bg-[var(--color-surface)] text-[var(--color-text)] shadow-[var(--shadow-sheet)]',
            )}
          >
            {LANG_NAME[value]}
            {meta?.missing || meta?.pdf !== 'synced' ? (
              <span className="size-1.5 rounded-full bg-[var(--color-warn)]" title={statusText(meta)} />
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

function statusText(meta: SourceMeta | undefined): string {
  if (!meta) return ''
  if (meta.missing) return 'File missing'
  const parts = [
    meta.pdf === 'synced' ? 'PDF up to date' : meta.pdf === 'stale' ? 'PDF older than the YAML' : 'No PDF rendered',
    meta.parity ? `EN / FR differ: ${meta.parity}` : 'EN / FR in step',
  ]
  return parts.join(' · ')
}

function ago(ms: number, now = Date.now()): string {
  const minutes = Math.round((now - ms) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
