'use client'

import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { NewApplicationFlow, type FlowState } from '@/app/new/flow'

/**
 * The "New application" button and its dialog. The flow mounts only while the
 * dialog is open, so closing it starts the next one from a clean form. It
 * cannot close while a request runs, and asks before dropping an analysis.
 */
export function NewApplicationDialog() {
  const pathname = usePathname()
  const dialog = useRef<HTMLDialogElement>(null)
  const [open, setOpen] = useState(false)
  const state = useRef<FlowState>('idle')
  const onStateChange = useCallback((next: FlowState) => { state.current = next }, [])

  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal()
    if (!open && dialog.current?.open) dialog.current.close()
  }, [open])

  // Creating an application, or any link in the flow, navigates: the dialog closes with it.
  useEffect(() => { setOpen(false) }, [pathname])

  const close = useCallback(() => {
    if (state.current === 'busy') return
    if (state.current === 'unsaved' && !window.confirm('Close and discard this analysis?')) return
    state.current = 'idle'
    setOpen(false)
  }, [])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        // A secondary in the top bar: it is on every page, so it must not outrank the page's own next move.
        className="flex min-h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 text-xs font-semibold text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
      >
        <Plus aria-hidden="true" className="size-4 text-[var(--color-accent)]" />
        <span className="hidden sm:inline">New application</span><span className="sm:hidden">New</span>
      </button>
      <dialog
        ref={dialog}
        aria-labelledby="new-application-title"
        onCancel={(event) => { event.preventDefault(); close() }}
        onClick={(event) => { if (event.target === dialog.current) close() }}
        className="m-auto max-h-[calc(100dvh-2rem)] w-[min(48rem,calc(100vw-2rem))] max-w-none overflow-y-auto overscroll-contain rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-[var(--color-text)] shadow-xl backdrop:bg-black/40 sm:p-6"
      >
        {open ? <NewApplicationFlow onClose={close} onStateChange={onStateChange} /> : null}
      </dialog>
    </>
  )
}
