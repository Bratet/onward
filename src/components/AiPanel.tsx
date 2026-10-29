'use client'

import { createContext, useContext, useEffect, useRef, useState, type KeyboardEvent, type ReactNode, type Ref } from 'react'
import { ArrowUp, MessageSquareText, PenLine, SlidersHorizontal, Square, X } from 'lucide-react'
import { cn } from '@/lib/utils'

/*
 * The parts every AI panel in an application is built from, so the Fit, Resume,
 * cover letter, form answers, email and LinkedIn AIs read and behave as one:
 * a header with the panel's name and what it uses, a conversation that opens on
 * what the AI is for, a review card when it changed something, and one composer.
 */

/** Quiet header controls: New chat, Chat settings, Close. 44px tall on a phone. */
export const aiHeaderButton = 'inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs text-[var(--color-muted)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-40 max-sm:min-h-11'

/** A message the candidate sent. */
export const aiUserBubble = 'ml-auto max-w-[88%] rounded-lg rounded-br-sm bg-[var(--color-surface-2)] px-3 py-2 text-sm leading-relaxed'

/** A reply from the AI: plain text on the sheet, so its own blocks (proposals, reviews) are not boxed twice. */
export const aiReply = 'min-w-0 text-sm leading-relaxed'

/** A starting point the candidate can pick: it fills the composer, it never sends. */
const promptButton = 'inline-flex min-h-8 cursor-pointer items-center rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2.5 py-1 text-left text-xs font-medium transition-colors hover:bg-[var(--color-surface-2)] disabled:cursor-not-allowed disabled:opacity-40 max-sm:min-h-11'

/** Set while a panel is open as a sheet, so its header can offer Close. */
const SheetClose = createContext<(() => void) | null>(null)

/**
 * Where a step's AI lives. On a wide screen it is the column beside the document:
 * a dialog element styled open but never opened, so nothing takes focus on load.
 * Below that it is a bottom sheet the step's floating button opens modally: the
 * page behind is inert, Esc or the backdrop closes it, and focus returns to what
 * opened it. With a mouse the message box takes focus; on touch the sheet itself
 * does, so the keyboard does not rise over the panel.
 */
export function AiSheet({ label, open, onOpenChange, active = true, className, children }: {
  label: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The sheet's step or document is the one showing. */
  active?: boolean
  className?: string
  children: ReactNode
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const node = dialog.current
    if (!node) return
    const wide = window.matchMedia('(min-width: 1024px)')
    const sync = () => {
      if (open && active && !wide.matches) {
        if (node.open) return
        node.showModal()
        const field = node.querySelector<HTMLTextAreaElement>('textarea.ai-composer-field:not(:disabled)')
        if (field && window.matchMedia('(pointer: fine)').matches) field.focus()
        else node.focus()
      } else if (node.open) node.close()
    }
    sync()
    wide.addEventListener('change', sync)
    return () => wide.removeEventListener('change', sync)
  }, [open, active])
  return <SheetClose.Provider value={open ? () => dialog.current?.close() : null}>
    <dialog ref={dialog} aria-label={label} tabIndex={-1} onClose={() => onOpenChange(false)}
      onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close() }}
      className={cn('static m-0 h-auto max-h-none w-full min-w-0 max-w-none border-0 bg-transparent p-0 text-[var(--color-text)] outline-none backdrop:bg-[oklch(0.1_0.01_65/0.55)] lg:sticky lg:top-20 lg:block',
        'max-lg:fixed max-lg:inset-x-0 max-lg:top-auto max-lg:bottom-0 max-lg:px-2 max-lg:pb-[max(0.5rem,env(safe-area-inset-bottom))]', className)}>
      {/* In the sheet the panel takes 85% of the screen, whatever height it has beside the document. */}
      <div className="max-lg:flex max-lg:h-[85dvh] max-lg:flex-col max-lg:[&>*]:h-full! max-lg:[&>*]:min-h-0">{children}</div>
    </dialog>
  </SheetClose.Provider>
}

/** The floating button that opens a step's AI sheet on a narrow screen. */
export function AiSheetTrigger({ label, onOpen }: { label: string; onOpen: () => void }) {
  return <button type="button" onClick={onOpen} className="ask-button fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-30 h-11 bg-[var(--color-surface)] px-4 text-sm shadow-[var(--shadow-sheet)] lg:hidden">
    <MessageSquareText size={15} aria-hidden="true" />{label}
  </button>
}

