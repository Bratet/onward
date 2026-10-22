'use client'

import { useId } from 'react'

/** Onward's mark: a lowercase o that points forward, on the brand tile. The same drawing as src/app/icon.svg. */
export function LogoMark({ className }: { className?: string }) {
  const tile = useId()
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={className}>
      <defs>
        <linearGradient id={tile} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8e5de7" />
          <stop offset="1" stopColor="#5e2ac6" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill={`url(#${tile})`} />
      <path
        d="M47 32 L36.17 22.31 A13 13 0 1 0 36.17 41.69 Z"
        fill="none"
        stroke="#fdfaf4"
        strokeWidth="7"
        strokeLinejoin="miter"
        strokeMiterlimit="10"
      />
    </svg>
  )
}
