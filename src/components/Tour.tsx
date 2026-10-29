'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { ArrowRight } from 'lucide-react'

/** Opens the tour on the Overview page; the welcome page, Settings and the desktop Help menu link here. */
export const TOUR_HREF = '/?tour=1'

interface Stop {
  /** `data-tour` names of the real controls to light up; several are lit as one area. */
  targets: string[]
  title: string
  body: string
}

const STOPS: Stop[] = [
  {
    targets: ['overview'],
    title: 'Overview',
    body: 'How your search is going: what you applied to this week, each day’s activity, where every application stands, and the interviews coming up.',
  },
  {
    targets: ['applications'],
    title: 'Applications',
    body: 'Every job you are pursuing, with its status and next step. Open one and work through it in order: Fit, Resume, Documents, Send, then Interviewing.',
  },
  {
    targets: ['searches'],
    title: 'Saved searches',
    body: 'Your filtered job-board links in one place, so the next role is one click away.',
  },
  {
    targets: ['profile'],
    title: 'Profile',
    body: 'Your master and general resumes. Every tailored CV starts from them, so new experience goes here first.',
  },
  {
    targets: ['skills', 'runs'],
    title: 'Skills and AI runs',
    body: 'Skills are the instructions each AI step follows: edit one to change how Onward writes. AI runs shows what each run was given and how it finished.',
  },
  {
    targets: ['settings'],
    title: 'Settings',
    body: 'Light or dark, which AI tool and model each task uses, and app updates.',
  },
  {
    targets: ['new'],
    title: 'Start with a job',
    body: 'Paste a posting or its link. Onward reads it, checks your fit and sets up the application. Nothing is ever sent for you.',
  },
]

const GAP = 6
const CARD = 352

interface Box { top: number; left: number; width: number; height: number }

/**
 * A short tour of the real app: it lights up each place in the top bar in turn
 * and says what it is for, then ends on New application. It runs only when
 * asked (?tour=1), so a returning user never meets it uninvited.
 */
