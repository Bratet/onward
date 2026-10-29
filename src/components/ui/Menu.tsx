'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * A small ⋯ menu. It closes on Escape (focus returns to the button), on a
 * click outside, and when one of its items runs; items call `close` for that.
 */
export function Menu({ label, children, align = 'right', width = 'w-52', className }: {
  label: string
  children: (close: () => void) => ReactNode
  align?: 'left' | 'right'
  width?: string
  className?: string
}) {
  const root = useRef<HTMLDetailsElement>(null)

  function close() {
    root.current?.removeAttribute('open')
  }

  useEffect(() => {
    function onPointer(event: PointerEvent) {
      if (root.current?.open && !root.current.contains(event.target as Node)) close()
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [])

  return <details
    ref={root}
    className={cn('relative', className)}
    onKeyDown={(event) => {
      if (event.key !== 'Escape' || !root.current?.open) return
      event.preventDefault()
      close()
      root.current.querySelector('summary')?.focus()
    }}
  >
    <summary aria-label={label} title={label} className="grid size-8 cursor-pointer list-none place-items-center rounded-lg border border-[var(--color-border)] text-[var(--color-muted)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] max-sm:size-11 [&::-webkit-details-marker]:hidden"><MoreHorizontal size={15} aria-hidden="true" /></summary>
    <div className={cn('absolute z-20 mt-1 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-lg', align === 'right' ? 'right-0' : 'left-0', width)}>
      {children(close)}
    </div>
  </details>
}

/** One row in a Menu: a label and an optional line of explanation. */
export function MenuItem({ label, hint, disabled, onSelect }: { label: string; hint?: string; disabled?: boolean; onSelect: () => void }) {
  return <button type="button" disabled={disabled} onClick={onSelect} className="block w-full px-3 py-2 text-left hover:bg-[var(--color-surface-2)] focus-visible:bg-[var(--color-surface-2)] focus-visible:outline-none disabled:opacity-40 max-sm:min-h-11">
    <span className="block text-xs font-medium">{label}</span>
    {hint ? <span className="block text-xs text-[var(--color-muted)]">{hint}</span> : null}
  </button>
}
