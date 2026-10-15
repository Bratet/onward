'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { BrainCircuit, ChartScatter, Cpu, ExternalLink, FileText, Keyboard, Layers3, type LucideIcon } from 'lucide-react'
import { EditorPane } from '@/components/EditorPane'
import { Badge, Card, Empty, Spinner } from '@/components/ui/primitives'
import type { ProfileStats } from '@/lib/profile'
import { cn } from '@/lib/utils'
import { DOCUMENTS, documentOf, sourceById, sourceFor, type Document, type SourceMeta } from './sources'

type Lang = 'en' | 'fr'

/** Why each document exists, in the words of the tailoring flow that picks it. */
const DOC_INFO: Record<string, { hint: string; icon: LucideIcon }> = {
  'ownCv:': { hint: 'Used when no single archetype fits', icon: FileText },
  'ownCv:ai': { hint: 'Picked for AI and LLM roles', icon: BrainCircuit },
  'ownCv:ml': { hint: 'Picked for ML engineering and inference roles', icon: Cpu },
  'ownCv:ds': { hint: 'Picked for data science roles', icon: ChartScatter },
  'masters:': { hint: 'The full record. No page limit, never sent', icon: Layers3 },
}

const LANG_NAME: Record<Lang, string> = { en: 'English', fr: 'French' }

type PdfNotice = { tone: 'ok' | 'warn'; text: string } | null

