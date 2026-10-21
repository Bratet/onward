'use client'

import { useRef, useState } from 'react'
import { ArrowUpRight, Plus, Search, X } from 'lucide-react'
import { Badge, Card } from '@/components/ui/primitives'
import { savedSearchSchema, type SavedSearch } from '@/lib/savedSearchSchema'
import { EXPERIENCE_LEVELS, INDEED_SITES, PLATFORMS, WORKPLACES, buildSearchUrl, defaultFilters, describeFilters, parseSearchUrl, postedOptions, type Platform, type SearchFilters } from '@/lib/searchBuilder'

const secondaryButton = 'inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors hover:bg-[var(--color-surface-2)] disabled:cursor-not-allowed disabled:opacity-50'
const primaryButton = 'inline-flex min-h-9 items-center justify-center gap-2 rounded-lg bg-[var(--color-accent)] px-3 py-2 text-xs font-semibold text-[var(--color-on-solid)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50'
const input = 'mt-1.5 block min-h-10 w-full rounded-lg border bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-faint)]'
const blank = (): SavedSearch => ({ id: crypto.randomUUID(), title: '', url: '', track: '', notes: '' })

type Builder = Omit<SearchFilters, 'titles' | 'exclude'> & { titles: string; exclude: string }

const splitTerms = (text: string) => text.split(',').map((term) => term.trim()).filter(Boolean)
const toFilters = (builder: Builder): SearchFilters => ({ ...builder, titles: splitTerms(builder.titles), exclude: splitTerms(builder.exclude) })
const toBuilder = (filters: SearchFilters): Builder => ({ ...filters, titles: filters.titles.join(', '), exclude: filters.exclude.join(', ') })
const toggle = <T,>(items: T[], item: T) => items.includes(item) ? items.filter((value) => value !== item) : [...items, item]

function hostname(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, '') }
  catch { return url }
}

