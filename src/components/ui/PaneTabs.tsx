'use client'

import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** The ids that tie a pane tab to its panel; give the panel `paneTabPanelProps(base, value)`. */
export function paneTabPanelProps(base: string, value: string) {
  return { id: `${base}-panel-${value}`, role: 'tabpanel' as const, 'aria-labelledby': `${base}-tab-${value}` }
}

/**
 * Tabs that switch what one pane shows. One style for every pane, and the
 * keyboard pattern screen readers expect: arrows move between tabs, Home and
 * End jump to the ends, and only the selected tab is in the tab order.
 */
export function PaneTabs<T extends string>({ items, value, onChange, label, idBase, className }: {
  items: { value: T; label: ReactNode; icon?: ReactNode; badge?: ReactNode }[]
  value: T
  onChange: (value: T) => void
  label: string
  idBase: string
  className?: string
}) {
  const list = useRef<HTMLDivElement>(null)

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = items.length - 1
    const target = event.key === 'ArrowRight' ? (index === last ? 0 : index + 1)
      : event.key === 'ArrowLeft' ? (index === 0 ? last : index - 1)
      : event.key === 'Home' ? 0
      : event.key === 'End' ? last
      : null
    if (target === null) return
    event.preventDefault()
    onChange(items[target].value)
    list.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[target]?.focus()
  }

  return <div ref={list} role="tablist" aria-label={label} className={cn('pane-tabs', className)}>
    {items.map((item, index) => {
      const selected = item.value === value
      return <button
        key={item.value}
        type="button"
        role="tab"
        id={`${idBase}-tab-${item.value}`}
        aria-controls={`${idBase}-panel-${item.value}`}
        aria-selected={selected}
        tabIndex={selected ? 0 : -1}
        onClick={() => onChange(item.value)}
        onKeyDown={(event) => onKeyDown(event, index)}
        className="pane-tab"
      >
        {item.icon ? <span aria-hidden="true">{item.icon}</span> : null}
        {item.label}
        {item.badge}
      </button>
    })}
  </div>
}