export function ProfileShell({
  src,
  yaml,
  error,
  stats,
  meta,
}: {
  src: string
  yaml: string
  error: string | null
  stats: ProfileStats | null
  meta: SourceMeta[]
}) {
  const router = useRouter()
  const source = sourceById(src)
  const doc = documentOf(source)
  const [dirty, setDirty] = useState(false)
  const [pdfNotice, setPdfNotice] = useState<PdfNotice>(null)
  const [pending, startTransition] = useTransition()
  const [target, setTarget] = useState<string | null>(null)
  const metaOf = (id: string) => meta.find((m) => m.id === id)
  const current = metaOf(src)

  function open(id: string) {
    if (id === src) return
    if (dirty && !window.confirm('You have unsaved resume changes. Switch and discard them?')) return
    setDirty(false)
    setPdfNotice(null)
    setTarget(id)
    startTransition(() => router.push(`/profile?src=${id}`))
  }

  // Alt+1..5 opens a document in the current language, Alt+L flips the language.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!event.altKey || event.ctrlKey || event.metaKey) return
      const index = Number(event.key) - 1
      if (index >= 0 && index < DOCUMENTS.length) {
        event.preventDefault()
        open(sourceFor(DOCUMENTS[index], source.lang).id)
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
    const variant = source.variant ? `&variant=${source.variant}` : ''
    const response = await fetch(`/api/masters/${source.lang}?family=${source.family}${variant}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ yaml: text }),
    })
    const body = await response.json()
    if (!response.ok) throw new Error(body.error ?? 'Could not save this resume.')
    setPdfNotice(body.pdf?.updated
      ? { tone: 'ok', text: `PDF updated${body.pdf.pages ? ` · ${body.pdf.pages} page${body.pdf.pages === 1 ? '' : 's'}` : ''}` }
      : { tone: 'warn', text: `YAML saved, PDF kept as before: ${body.pdf?.reason ?? 'render failed'}` })
    router.refresh()
  }

  const available = meta.filter((m) => !m.missing)

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Resume sources</h1>
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

      <nav aria-label="Resume documents" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_minmax(0,1.15fr)]">
        {DOCUMENTS.map((item, index) => {
          const id = sourceFor(item, source.lang).id
          return (
            <DocTile
              key={item.key}
              doc={item}
              shortcut={index + 1}
              active={item.key === doc.key}
              loading={pending && target === id}
              meta={metaOf(id)}
              onClick={() => open(id)}
            />
          )
        })}
      </nav>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-[var(--color-surface)] px-3 py-2 text-xs">
        <span className="text-[var(--color-muted)]">
          Editing <strong className="font-medium text-[var(--color-text)]">{doc.name}</strong> · {LANG_NAME[source.lang]}
        </span>
        {dirty ? <Badge tone="warn"><span className="size-1.5 rounded-full bg-current" />Unsaved changes</Badge> : null}

        {stats?.sections.length ? (
          <span className="flex flex-wrap items-center gap-1" aria-label="Resume content summary">
            {stats.sections.map((section) => (
              <span key={section.name} className="tnum rounded-md bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[11px] text-[var(--color-muted)]">
                {section.name} <strong className="font-medium text-[var(--color-text)]">{section.entries}</strong>
              </span>
            ))}
          </span>
        ) : null}

        <span className="ml-auto flex flex-wrap items-center gap-2">
          {current?.parity ? (
            <Badge tone="warn" className="max-w-[28rem] truncate">EN / FR differ: {current.parity}</Badge>
          ) : current && !current.missing ? (
            <Badge tone="ok">EN / FR in step</Badge>
          ) : null}
          {pdfNotice ? (
            <Badge tone={pdfNotice.tone} className="max-w-[28rem] truncate">{pdfNotice.text}</Badge>
          ) : current?.pdf === 'stale' ? (
            <Badge tone="warn">PDF older than YAML · save to refresh</Badge>
          ) : current?.pdf === 'missing' ? (
            <Badge tone="warn">No PDF yet · save to render</Badge>
          ) : null}
          {current && current.pdf !== 'missing' ? (
            <a
              href={`/api/masters/${source.lang}?family=${source.family}${source.variant ? `&variant=${source.variant}` : ''}&pdf=1`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-[var(--color-accent)] hover:bg-[var(--color-accent-soft)]"
            >
              Saved PDF <ExternalLink aria-hidden="true" size={11} />
            </a>
          ) : null}
          <span
            className="hidden items-center text-[var(--color-faint)] lg:inline-flex"
            title={`Alt+1–${DOCUMENTS.length}: open a document · Alt+L: switch language · Ctrl+S: save`}
          >
            <Keyboard aria-hidden="true" size={14} />
          </span>
        </span>
      </div>

      {error ? (
        <Card>
          <Empty title="This resume file does not exist yet" hint={error} />
          <div className="flex flex-wrap justify-center gap-2 px-5 pb-6">
            {available.slice(0, 4).map((item) => (
              <button key={item.id} type="button" onClick={() => open(item.id)} className="min-h-9 rounded-lg border px-3 text-xs font-medium hover:bg-[var(--color-surface-2)]">
                Open {sourceById(item.id).label}
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
            onDirtyChange={setDirty}
            chatScope={`profile:${src}`}
            reviewSource={source.id}
          />
        </div>
      )}
    </div>
  )
}

function DocTile({
  doc, shortcut, active, loading, meta, onClick,
}: {
  doc: Document
  shortcut: number
  active: boolean
  loading: boolean
  meta: SourceMeta | undefined
  onClick: () => void
}) {
  const info = DOC_INFO[doc.key]
  const master = doc.family === 'masters'
  const warn = meta && !meta.missing && (meta.parity || meta.pdf !== 'synced')

  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      aria-keyshortcuts={`Alt+${shortcut}`}
      className={cn(
        'group relative flex min-h-[6.5rem] flex-col rounded-xl border bg-[var(--color-surface)] p-3 text-left transition-all',
        'hover:-translate-y-px hover:border-[var(--color-border-strong)] hover:shadow-sm focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]',
        master && 'border-dashed',
        active && 'border-solid border-[var(--color-accent)] bg-[var(--color-accent-soft)]/40 shadow-sm hover:border-[var(--color-accent)]',
      )}
    >
      <span className="flex items-center gap-2">
        <span className={cn(
          'grid size-7 shrink-0 place-items-center rounded-lg bg-[var(--color-surface-2)] text-[var(--color-muted)] transition-colors',
          active && 'bg-[var(--color-accent)] text-[var(--color-bg)]',
        )}>
          {loading ? <Spinner className="size-3" /> : <info.icon aria-hidden="true" size={15} />}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{doc.name}</span>
        <kbd className="hidden rounded border px-1 font-mono text-[10px] text-[var(--color-faint)] lg:group-hover:inline">
          Alt {shortcut}
        </kbd>
      </span>
      <span className="mt-1.5 line-clamp-2 text-[11px] leading-snug text-[var(--color-muted)]">{info.hint}</span>

      <span className="mt-auto flex items-center gap-2 pt-2 text-[11px] text-[var(--color-faint)]">
        {meta?.missing ? (
          <span className="text-[var(--color-warn)]">File missing</span>
        ) : (
          <>
            {meta?.bullets !== null && meta?.bullets !== undefined ? <span className="tnum">{meta.bullets} bullets</span> : null}
            {meta?.edited ? <span suppressHydrationWarning title={new Date(meta.edited).toLocaleString()}>· {ago(meta.edited)}</span> : null}
            <span
              className={cn('ml-auto size-2 rounded-full', warn ? 'bg-[var(--color-warn)]' : 'bg-[var(--color-ok)]')}
              title={statusText(meta)}
              aria-label={statusText(meta)}
            />
          </>
        )}
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
    <div role="radiogroup" aria-label="Resume language" aria-keyshortcuts="Alt+L" className="inline-flex rounded-lg border bg-[var(--color-surface)] p-0.5">
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
              lang === value && 'bg-[var(--color-surface-2)] text-[var(--color-text)] shadow-sm',
            )}
          >
            <span className="font-mono text-[10px] tracking-wider opacity-70">{value.toUpperCase()}</span>
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
