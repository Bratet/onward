'use client'

import { useEffect, useRef, useState } from 'react'
import { Trash2, X } from 'lucide-react'
import { ErrorNotice } from '@/components/ErrorNotice'
import { Spinner } from '@/components/ui/primitives'
import { ARCHETYPES, ARCHETYPE_LABELS, GENERAL_BASE, type Archetype, type ResumeProfile } from '@/lib/tailoring/baseCv'
import { cn } from '@/lib/utils'

const button = 'inline-flex min-h-8 items-center justify-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 text-xs text-[var(--color-muted)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)] disabled:opacity-40'
const primary = 'inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3.5 text-xs font-semibold text-[var(--color-on-solid)] transition-opacity hover:opacity-90 disabled:opacity-40'
const input = 'w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-sm text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none disabled:opacity-50'

export type ManageProfile = { kind: 'create' } | { kind: 'edit'; profile: ResumeProfile }

async function readJson<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({ error: `The server answered ${response.status}` }))
  if (!response.ok) throw new Error(data.error ?? `The server answered ${response.status}`)
  return data as T
}

/**
 * Create a profile as a copy of an existing general resume, or rename one,
 * change the role types it is picked for, or delete it. Mounted only while
 * open, so each opening starts from the profile as saved.
 */
export function ProfileDialog({ manage, profiles, startable, unsaved, onClose, onCreated, onUpdated, onDeleted }: {
  manage: ManageProfile
  profiles: ResumeProfile[]
  /** Ids of the general resumes with files to copy: `general` and profile ids. */
  startable: string[]
  /** The open resume has unsaved edits that deleting it would drop. */
  unsaved: boolean
  onClose: () => void
  onCreated: (profile: ResumeProfile) => void
  onUpdated: () => void
  onDeleted: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const editing = manage.kind === 'edit' ? manage.profile : null
  const [name, setName] = useState(editing?.name ?? '')
  const [archetypes, setArchetypes] = useState<Archetype[]>(editing?.archetypes ?? [])
  const [from, setFrom] = useState(startable.includes(GENERAL_BASE.id) ? GENERAL_BASE.id : startable[0] ?? GENERAL_BASE.id)
  const [busy, setBusy] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const others = profiles.filter((profile) => profile.id !== editing?.id)
  const starts = [{ id: GENERAL_BASE.id, name: `${GENERAL_BASE.name} resume` }, ...profiles].filter((option) => startable.includes(option.id))

  useEffect(() => { if (!dialog.current?.open) dialog.current?.showModal() }, [])

  function toggle(archetype: Archetype) {
    setArchetypes(archetypes.includes(archetype) ? archetypes.filter((a) => a !== archetype) : [...archetypes, archetype])
  }

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try { await action() } catch (reason) {
      setError((reason as Error).message)
      setBusy(false)
    }
  }

  const save = () => run(async () => {
    if (editing) {
      await readJson(await fetch(`/api/profile/resumes/${encodeURIComponent(editing.id)}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, archetypes }),
      }))
      onUpdated()
    } else {
      const { profile } = await readJson<{ profile: ResumeProfile }>(await fetch('/api/profile/resumes', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, archetypes, from }),
      }))
      onCreated(profile)
    }
  })

  const remove = () => run(async () => {
    await readJson(await fetch(`/api/profile/resumes/${encodeURIComponent(editing!.id)}`, { method: 'DELETE' }))
    onDeleted()
  })

  return (
    <dialog
      ref={dialog}
      aria-labelledby="profile-dialog-title"
      onCancel={(event) => { event.preventDefault(); if (!busy) onClose() }}
      onClick={(event) => { if (event.target === dialog.current && !busy) onClose() }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[min(34rem,calc(100vw-2rem))] max-w-none overflow-y-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-0 text-[var(--color-text)] shadow-xl backdrop:bg-black/40"
    >
      <form onSubmit={(event) => { event.preventDefault(); void save() }} className="space-y-5 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="profile-dialog-title" className="text-base font-semibold">{editing ? `${editing.name} profile` : 'New profile'}</h2>
            <p className="mt-1 text-xs leading-relaxed text-[var(--color-muted)]">
              {editing
                ? 'Rename it or change when new applications start from it. Its resumes stay as they are.'
                : 'A general resume aimed at one kind of role. It starts as a copy you then edit, in English and French.'}
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="grid size-8 shrink-0 place-items-center rounded-lg text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"><X size={16} aria-hidden="true" /></button>
        </div>

        <label className="block text-xs text-[var(--color-muted)]">Name
          <input required autoFocus maxLength={40} value={name} onChange={(event) => setName(event.target.value)} placeholder="Backend Engineer" className={cn(input, 'mt-1')} />
        </label>

        {editing ? null : (
          <label className="block text-xs text-[var(--color-muted)]">Start as a copy of
            <select value={from} onChange={(event) => setFrom(event.target.value)} className={cn(input, 'mt-1')}>
              {starts.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
            </select>
          </label>
        )}

        <fieldset>
          <legend className="text-xs text-[var(--color-muted)]">Suggest it for these roles</legend>
          <p className="mt-0.5 text-xs leading-relaxed text-[var(--color-faint)]">When the job analysis sorts a posting into one of these, the new application starts from this profile. You can still pick another resume each time.</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {ARCHETYPES.map((archetype) => {
              const owner = others.find((profile) => profile.archetypes.includes(archetype))
              const checked = archetypes.includes(archetype)
              const label = ARCHETYPE_LABELS[archetype]
              return (
                <label
                  key={archetype}
                  title={owner ? `Already suggested for ${owner.name}` : undefined}
                  className={cn(
                    'inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--color-accent)]',
                    checked ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] font-medium text-[var(--color-accent)]'
                      : owner ? 'cursor-not-allowed border-dashed border-[var(--color-border)] text-[var(--color-faint)]'
                        : 'border-[var(--color-border)] text-[var(--color-muted)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)]',
                  )}
                >
                  <input type="checkbox" checked={checked} disabled={!!owner || busy} onChange={() => toggle(archetype)} className="sr-only" />
                  {label[0].toUpperCase() + label.slice(1)}
                  {owner ? <span>· {owner.name}</span> : null}
                </label>
              )
            })}
          </div>
        </fieldset>

        {error ? <ErrorNotice error={error} onDismiss={() => setError(null)} /> : null}

        {removing && editing ? (
          <div role="group" aria-label="Confirm deletion" className="space-y-3 rounded-lg border border-[var(--color-bad)] bg-[var(--color-bad-soft)] p-3 text-xs">
            <p className="leading-relaxed">
              Delete <strong className="font-semibold">{editing.name}</strong>? Its English and French resumes move to the workspace trash, and new applications stop offering it. Applications already made keep their own copies.
              {unsaved ? ' Your unsaved edits to it are lost too.' : ''}
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setRemoving(false)} disabled={busy} className={button}>Keep it</button>
              <button type="button" onClick={() => void remove()} disabled={busy} className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-lg bg-[var(--color-bad)] px-3 text-xs font-semibold text-[var(--color-on-solid)] transition-opacity hover:opacity-90 disabled:opacity-40">
                {busy ? <Spinner /> : <Trash2 size={13} aria-hidden="true" />}Delete profile
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {editing ? (
              <button type="button" onClick={() => setRemoving(true)} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-[var(--color-muted)] hover:text-[var(--color-bad)]">
                <Trash2 size={13} aria-hidden="true" />Delete profile
              </button>
            ) : null}
            <span className="ml-auto flex gap-2">
              <button type="button" onClick={onClose} disabled={busy} className={button}>Cancel</button>
              <button type="submit" disabled={busy || !name.trim() || (!editing && !starts.length)} className={primary}>
                {busy ? <Spinner /> : null}{editing ? 'Save' : 'Create profile'}
              </button>
            </span>
          </div>
        )}
      </form>
    </dialog>
  )
}
