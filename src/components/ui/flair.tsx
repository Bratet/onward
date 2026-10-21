'use client'

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Tabs as a pill bar whose highlight slides to the active item. */
export function SegmentedNav<T extends string>({ items, value, onChange, label, className }: {
  items: { value: T; label: ReactNode; icon?: ReactNode; badge?: ReactNode }[]
  value: T
  onChange: (value: T) => void
  label: string
  className?: string
}) {
  const nav = useRef<HTMLDivElement>(null)
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null)

  useLayoutEffect(() => {
    const measure = () => {
      const active = nav.current?.querySelector<HTMLElement>('[aria-current="page"]')
      setIndicator(active ? { left: active.offsetLeft, width: active.offsetWidth } : null)
    }
    measure()
    const observer = new ResizeObserver(measure)
    if (nav.current) observer.observe(nav.current)
    return () => observer.disconnect()
  }, [value, items.length])

  return <div ref={nav} role="navigation" aria-label={label} className={cn('seg-nav', className)}>
    {indicator ? <span className="seg-indicator" style={{ left: indicator.left, width: indicator.width }} aria-hidden="true" /> : null}
    {items.map((item) => <button key={item.value} type="button" onClick={() => onChange(item.value)} aria-current={item.value === value ? 'page' : undefined} className="seg-item">
      {item.icon ? <span aria-hidden="true" className={item.value === value ? 'text-[var(--color-accent)]' : ''}>{item.icon}</span> : null}
      {item.label}
      {item.badge}
    </button>)}
  </div>
}

/** A circular percentage. The stroke animates whenever the value changes. */
export function ProgressRing({ value, size = 64, stroke = 6, children, tone = 'accent' }: { value: number; size?: number; stroke?: number; children?: ReactNode; tone?: 'accent' | 'ok' | 'warn' }) {
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const clamped = Math.max(0, Math.min(100, value))
  return <span className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }}>
    <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--color-border)" strokeWidth={stroke} />
      <circle className="ring-value" cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={`var(--color-${tone})`} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - clamped / 100)} />
    </svg>
    <span className="absolute inset-0 grid place-items-center text-center">{children}</span>
  </span>
}

/** A company monogram: ink initials in a square, like a mark on a letterhead. */
export function CompanyAvatar({ name, size = 44 }: { name: string; size?: number }) {
  const letters = name.replace(/\([^)]*\)/g, '').trim().split(/[\s&.-]+/).filter(Boolean).slice(0, 2).map((word) => word[0]?.toUpperCase()).join('') || '?'
  return <span aria-hidden="true" className="grid shrink-0 place-items-center rounded-md bg-[var(--color-text)] font-bold tracking-tight text-[var(--color-on-solid)]" style={{ width: size, height: size, fontSize: size * 0.4 }}>{letters}</span>
}

const CONFETTI_COLORS = ['var(--color-text)', 'var(--color-ok)', 'var(--color-muted)']

/** A short confetti burst from a point on screen, for milestones worth a smile. */
export function celebrate(origin?: { x: number; y: number }) {
  if (typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const x = origin?.x ?? window.innerWidth / 2
  const y = origin?.y ?? window.innerHeight / 3
  for (let index = 0; index < 48; index++) {
    const piece = document.createElement('span')
    piece.className = 'confetti-piece'
    const angle = Math.random() * Math.PI * 2
    const distance = 120 + Math.random() * 260
    piece.style.left = `${x}px`
    piece.style.top = `${y}px`
    piece.style.background = CONFETTI_COLORS[index % CONFETTI_COLORS.length]
    piece.style.setProperty('--dx', `${Math.cos(angle) * distance}px`)
    piece.style.setProperty('--dy', `${Math.sin(angle) * distance * 0.6 + 260}px`)
    piece.style.setProperty('--rot', `${Math.random() * 720 - 360}deg`)
    piece.style.animationDelay = `${Math.random() * 120}ms`
    document.body.appendChild(piece)
    window.setTimeout(() => piece.remove(), 1700)
  }
}
