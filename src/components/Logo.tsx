/**
 * Onward's mark: a lowercase o that points forward, on a solid cinnabar tile. The
 * same drawing as src/app/icon.svg, here in the theme's own cinnabar and on-solid ink.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={className}>
      <rect width="64" height="64" rx="15" fill="var(--color-accent)" />
      <path
        d="M47 32 L36.17 22.31 A13 13 0 1 0 36.17 41.69 Z"
        fill="none"
        stroke="var(--color-on-solid)"
        strokeWidth="7"
        strokeLinejoin="miter"
        strokeMiterlimit="10"
      />
    </svg>
  )
}