export function AiPanelHeader({ title, hint, children }: { title?: string; hint?: string; children?: ReactNode }) {
  const close = useContext(SheetClose)
  return <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-[var(--color-border)] px-4 py-2.5">
    <div className="min-w-0 flex-1 basis-48">
      {title ? <h2 className="text-[17px] leading-tight">{title}</h2> : null}
      {hint ? <p className="mt-0.5 text-xs leading-snug text-[var(--color-muted)]">{hint}</p> : null}
    </div>
    {children || close ? <div className="flex flex-wrap items-center gap-1">
      {children}
      {close ? <button type="button" onClick={close} className={cn(aiHeaderButton, 'lg:hidden')}><X size={14} aria-hidden="true" />Close</button> : null}
    </div> : null}
  </div>
}

/** New chat, asking once before the conversation is cleared. */
export function AiNewChat({ disabled, onClear }: { disabled: boolean; onClear: () => void }) {
  const [confirming, setConfirming] = useState(false)
  if (!confirming) return <button type="button" disabled={disabled} onClick={() => setConfirming(true)} className={aiHeaderButton}>New chat</button>
  return <span role="group" aria-label="Clear this conversation" className="flex items-center gap-1 text-xs">
    <span className="px-1 text-[var(--color-muted)]">Clear this conversation?</span>
    <button type="button" disabled={disabled} onClick={() => { setConfirming(false); onClear() }} className={cn(aiHeaderButton, 'font-medium text-[var(--color-bad)] hover:bg-[var(--color-bad-soft)] hover:text-[var(--color-bad)]')}>Clear</button>
    <button type="button" autoFocus onClick={() => setConfirming(false)} className={aiHeaderButton}>Keep</button>
  </span>
}

export function AiSettingsToggle({ open, controls, onToggle }: { open: boolean; controls: string; onToggle: () => void }) {
  return <button type="button" aria-expanded={open} aria-controls={controls} onClick={onToggle} className={cn(aiHeaderButton, open && 'bg-[var(--color-surface-2)] text-[var(--color-text)]')}>
    <SlidersHorizontal size={14} aria-hidden="true" />Chat settings
  </button>
}

/** The conversation before its first message: what this AI is for, and a few ways to start. */
export function AiEmpty({ title, hint, prompts, disabled, onPick }: { title: string; hint: string; prompts?: string[]; disabled?: boolean; onPick?: (prompt: string) => void }) {
  return <div className="py-2">
    <p className="text-[15px] font-semibold">{title}</p>
    <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-[var(--color-muted)]">{hint}</p>
    {prompts?.length && onPick ? <AiPrompts className="mt-4" prompts={prompts} disabled={disabled} onPick={onPick} /> : null}
  </div>
}

export function AiPrompts({ prompts, disabled, onPick, className }: { prompts: string[]; disabled?: boolean; onPick: (prompt: string) => void; className?: string }) {
  return <div className={cn('flex flex-wrap gap-1.5', className)}>
    {prompts.map((prompt) => <button key={prompt} type="button" disabled={disabled} onClick={() => onPick(prompt)} className={promptButton}>{prompt}</button>)}
  </div>
}

