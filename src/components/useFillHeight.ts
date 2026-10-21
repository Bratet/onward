'use client'

import { useEffect, type RefObject } from 'react'

/**
 * On a wide screen, a side panel runs from where it starts to the bottom of
 * the window, and keeps that whole height once it sticks under the top bar
 * (`top`, in pixels). Narrow screens keep the panel's own height.
 */
export function useFillHeight(ref: RefObject<HTMLElement | null>, active = true, top = 96) {
  useEffect(() => {
    const panel = ref.current
    if (!panel || !active) return
    const wide = window.matchMedia('(min-width: 1024px)')
    let frame = 0
    const fit = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const rect = panel.getBoundingClientRect()
        // Hidden (a step not shown) or narrow: leave the stylesheet's height.
        if (!wide.matches || !rect.height) { panel.style.height = ''; return }
        panel.style.height = `${Math.max(420, window.innerHeight - Math.max(rect.top, top) - 16)}px`
      })
    }
    fit()
    // A panel inside a hidden step or tab has no size; measure again when it is shown.
    let shown = panel.getBoundingClientRect().height > 0
    const observer = new ResizeObserver(() => {
      const now = panel.getBoundingClientRect().height > 0
      if (now !== shown) { shown = now; fit() }
    })
    observer.observe(panel)
    window.addEventListener('scroll', fit, { passive: true })
    window.addEventListener('resize', fit)
    return () => { cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener('scroll', fit); window.removeEventListener('resize', fit) }
  }, [ref, active, top])
}