export function ApplyPlan({ initial }: { initial: { searches: SavedSearch[]; revision: string } }) {
  const [data, setData] = useState(initial)
  const [draft, setDraft] = useState<SavedSearch | null>(null)
  const [builder, setBuilder] = useState<Builder | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [trackFilter, setTrackFilter] = useState('')
  const [query, setQuery] = useState('')
  const [removing, setRemoving] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const addRef = useRef<HTMLButtonElement>(null)
  const tracks = [...new Set(data.searches.map((search) => search.track || 'Other'))].sort((a, b) => a.localeCompare(b))
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const visible = data.searches.filter((search) =>
    (!trackFilter || (search.track || 'Other') === trackFilter)
    && (!normalizedQuery || [search.title, search.track, search.notes, hostname(search.url)].some((value) => value.toLocaleLowerCase().includes(normalizedQuery))),
  )
  const editing = draft && data.searches.some((search) => search.id === draft.id)

  function draftChanged() {
    if (!draft) return false
    const original = data.searches.find((search) => search.id === draft.id)
    return JSON.stringify(draft) !== JSON.stringify(original ?? { ...draft, title: '', url: '', track: '', notes: '' })
  }

  function edit(search: SavedSearch) {
    if (draftChanged() && !window.confirm('Discard your unsaved search changes?')) return
    setDraft({ ...search })
    const parsed = search.url ? parseSearchUrl(search.url) : defaultFilters()
    setBuilder(parsed && toBuilder(parsed))
    setError('')
    setNotice('')
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      formRef.current?.querySelector('input')?.focus()
    })
  }

  function updateBuilder(next: Builder) {
    if (!draft) return
    const filters = toFilters(next)
    const autoNotes = !draft.notes.trim() || (builder && draft.notes === describeFilters(toFilters(builder)))
    setBuilder(next)
    setDraft({ ...draft, url: filters.titles.length ? buildSearchUrl(filters) : '', notes: autoNotes ? describeFilters(filters) : draft.notes })
  }

  function choosePlatform(platform: Platform | 'custom') {
    if (!draft) return
    if (platform === 'custom') { setBuilder(null); return }
    const base = builder ?? toBuilder(parseSearchUrl(draft.url) ?? defaultFilters(platform))
    const postedDays = postedOptions(platform).some((option) => option.days === base.postedDays) ? base.postedDays : null
    updateBuilder({ ...base, platform, postedDays })
  }

  function cancel() {
    if (draftChanged() && !window.confirm('Discard your unsaved search changes?')) return
    setDraft(null)
    setError('')
    addRef.current?.focus()
  }

  async function save(searches: SavedSearch[], message: string) {
    if (busy) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch('/api/saved-searches', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ searches, revision: data.revision }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Could not save your searches.')
      setData(result)
      setDraft(null)
      setRemoving(null)
      if (trackFilter && !searches.some((search) => (search.track || 'Other') === trackFilter)) setTrackFilter('')
      setNotice(message)
      addRef.current?.focus()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Saved searches</h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--color-muted)]">Keep your filtered job-board links in one place. Open a search when you’re ready to find the next role.</p>
        </div>
        <button ref={addRef} type="button" className={primaryButton} disabled={busy} onClick={() => edit(blank())}><Plus size={16} aria-hidden="true" />Add search</button>
      </div>

      {notice && <p role="status" className="text-xs text-[var(--color-ok)]">{notice}</p>}
      {busy && <p role="status" className="text-xs text-[var(--color-muted)]">Saving changes…</p>}

      {draft && (
        <Card className="p-4 sm:p-6">
          <form ref={formRef} className="max-w-3xl space-y-5" onSubmit={(event) => {
            event.preventDefault()
            if (builder && !splitTerms(builder.titles).length) { setError('Add at least one job title.'); return }
            const parsed = savedSearchSchema.safeParse(draft)
            if (!parsed.success) { setError(parsed.error.issues[0].message); return }
            const searches = editing
              ? data.searches.map((search) => search.id === draft.id ? parsed.data : search)
              : [...data.searches, parsed.data]
            void save(searches, editing ? 'Search updated.' : 'Search added.')
          }}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">{editing ? 'Edit saved search' : 'Add a saved search'}</h2>
                <p className="mt-1 text-xs text-[var(--color-muted)]">Pick a job board and fill in the filters, and the search link is built for you. You can also paste a link you already have.</p>
              </div>
              <button type="button" onClick={cancel} aria-label="Close search form" className="grid size-8 shrink-0 place-items-center rounded-lg text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"><X size={16} aria-hidden="true" /></button>
            </div>
            <fieldset disabled={busy} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-xs font-medium">Search name<input required maxLength={120} className={input} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="AI roles · remote worldwide" /></label>
                <label className="text-xs font-medium">Track <span className="font-normal text-[var(--color-muted)]">(optional)</span><input maxLength={80} list="search-tracks" className={input} value={draft.track} onChange={(event) => setDraft({ ...draft, track: event.target.value })} placeholder="Remote" /><datalist id="search-tracks">{tracks.map((track) => <option key={track} value={track} />)}</datalist></label>
              </div>
              <div role="radiogroup" aria-label="Job board" className="inline-flex flex-wrap gap-1 rounded-lg border p-1">
                {[...PLATFORMS, { value: 'custom' as const, label: 'Paste a URL' }].map((option) => {
                  const active = (builder?.platform ?? 'custom') === option.value
                  return <button key={option.value} type="button" role="radio" aria-checked={active} onClick={() => choosePlatform(option.value)} className={'min-h-8 rounded-md px-3 text-xs font-medium transition-colors ' + (active ? 'bg-[var(--color-accent)] text-[var(--color-on-solid)]' : 'text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]')}>{option.label}</button>
                })}
              </div>
              {builder ? (
                <div className="space-y-4 rounded-lg border p-4">
                  <label className="block text-xs font-medium">Job titles <span className="font-normal text-[var(--color-muted)]">(separate with commas)</span><input className={input} value={builder.titles} onChange={(event) => updateBuilder({ ...builder, titles: event.target.value })} placeholder="machine learning engineer, AI engineer, data scientist" /></label>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="text-xs font-medium">Location <span className="font-normal text-[var(--color-muted)]">(optional)</span><input maxLength={120} className={input} value={builder.location} onChange={(event) => updateBuilder({ ...builder, location: event.target.value })} placeholder={builder.platform === 'indeed' ? 'Bruxelles, or Remote' : 'Belgium'} /></label>
                    <label className="text-xs font-medium">Exclude words <span className="font-normal text-[var(--color-muted)]">(optional)</span><input className={input} value={builder.exclude} onChange={(event) => updateBuilder({ ...builder, exclude: event.target.value })} placeholder="senior, intern" /></label>
                    {builder.platform === 'indeed' && (
                      <label className="text-xs font-medium">Indeed country<select className={input} value={builder.indeedSite} onChange={(event) => updateBuilder({ ...builder, indeedSite: event.target.value })}>{INDEED_SITES.map((site) => <option key={site.value} value={site.value}>{site.label}</option>)}</select></label>
                    )}
                    <label className="text-xs font-medium">Date posted<select className={input} value={builder.postedDays ?? ''} onChange={(event) => updateBuilder({ ...builder, postedDays: event.target.value ? Number(event.target.value) : null })}><option value="">Any time</option>{postedOptions(builder.platform).map((option) => <option key={option.days} value={option.days}>{option.label}</option>)}</select></label>
                    <label className="text-xs font-medium">Sort by<select className={input} value={builder.sort} onChange={(event) => updateBuilder({ ...builder, sort: event.target.value === 'relevant' ? 'relevant' : 'recent' })}><option value="recent">Most recent</option><option value="relevant">Most relevant</option></select></label>
                  </div>
                  {builder.platform === 'linkedin' && (
                    <>
                      <fieldset><legend className="text-xs font-medium">Workplace <span className="font-normal text-[var(--color-muted)]">(none = all)</span></legend><div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">{WORKPLACES.map((item) => <label key={item.value} className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={builder.workplace.includes(item.value)} onChange={() => updateBuilder({ ...builder, workplace: toggle(builder.workplace, item.value) })} />{item.label}</label>)}</div></fieldset>
                      <fieldset><legend className="text-xs font-medium">Experience level <span className="font-normal text-[var(--color-muted)]">(none = all)</span></legend><div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">{EXPERIENCE_LEVELS.map((item) => <label key={item.value} className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={builder.experience.includes(item.value)} onChange={() => updateBuilder({ ...builder, experience: toggle(builder.experience, item.value) })} />{item.label}</label>)}</div></fieldset>
                    </>
                  )}
                  {draft.url ? (
                    <div className="text-xs"><span className="font-medium">Built link</span><a href={draft.url} target="_blank" rel="noopener noreferrer" className="ml-2 inline-flex items-center gap-0.5 font-semibold text-[var(--color-accent)]">Try it<ArrowUpRight size={12} aria-hidden="true" /></a><p className="mt-1 break-all text-[var(--color-muted)]">{draft.url}</p></div>
                  ) : <p className="text-xs text-[var(--color-muted)]">Add at least one job title to build the link.</p>}
                </div>
              ) : (
                <label className="block text-xs font-medium">Search URL<input required type="url" maxLength={12000} className={input} value={draft.url} onChange={(event) => setDraft({ ...draft, url: event.target.value })} placeholder="https://www.linkedin.com/jobs/search/…" /></label>
              )}
              <label className="block text-xs font-medium">Notes <span className="font-normal text-[var(--color-muted)]">(optional)</span><textarea maxLength={2000} rows={3} className={input} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder="What to look for, what to skip, or when to run this search." /></label>
              {error && <p role="alert" className="text-xs text-[var(--color-bad)]">{error}</p>}
              <div className="flex flex-wrap gap-2"><button type="submit" className={primaryButton}>{editing ? 'Save changes' : 'Save search'}</button><button type="button" className={secondaryButton} onClick={cancel}>Cancel</button></div>
            </fieldset>
          </form>
        </Card>
      )}

      {data.searches.length ? (
        <section className="space-y-4" aria-label="Your saved searches">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Your searches <span className="ml-1 font-normal text-[var(--color-muted)] tnum">({data.searches.length})</span></h2>
            <span className="text-xs text-[var(--color-muted)]">Links open in a new tab</span>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="relative min-w-52 flex-1 text-xs font-medium sm:max-w-sm">Find a search
              <Search aria-hidden="true" size={15} className="absolute bottom-3 left-3 text-[var(--color-muted)]" />
              <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} className={input + ' pl-9'} placeholder="Search names and notes" />
            </label>
            <label className="min-w-40 text-xs font-medium">Track
              <select className={input} value={trackFilter} onChange={(event) => setTrackFilter(event.target.value)}>
                <option value="">All tracks</option>
                {tracks.map((track) => <option key={track} value={track}>{track}</option>)}
              </select>
            </label>
            {(query || trackFilter) && <button type="button" className={secondaryButton} onClick={() => { setQuery(''); setTrackFilter('') }}>Clear filters</button>}
          </div>
          {visible.length ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {visible.map((search) => (
                <Card key={search.id} className="flex min-w-0 flex-col overflow-hidden">
                  <a href={search.url} target="_blank" rel="noopener noreferrer" className="group flex flex-1 flex-col p-5 transition-colors hover:bg-[var(--color-surface-2)] focus-visible:-outline-offset-2" aria-label={`Open ${search.title} in a new tab`}>
                    <div className="flex items-center justify-between gap-3"><Badge>{search.track || 'Other'}</Badge><ArrowUpRight size={17} aria-hidden="true" className="shrink-0 text-[var(--color-accent)]" /></div>
                    <h3 className="mt-4 break-words text-base font-semibold group-hover:text-[var(--color-accent)]">{search.title}</h3>
                    {search.notes && <p className="mt-2 line-clamp-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--color-muted)]">{search.notes}</p>}
                    <p className="mt-auto break-all pt-5 text-xs text-[var(--color-muted)]">{hostname(search.url)}</p>
                    <span className="mt-2 text-xs font-semibold text-[var(--color-accent)]">Open search</span>
                  </a>
                  <div className="flex flex-wrap items-center gap-2 border-t px-5 py-3">
                    {removing === search.id ? (
                      <>
                        <span className="mr-auto text-xs">Remove this search?</span>
                        <button type="button" disabled={busy} className={secondaryButton + ' text-[var(--color-bad)]'} onClick={() => void save(data.searches.filter((item) => item.id !== search.id), 'Search removed.')}>Remove</button>
                        <button type="button" disabled={busy} className={secondaryButton} onClick={() => setRemoving(null)}>Keep</button>
                      </>
                    ) : (
                      <>
                        <button type="button" disabled={busy} className={secondaryButton} aria-label={`Edit ${search.title}`} onClick={() => edit(search)}>Edit</button>
                        <button type="button" disabled={busy || draft !== null} className={secondaryButton} aria-label={`Remove ${search.title}`} onClick={() => setRemoving(search.id)}>Remove</button>
                      </>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="p-6 text-center">
              <p className="text-sm font-medium">No searches match your filters</p>
              <p className="mt-1 text-xs text-[var(--color-muted)]">Try a different term or show all tracks.</p>
              <button type="button" className={secondaryButton + ' mt-4'} onClick={() => { setQuery(''); setTrackFilter('') }}>Show all searches</button>
            </Card>
          )}
        </section>
      ) : (
        <Card className="px-6 py-12 text-center">
          <h2 className="text-base font-semibold">Keep your next search close</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-[var(--color-muted)]">Save a filtered job-board URL here, then reopen it whenever you’re ready to look for roles.</p>
          <button type="button" className={primaryButton + ' mt-5'} onClick={() => edit(blank())}><Plus size={16} aria-hidden="true" />Add your first search</button>
        </Card>
      )}
      {!draft && error && <p role="alert" className="text-xs text-[var(--color-bad)]">{error}</p>}
    </div>
  )
}