export function Tour() {
  const pathname = usePathname()
  const params = useSearchParams()
  const router = useRouter()
  const [index, setIndex] = useState<number | null>(null)
  const [box, setBox] = useState<Box | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const primary = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (params.get('tour') !== '1') return
    const rest = new URLSearchParams(params)
    rest.delete('tour')
    router.replace(rest.size ? `${pathname}?${rest}` : pathname, { scroll: false })
    window.scrollTo(0, 0)
    setIndex(0)
  }, [params, pathname, router])

  const stop = index === null ? null : STOPS[index]
  const last = index === STOPS.length - 1

  // Light up the stop's controls, and follow them if the window or the nav row moves.
  useLayoutEffect(() => {
    if (!stop) return
    const elements = stop.targets
      .map((name) => document.querySelector<HTMLElement>(`[data-tour="${name}"]`))
      .filter((element): element is HTMLElement => element !== null)
    // On a phone the links scroll sideways: bring this one into view first.
    elements[0]?.scrollIntoView({ block: 'nearest', inline: 'center' })
    const measure = () => {
      const rects = elements.map((element) => element.getBoundingClientRect()).filter((rect) => rect.width > 0)
      if (!rects.length) return setBox(null)
      const top = Math.min(...rects.map((rect) => rect.top))
      const left = Math.min(...rects.map((rect) => rect.left))
      setBox({
        top,
        left,
        width: Math.max(...rects.map((rect) => rect.right)) - left,
        height: Math.max(...rects.map((rect) => rect.bottom)) - top,
      })
    }
    measure()
    const nav = elements[0]?.closest('nav')
    window.addEventListener('resize', measure)
    nav?.addEventListener('scroll', measure)
    return () => {
      window.removeEventListener('resize', measure)
      nav?.removeEventListener('scroll', measure)
    }
  }, [stop])

  useEffect(() => {
    if (index === null) return
    if (!dialog.current?.open) dialog.current?.showModal()
    primary.current?.focus()
  }, [index])

  const end = useCallback(() => {
    dialog.current?.close()
    setIndex(null)
    setBox(null)
  }, [])

  function go(step: number) {
    if (step < 0) return
    if (step >= STOPS.length) return end()
    setIndex(step)
  }

  function addJob() {
    end()
    document.querySelector<HTMLButtonElement>('[data-tour="new"]')?.click()
  }

  function keys(event: KeyboardEvent) {
    if (index === null) return
    if (event.key === 'ArrowRight') go(index + 1)
    if (event.key === 'ArrowLeft') go(index - 1)
  }

  if (!stop || index === null) return null

  const viewport = typeof window === 'undefined' ? 1024 : window.innerWidth
  const width = Math.min(CARD, viewport - 32)
  const cardLeft = box ? Math.min(Math.max(box.left + box.width / 2 - width / 2, 16), viewport - width - 16) : (viewport - width) / 2
  const cardTop = box ? box.top + box.height + GAP + 12 : 96

  return (
    <>
      {box ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-[60] rounded-[9px] transition-[top,left,width,height] duration-300 ease-[var(--ease-out-soft)] motion-reduce:transition-none"
          style={{
            top: box.top - GAP,
            left: box.left - GAP,
            width: box.width + GAP * 2,
            height: box.height + GAP * 2,
            boxShadow: '0 0 0 2px var(--color-accent), 0 0 0 200vmax oklch(0.14 0.01 60 / 0.55)',
          }}
        />
      ) : null}
      <dialog
        ref={dialog}
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        onCancel={(event) => { event.preventDefault(); end() }}
        onKeyDown={keys}
        style={{ top: cardTop, left: cardLeft, width }}
        className="fixed inset-auto m-0 max-w-none rounded-[9px] border border-[var(--color-border)] bg-[var(--color-surface)] p-0 text-[var(--color-text)] shadow-[var(--shadow-sheet)] transition-[top,left] duration-300 ease-[var(--ease-out-soft)] backdrop:bg-transparent motion-reduce:transition-none"
      >
        <div key={index} className="anim-settle px-5 pt-4 pb-4">
          <p className="text-xs text-[var(--color-faint)] tnum">{index + 1} of {STOPS.length}</p>
          <h2 id="tour-title" className="mt-1 font-display text-[17px] leading-snug">{stop.title}</h2>
          <p id="tour-body" className="mt-1.5 text-[13.5px] leading-relaxed text-[var(--color-muted)]">{stop.body}</p>
        </div>
        <div className="flex items-center gap-2 border-t border-[var(--color-border)] px-5 py-3">
          <button type="button" className={textButton} onClick={end}>{last ? 'Not now' : 'Skip tour'}</button>
          {index > 0 ? <button type="button" className={`${secondaryButton} ml-auto`} onClick={() => go(index - 1)}>Back</button> : null}
          <button ref={primary} type="button" className={`${primaryButton} ${index > 0 ? '' : 'ml-auto'}`} onClick={last ? addJob : () => go(index + 1)}>
            {last ? 'Add a job' : 'Next'}
            <ArrowRight aria-hidden="true" className="size-4" />
          </button>
        </div>
      </dialog>
    </>
  )
}

const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]'
const textButton = `min-h-8 cursor-pointer rounded-[5px] text-xs font-medium text-[var(--color-muted)] underline-offset-4 hover:text-[var(--color-text)] hover:underline max-sm:min-h-11 ${focusRing}`
const secondaryButton = `inline-flex min-h-8 cursor-pointer items-center rounded-[5px] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 text-xs font-medium transition-colors hover:bg-[var(--color-surface-2)] max-sm:min-h-11 ${focusRing}`
const primaryButton = `inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-[7px] bg-[var(--color-accent)] px-3.5 text-xs font-semibold text-[var(--color-on-solid)] shadow-[0_1px_2px_oklch(0_0_0/0.15)] transition-[filter] hover:brightness-110 max-sm:min-h-11 ${focusRing}`