/** What the AI changed, with the candidate's choice to keep it or put the previous version back. */
export function AiReview({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return <div role="group" aria-label={title} className="space-y-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
    <div>
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-[var(--color-muted)]">{hint}</p>
    </div>
    <div className="flex flex-wrap items-center gap-2">{children}</div>
  </div>
}

/** The AI cannot start yet; says why and links to the fix. */
export function AiBlocked({ title, hint, action }: { title: string; hint: string; action?: ReactNode }) {
  return <div className="shrink-0 space-y-1 border-t border-[var(--color-border)] bg-[var(--color-warn-soft)] px-4 py-3">
    <p className="text-sm font-medium">{title}</p>
    <p className="text-xs text-[var(--color-muted)]">{hint}</p>
    {action ? <div className="pt-1.5">{action}</div> : null}
  </div>
}

/**
 * The one composer. Enter sends, Shift+Enter starts a new line, Esc stops a reply
 * that can be stopped. In a chat the send control is an arrow, so it never reads as
 * the page's main action and never shares a name with the Send step. A brief (email,
 * LinkedIn) is optional instructions for one draft: its control is a labelled
 * secondary button, and it sends with the field empty.
 */
export function AiComposer({ value, onChange, onSubmit, onStop, intent = 'chat', busy = false, blocked = false, disabled = false, highlight = false, label, sendLabel = 'Send message', placeholder, hint, maxLength = 8000, rows = 3, textareaRef, children }: {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  /** Present when a running reply can be stopped. */
  onStop?: () => void
  /** A chat sends a message; a brief sends optional instructions for one draft, even when empty. */
  intent?: 'chat' | 'brief'
  busy?: boolean
  /** Sending is not possible right now (empty, waiting on a review…); typing still is. */
  blocked?: boolean
  disabled?: boolean
  /** A prepared first request: the field is outlined in the action colour until it is sent or changed. */
  highlight?: boolean
  label: string
  /** The send control's name; a brief shows it as the button's text. */
  sendLabel?: string
  placeholder?: string
  hint?: ReactNode
  maxLength?: number
  rows?: number
  textareaRef?: Ref<HTMLTextAreaElement>
  /** Shown above the field: what the message is about, prompts. */
  children?: ReactNode
}) {
  const submit = () => { if (!busy && !blocked && !disabled) onSubmit() }
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter also confirms an IME candidate; that keystroke is not a send.
    if (event.nativeEvent.isComposing) return
    if (event.key === 'Escape' && busy && onStop) { event.preventDefault(); onStop(); return }
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit() }
  }
  const stop = <button type="button" onClick={onStop} aria-label="Stop the reply" title="Stop (Esc)" className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-md border border-[var(--color-bad)] text-[var(--color-bad)] transition-colors hover:bg-[var(--color-bad-soft)]"><Square size={12} aria-hidden="true" /></button>
  return <form onSubmit={(event) => { event.preventDefault(); submit() }} className="shrink-0 space-y-2 border-t border-[var(--color-border)] p-3">
    {children}
    <div className={cn('flex items-end gap-2 rounded-lg border bg-[var(--color-bg)] py-1.5 pl-3 pr-1.5 transition-colors focus-within:border-[var(--color-accent)] focus-within:shadow-[0_0_0_1px_var(--color-accent)]',
      highlight ? 'border-[var(--color-accent)]' : 'border-[var(--color-border)]', disabled && 'opacity-60')}>
      <textarea ref={textareaRef} value={value} onChange={(event) => onChange(event.target.value)} onKeyDown={onKeyDown} placeholder={placeholder} aria-label={label}
        disabled={disabled} maxLength={maxLength} rows={rows}
        className="ai-composer-field min-w-0 flex-1 resize-none bg-transparent py-1 text-sm leading-relaxed placeholder:text-[var(--color-muted)] disabled:cursor-not-allowed" />
      {intent === 'chat' ? (busy && onStop ? stop
        : <button type="submit" disabled={busy || blocked || disabled} aria-label={sendLabel} title={sendLabel}
          className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-md bg-[var(--color-accent-soft)] text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent)] hover:text-[var(--color-on-solid)] disabled:cursor-not-allowed disabled:bg-transparent disabled:text-[var(--color-faint)]">
          <ArrowUp size={16} aria-hidden="true" />
        </button>) : null}
    </div>
    {intent === 'brief' ? <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      {busy && onStop
        ? <>{stop}<span role="status" className="text-xs text-[var(--color-muted)]">{hint}</span></>
        : <>
          <button type="submit" disabled={busy || blocked || disabled} className={aiBriefButton}><PenLine size={14} aria-hidden="true" />{sendLabel}</button>
          {hint ? <p className="min-w-0 flex-1 text-xs leading-relaxed text-[var(--color-muted)]">{hint}</p> : null}
        </>}
    </div> : null}
    {intent === 'chat' && hint ? <p className="text-xs leading-relaxed text-[var(--color-muted)]">{hint}</p> : null}
  </form>
}

/** A brief's send control: a secondary button in the action colour, never a solid primary. */
const aiBriefButton = 'inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-md border border-[color-mix(in_oklab,var(--color-accent)_45%,transparent)] px-3 text-xs font-semibold text-[var(--color-accent)] transition-colors hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-soft)] disabled:cursor-not-allowed disabled:border-[var(--color-border)] disabled:text-[var(--color-faint)] disabled:hover:bg-transparent'
