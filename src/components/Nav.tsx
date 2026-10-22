'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { LogoMark } from './Logo'
import { NewApplicationDialog } from './NewApplicationDialog'
import { useEffect, useRef } from 'react'
import { Settings2 } from 'lucide-react'

const LINKS = [
  { href: '/', label: 'Overview' },
  { href: '/applications', label: 'Applications' },
  { href: '/plan', label: 'Saved searches' },
  { href: '/profile', label: 'Profile' },
  { href: '/skills', label: 'Skills' },
  { href: '/runs', label: 'AI runs' },
]

export function Nav() {
  const pathname = usePathname()
  const navRef = useRef<HTMLElement>(null)
  // On a narrow screen the links scroll sideways; keep the current one in view.
  useEffect(() => {
    navRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [pathname])

  // Getting started is one focused task; the rest of the app is empty until it is done.
  if (pathname === '/welcome') return null

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[var(--color-bg)]">
      <div className="mx-auto flex min-h-14 max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-1 px-4 py-1.5 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2.5 text-sm font-semibold tracking-tight" aria-label="Onward home">
          <LogoMark className="size-8" />
          <span>onward</span>
        </Link>
        <nav ref={navRef} aria-label="Primary navigation" className="no-scrollbar order-last flex w-full items-stretch gap-5 overflow-x-auto sm:order-none sm:w-auto">
          {LINKS.map((link) => {
            const active = link.href === '/' ? pathname === '/' : pathname.startsWith(link.href)
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'shrink-0 whitespace-nowrap border-b-2 py-2 text-[13px] transition-colors',
                  active
                    ? 'border-[var(--color-accent)] font-semibold text-[var(--color-text)]'
                    : 'border-transparent font-medium text-[var(--color-muted)] hover:text-[var(--color-text)]',
                )}
                aria-current={active ? 'page' : undefined}
              >
                {link.label}
              </Link>
            )
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/settings"
            aria-label="Settings"
            aria-current={pathname.startsWith('/settings') ? 'page' : undefined}
            className={cn('grid size-8 place-items-center rounded-md text-[var(--color-muted)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]', pathname.startsWith('/settings') && 'bg-[var(--color-surface-2)] text-[var(--color-text)]')}
          >
            <Settings2 aria-hidden="true" className="size-4" />
          </Link>
          <NewApplicationDialog />
        </div>
      </div>
    </header>
  )
}
