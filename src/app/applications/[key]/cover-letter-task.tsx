'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Check, ChevronDown, Eye, FileText, Pencil, Undo2 } from 'lucide-react'
import { AiBlocked, AiComposer, AiEmpty, AiNewChat, AiPanelHeader, AiReview, AiSettingsToggle, AiSheet, AiSheetTrigger, aiReply, aiUserBubble } from '@/components/AiPanel'
import { Menu, MenuItem } from '@/components/ui/Menu'
import type { Application } from '@/lib/applications'
import { CoverLetterConflict, LETTER_WORD_TARGET, coverLetterSchema, letterKey, letterMatchesFinalized, wordCount, type CoverLetter, type LetterTurn } from '@/lib/coverLetter'
import { createLetterSaveQueue, parseLetterChat, type LetterReview } from '@/lib/coverLetterEditor'
import type { Failure } from '@/lib/validate'
import { ChatMarkdown } from '@/components/ChatMarkdown'
import { ErrorNotice } from '@/components/ErrorNotice'
import type { FinalizedState } from '@/components/FinalizeStatus'
import { FeatureEnginePicker } from '@/components/FeatureEnginePicker'
import { LearnFromChat } from '@/components/LearnFromChat'
import { PdfPreview } from '@/components/PdfPreview'
import { Badge, Card, Spinner } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'
import { useFillHeight } from '@/components/useFillHeight'

type SaveState = 'saved' | 'saving' | 'error'
type View = 'preview' | 'edit'
type Preview = { token: string | null; pages: number | null; failures: Failure[]; source: string | null }

const STARTER = 'Draft my cover letter for this role.'
const EMPTY_PREVIEW: Preview = { token: null, pages: null, failures: [], source: null }
const focus = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]'
const field = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)] outline-none placeholder:text-[var(--color-muted)] focus:border-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-60'
const secondary = `inline-flex min-h-8 max-sm:min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2.5 text-xs font-medium transition-colors hover:bg-[var(--color-surface-2)] ${focus} disabled:cursor-not-allowed disabled:opacity-40`
const primary = `inline-flex min-h-9 max-sm:min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3.5 text-sm font-semibold text-[var(--color-on-solid)] shadow-[0_1px_2px_oklch(0_0_0/0.15)] transition-[filter] hover:brightness-110 ${focus} disabled:cursor-not-allowed disabled:bg-[var(--color-surface-2)] disabled:text-[var(--color-faint)] disabled:shadow-none`

function chatKey(key: string) {
  return `career-ops-cover-letter-chat:${key}`
}

/** The same document-and-companion workspace as Resume, with an explicit AI review before saving. */
export function CoverLetterTask({ app, active = true, asked, initialLetter, savedLetter, finalizedAtLoad, onLetterSaved, onLetterFinalized, resumeReady, onGoToResume }: {
  app: Application
  active?: boolean
  /** The posting asks for a cover letter; only then does a new chat open with a draft request waiting. */
  asked: boolean
  resumeReady: boolean
  onGoToResume: () => void
  onLetterFinalized?: (pdfName: string) => void
  initialLetter: CoverLetter
  savedLetter: CoverLetter | null
  finalizedAtLoad: FinalizedState['letter']
  onLetterSaved: (letter: CoverLetter) => void
}) {
  const base = `/api/applications/${encodeURIComponent(app.key)}/cover-letter`
  const [letter, setLetter] = useState(initialLetter)
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [saveAttempt, setSaveAttempt] = useState(0)
  const savedJson = useRef(letterKey(initialLetter))
  const latestLetter = useRef(letter)
  latestLetter.current = letter
  const onSaved = useRef(onLetterSaved)
  onSaved.current = onLetterSaved
  const saveQueue = useRef<ReturnType<typeof createLetterSaveQueue> | null>(null)
  if (!saveQueue.current) saveQueue.current = createLetterSaveQueue(savedLetter, async (snapshot, from) => {
    const response = await fetch(base, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ letter: snapshot, base: from }) })
    const data = await response.json()
    if (response.status === 409) throw new CoverLetterConflict()
    if (!response.ok) throw new Error(data.error ?? 'Could not save your letter')
  })
  const [conflict, setConflict] = useState(false)
  const [view, setView] = useState<View>('preview')
  const [preview, setPreview] = useState<Preview>(EMPTY_PREVIEW)
  const [rendering, setRendering] = useState(false)
  const [previewAttempt, setPreviewAttempt] = useState(0)
  const [turns, setTurns] = useState<LetterTurn[]>([])
  const [message, setMessage] = useState('')
  const latestMessage = useRef(message)
  latestMessage.current = message
  const [hydrated, setHydrated] = useState(false)
  const [thinking, setThinking] = useState(false)
  const [review, setReview] = useState<LetterReview | null>(null)
  const [finalizing, setFinalizing] = useState(false)
  const [letterFinalized, setLetterFinalized] = useState(finalizedAtLoad)
  const [finalizedPdf, setFinalizedPdf] = useState<string | null>(app.folder?.docs.find((doc) => doc.key === 'letterPdf' && doc.name.endsWith('.pdf'))?.name ?? null)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [sheet, setSheet] = useState(false)
  const settingsId = useId()
  const finalizeHintId = useId()
  const abortRef = useRef<AbortController | null>(null)
  const messageRef = useRef<HTMLTextAreaElement>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const followReply = useRef(true)
  const documentPanel = useRef<HTMLDivElement>(null)
  const aiPanel = useRef<HTMLDivElement>(null)
  useFillHeight(documentPanel, active, 80)
  useFillHeight(aiPanel, active, 80)
  const words = wordCount(letter.content)
  const empty = !letter.content.trim()
  const busy = thinking || finalizing
  const source = letterKey(letter)
  const dirty = source !== savedJson.current
  const currentPreview = preview.source === source
  const upToDate = letterMatchesFinalized(letter, letterFinalized?.letter ?? null)
  const starterReady = hydrated && resumeReady && empty && !review && message === STARTER

  useEffect(() => {
    let saved = null
    try { saved = parseLetterChat(window.localStorage.getItem(chatKey(app.key))) } catch { /* in-memory chat still works */ }
    setTurns(saved?.turns ?? [])
    // A request this panel once filled in itself is not kept when the posting does not ask for a letter.
    const savedMessage = !asked && saved?.message === STARTER ? '' : saved?.message
    setMessage(savedMessage || (asked && !initialLetter.content.trim() && !saved?.turns.length ? STARTER : ''))
    if (saved?.review) {
      const matches = savedLetter
        ? letterKey(saved.review.before) === letterKey(savedLetter)
        : !saved.review.before.content.trim()
      if (matches) { setReview(saved.review); setLetter(saved.review.after) }
    }
    setHydrated(true)
    // This component is keyed by application; its initial props are the hydration base.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.key])

  useEffect(() => {
    if (!hydrated) return
    try { window.localStorage.setItem(chatKey(app.key), JSON.stringify({ turns: turns.slice(-100), message, review })) } catch { /* keep the current session usable */ }
  }, [app.key, hydrated, turns, message, review])
  useEffect(() => () => abortRef.current?.abort(), [])
  useEffect(() => {
    const list = listRef.current
    if (active && list && followReply.current) list.scrollTo({ top: list.scrollHeight, behavior: 'auto' })
  }, [active, turns, thinking, review])

  async function saveSnapshot(snapshot: CoverLetter) {
    const json = letterKey(snapshot)
    try {
      await saveQueue.current!.save(snapshot)
      savedJson.current = json
      onSaved.current(snapshot)
      setSaveState(letterKey(latestLetter.current) === json ? 'saved' : 'saving')
    } catch (reason) {
      if (reason instanceof CoverLetterConflict) setConflict(true)
      setSaveState('error')
      throw reason
    }
  }

  // A response for an older buffer can advance the save base, but cannot mark newer typing as saved.
  useEffect(() => {
    if (!hydrated || conflict || review || finalizing) return
    if (source === savedJson.current) { setSaveState('saved'); return }
    setSaveState('saving')
    const timer = window.setTimeout(() => {
      void saveSnapshot(letter).catch((reason) => setError((reason as Error).message))
    }, 650)
    return () => window.clearTimeout(timer)
    // saveSnapshot reads the current queue and callbacks through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, letter, source, conflict, review, finalizing, saveAttempt])

  // Retain the last PDF while its replacement renders; never show an obsolete request's error.
  useEffect(() => {
    if (!resumeReady || empty) { setPreview(EMPTY_PREVIEW); setRendering(false); return }
    const controller = new AbortController()
    setRendering(true)
    setPreview((current) => ({ ...current, failures: [] }))
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`${base}/preview`, {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ letter }), signal: controller.signal,
        })
        const data = await response.json()
        if (controller.signal.aborted) return
        if (!response.ok) throw new Error(data.error ?? 'Could not preview your letter')
        setPreview({ token: data.token, pages: data.pages, failures: data.failures ?? [], source })
      } catch (reason) {
        if (!controller.signal.aborted) setPreview((current) => ({ ...current, source, failures: [{ kind: 'render', where: 'preview', why: (reason as Error).message }] }))
      } finally {
        if (!controller.signal.aborted) setRendering(false)
      }
    }, 500)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [base, letter, source, empty, resumeReady, previewAttempt])

  function edit(patch: Partial<CoverLetter>) {
    setLetter((current) => ({ ...current, ...patch }))
    setNotice('')
  }

  function writeMyself() {
    setView('edit')
    window.requestAnimationFrame(() => bodyRef.current?.focus({ preventScroll: true }))
  }

  async function send(text = message) {
    const request = text.trim()
    if (!request || !hydrated || busy || review || conflict || !resumeReady) return
    const history = [...turns, { role: 'user' as const, content: request }]
    followReply.current = true
    setTurns(history); setMessage(''); setThinking(true); setError(null); setRetry(null); setNotice('')
    const controller = new AbortController()
    abortRef.current = controller
    try {
      // A pending proposal's Before must survive reload even when the user sent
      // their request during the typing debounce.
      if (source !== savedJson.current) await saveSnapshot(letter)
      if (controller.signal.aborted) throw new DOMException('Stopped', 'AbortError')
      const response = await fetch(base, {
        method: 'POST', headers: { 'content-type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ letter, message: request, conversation: turns.slice(-40) }),
      })
      const data = await response.json()
      if (controller.signal.aborted) throw new DOMException('Stopped', 'AbortError')
      if (!response.ok) throw new Error(data.error ?? 'The AI could not update the letter')
      const nextLetter = coverLetterSchema.parse(data.letter)
      setTurns([...history, { role: 'assistant', content: data.reply || 'Your draft is ready to review.' }])
      if (letterKey(nextLetter) !== source) {
        setReview({ before: letter, after: nextLetter })
        setLetter(nextLetter)
        setView('preview')
      }
    } catch (reason) {
      if (controller.signal.aborted) setNotice('Stopped. Your letter is unchanged.')
      else { setError((reason as Error).message); setRetry(request) }
      setTurns(turns)
      if (!latestMessage.current.trim()) setMessage(request)
    } finally {
      setThinking(false)
      abortRef.current = null
    }
  }

  function resolveReview(keep: boolean) {
    if (!review) return
    if (!keep) setLetter(review.before)
    setReview(null)
    setNotice(keep ? 'AI draft kept.' : 'AI draft undone. Your previous letter is restored.')
    window.requestAnimationFrame(() => messageRef.current?.focus({ preventScroll: true }))
  }

  const finalizeBlocked = !resumeReady ? 'Finalize your resume first'
    : empty ? 'Write a first draft to enable finalizing'
    : conflict ? 'Reload to continue from the latest version'
    : review ? 'Keep or undo the AI draft first'
    : busy ? (thinking ? 'Wait for the AI to finish' : 'Finalizing your letter…')
    : saveState === 'error' ? 'Retry saving your letter first'
    : dirty || saveState === 'saving' ? 'Saving your latest edits…'
    : rendering || !currentPreview ? 'Checking the latest preview…'
    : preview.failures.length ? 'Fix the preview issues first'
    : preview.pages !== 1 ? 'The letter must fit on one page'
    : upToDate ? 'The saved PDF already matches this letter'
    : null

  async function finalize() {
    if (finalizeBlocked) return
    setFinalizing(true); setError(null); setNotice('')
    try {
      await saveQueue.current!.idle()
      const response = await fetch(`${base}/finalize`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ letter, base: saveQueue.current!.base() }),
      })
      const data = await response.json()
      if (response.status === 409) setConflict(true)
      if (!response.ok) throw new Error(data.error ?? 'Could not finalize your letter')
      savedJson.current = source
      saveQueue.current!.saved(letter)
      onSaved.current(letter)
      setSaveState('saved')
      setFinalizedPdf(data.finalized.pdfName)
      setLetterFinalized({ at: new Date().toISOString(), letter })
      setNotice('Cover letter finalized. Your PDF is ready.')
      onLetterFinalized?.(data.finalized.pdfName)
    } catch (reason) { setError((reason as Error).message) } finally { setFinalizing(false) }
  }

  async function locate(reveal: boolean) {
    setError(null)
    try {
      const response = await fetch(`/api/applications/${encodeURIComponent(app.key)}/reveal`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ doc: 'letterPdf', reveal }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'Could not locate your cover letter')
      if (!reveal && data.path) await navigator.clipboard.writeText(data.path)
      setNotice(reveal ? 'Opened the folder.' : 'Copied the path.')
    } catch (reason) { setError((reason as Error).message) }
  }

  function newChat() {
    if (busy || review) return
    setTurns([]); setMessage(asked && empty ? STARTER : ''); setError(null); setRetry(null)
    window.requestAnimationFrame(() => messageRef.current?.focus({ preventScroll: true }))
  }

  const status = review ? 'Review the AI draft'
    : saveState === 'error' ? 'Draft could not be saved'
    : dirty || saveState === 'saving' ? 'Saving your draft…'
    : empty ? 'Ready to draft'
    : upToDate ? 'Finalized · PDF matches your letter'
    : letterFinalized ? 'Draft saved · PDF needs updating'
    : 'Draft saved · not finalized yet'
  const statusTone = review ? 'text-[var(--color-warn)]' : saveState === 'error' ? 'text-[var(--color-bad)]' : upToDate ? 'text-[var(--color-ok)]' : 'text-[var(--color-muted)]'
  const inputBlocked = !hydrated || conflict || !resumeReady || finalizing
  const sendBlocked = inputBlocked || !!review || !message.trim()

  return <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
    <section aria-label="Cover letter document" className="min-w-0 lg:sticky lg:top-20">
      {/* The first folder tab opens onto this sheet, so its top-left corner is the tab's. */}
      <Card ref={documentPanel} className={cn('flex min-h-0 flex-col rounded-tl-none', empty && view === 'preview' ? 'min-h-80 lg:h-[max(420px,70dvh)]' : 'h-[max(420px,70dvh)]')}>
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--color-border)] px-5 py-3.5">
          <div className="min-w-0 flex-1">
            <h2 className="text-[17px]">Cover letter</h2>
            <p role="status" className={cn('mt-0.5 text-xs', statusTone)}>{status}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {finalizedPdf ? <>
              <a href={`/api/applications/${encodeURIComponent(app.key)}/file/${encodeURIComponent(finalizedPdf)}`} target="_blank" rel="noreferrer" className={secondary}><FileText size={13} aria-hidden="true" /> Open PDF</a>
              <Menu label="Cover letter file actions" width="w-48">
                {(close) => <>
                  <MenuItem label="Show file in Finder" onSelect={() => { close(); void locate(true) }} />
                  <MenuItem label="Copy file path" onSelect={() => { close(); void locate(false) }} />
                </>}
              </Menu>
            </> : null}
            {/* An empty letter's preview already offers "Write it myself"; the toggle appears once there is text to preview. */}
            {!empty || view === 'edit' ? <button type="button" aria-pressed={view === 'edit'} onClick={() => setView(view === 'edit' ? 'preview' : 'edit')} className={secondary}>
              {view === 'edit' ? <><Eye size={13} aria-hidden="true" /> Preview</> : <><Pencil size={13} aria-hidden="true" /> Edit text</>}
            </button> : null}
          </div>
        </div>
        {conflict ? <div role="alert" className="flex shrink-0 flex-wrap items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-bad-soft)] px-5 py-3 text-sm">
          <p className="min-w-0 flex-1">This letter changed in another tab. Copy any edits you want to keep, then reload the latest version.</p>
          <button type="button" onClick={() => window.location.reload()} className={secondary}>Reload latest</button>
        </div> : null}
        <div className="min-h-0 flex-1 overflow-hidden">
          <div className={cn('h-full', view !== 'preview' && 'hidden')}>
          {empty ? <div className="flex h-full min-h-56 flex-col items-center justify-center px-6 py-8 text-center">
            <h3 className="text-lg font-semibold">Your cover letter starts here</h3>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-[var(--color-muted)]">Ask the AI for a first draft from your finalized resume and this role, or write it yourself.</p>
            <button type="button" onClick={writeMyself} disabled={busy || !!review} className={cn(secondary, 'mt-5')}><Pencil size={14} aria-hidden="true" /> Write it myself</button>
          </div> : <PdfPreview token={preview.token} document="cover letter" engine="the preview" source="letter" />}
          </div>
            <div className={cn('flex h-full flex-col gap-4 overflow-y-auto p-4 sm:p-5', view !== 'edit' && 'hidden')}>
              <details className="shrink-0 border-b border-[var(--color-border)] pb-3">
                <summary className="flex min-h-8 cursor-pointer list-none items-center gap-2 text-sm font-medium [&::-webkit-details-marker]:hidden"><ChevronDown size={14} aria-hidden="true" /> Recipient & letter details <span className="ml-auto text-xs font-normal text-[var(--color-muted)]">{letter.paper === 'a4' ? 'A4' : 'US Letter'}</span></summary>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <LetterField label="Recipient name" value={letter.recipientName} disabled={busy || !!review} readOnly={conflict} placeholder="Optional" onChange={(recipientName) => edit({ recipientName })} />
                  <LetterField label="Recipient title" value={letter.recipientTitle} disabled={busy || !!review} readOnly={conflict} placeholder="Optional" onChange={(recipientTitle) => edit({ recipientTitle })} />
                  <LetterField label="Company" value={letter.companyName} disabled={busy || !!review} readOnly={conflict} onChange={(companyName) => edit({ companyName })} />
                  <LetterField label="Company address" value={letter.companyAddress} disabled={busy || !!review} readOnly={conflict} placeholder="Optional" onChange={(companyAddress) => edit({ companyAddress })} />
                  <LetterField label="Greeting" value={letter.salutation} disabled={busy || !!review} readOnly={conflict} placeholder="Dear Hiring Manager," onChange={(salutation) => edit({ salutation })} />
                  <LetterField label="Closing" value={letter.closing} disabled={busy || !!review} readOnly={conflict} onChange={(closing) => edit({ closing })} />
                  <LetterField label="Date" value={letter.date} disabled={busy || !!review} readOnly={conflict} onChange={(date) => edit({ date })} />
                  <label className="block space-y-1 text-xs text-[var(--color-muted)]"><span>Paper</span>
                    <select value={letter.paper} disabled={busy || !!review || conflict} onChange={(event) => edit({ paper: event.target.value as CoverLetter['paper'] })} className={field}>
                      <option value="a4">A4</option><option value="us-letter">US Letter</option>
                    </select>
                  </label>
                </div>
              </details>
              <label className="flex min-h-64 flex-1 flex-col gap-2 text-sm font-medium">
                <span>Letter body</span>
                <textarea ref={bodyRef} value={letter.content} disabled={busy || !!review} readOnly={conflict} onChange={(event) => edit({ content: event.target.value })} placeholder="Explain why this role interests you and what you can contribute…" className={cn(field, 'min-h-56 flex-1 resize-y leading-7')} />
                <span className="text-xs font-normal text-[var(--color-muted)]">Separate paragraphs with a blank line. Your edits save automatically.</span>
              </label>
            </div>
        </div>
        {preview.failures.length ? <div role="alert" className="shrink-0 space-y-2 border-t border-[var(--color-border)] bg-[var(--color-bad-soft)] px-4 py-3 text-xs text-[var(--color-bad)]">
          <ul className="list-disc space-y-1 pl-4">{preview.failures.map((failure, index) => <li key={index}>{failure.why}</li>)}</ul>
          <button type="button" onClick={() => setPreviewAttempt((attempt) => attempt + 1)} className={secondary}>Retry preview</button>
        </div> : null}
        <div className="shrink-0 space-y-2 rounded-b-xl border-t border-[var(--color-border)] px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-muted)]">
              <span className={cn('tabular-nums', words > LETTER_WORD_TARGET.max + 50 && 'text-[var(--color-warn)]')}>{words} words <span className="text-[var(--color-muted)]">· aim {LETTER_WORD_TARGET.min}–{LETTER_WORD_TARGET.max}</span></span>
              {rendering ? <span className="inline-flex items-center gap-1.5"><Spinner /> Updating preview…</span> : currentPreview && preview.pages ? <Badge tone={preview.pages === 1 ? 'ok' : 'warn'}>{preview.pages} page{preview.pages === 1 ? '' : 's'}</Badge> : null}
            </div>
            <button type="button" disabled={!!finalizeBlocked} title={finalizeBlocked ?? 'Save the PDF you send'} aria-describedby={finalizeHintId} onClick={() => void finalize()} className={primary}>
              {finalizing ? <Spinner /> : <Check size={14} aria-hidden="true" />}{finalizing ? 'Finalizing…' : upToDate ? 'Finalized' : finalizedPdf ? 'Finalize again' : 'Finalize letter'}
            </button>
          </div>
          <p id={finalizeHintId} className={cn('text-xs text-[var(--color-muted)]', (!finalizeBlocked || empty || upToDate) && 'sr-only')}>{finalizeBlocked ?? 'Save the PDF you send'}</p>
          {notice ? <p role="status" className="text-xs text-[var(--color-muted)]">{notice}</p> : null}
          {saveState === 'error' && !conflict ? <button type="button" onClick={() => { setError(null); setSaveAttempt((attempt) => attempt + 1) }} className={secondary}>Retry saving</button> : null}
        </div>
      </Card>
    </section>
    <AiSheet label="Cover letter AI" open={sheet} onOpenChange={setSheet} active={active}>
      <Card ref={aiPanel} className="flex h-[max(480px,70dvh)] min-h-0 flex-col overflow-hidden">
        <AiPanelHeader title="Cover letter AI" hint="Uses your finalized resume and the posting">
          <AiNewChat disabled={!hydrated || busy || !!review || !turns.length} onClear={newChat} />
          <AiSettingsToggle open={settingsOpen} controls={settingsId} onToggle={() => setSettingsOpen((open) => !open)} />
        </AiPanelHeader>
        <div id={settingsId} hidden={!settingsOpen} className="max-h-60 shrink-0 space-y-3 overflow-y-auto border-b border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3">
          {settingsOpen ? <FeatureEnginePicker feature="editor-chat" disabled={busy || !!review} compact /> : null}
          {turns.length >= 2 ? <LearnFromChat embedded skillId="write-cover-letter" turns={turns} disabled={busy || !!review} /> : null}
        </div>
        <div ref={listRef} onScroll={() => { const list = listRef.current; if (list) followReply.current = list.scrollHeight - list.scrollTop - list.clientHeight < 80 }} className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4">
          {turns.length ? turns.map((turn, index) => <div key={index} className="space-y-3">
            <div className={turn.role === 'user' ? aiUserBubble : aiReply}>
              {turn.role === 'assistant' ? <ChatMarkdown text={turn.content} /> : <p className="whitespace-pre-wrap break-words">{turn.content}</p>}
            </div>
            {review && index === turns.length - 1 && turn.role === 'assistant' ? <AiReview title="Review your letter" hint="The preview shows the AI draft. Keep it to save it, or undo to restore your previous letter.">
              <button type="button" onClick={() => resolveReview(true)} className={secondary}><Check size={14} aria-hidden="true" /> Keep draft</button>
              <button type="button" onClick={() => resolveReview(false)} className={secondary}><Undo2 size={14} aria-hidden="true" /> Undo</button>
            </AiReview> : null}
          </div>) : <AiEmpty
            title="What should this letter emphasize?"
            hint="Start with a draft for this role. You can then refine the tone, highlight a project, or make it more concise."
            prompts={!empty ? ['Make it shorter and more direct.', 'Focus on my most relevant project.'] : resumeReady ? [STARTER] : undefined}
            disabled={busy || !!review}
            onPick={(prompt) => { setMessage(prompt); messageRef.current?.focus({ preventScroll: true }) }}
          />}
          {thinking ? <div role="status" className="flex items-center gap-2 py-2 text-sm text-[var(--color-muted)]"><Spinner /> Writing your draft…</div> : null}
        </div>
        {error && !conflict ? <ErrorNotice error={error} className="shrink-0 border-t border-[var(--color-border)]" onRetry={retry && !busy ? () => void send(retry) : undefined} onDismiss={() => { setError(null); setRetry(null) }} /> : null}
        {!resumeReady ? <AiBlocked title="Finalize your resume to start" hint="The AI needs the version you’ll send with this letter." action={<button type="button" onClick={onGoToResume} className={secondary}>Go to Resume</button>} /> : <AiComposer
          value={message}
          onChange={setMessage}
          onSubmit={() => void send()}
          onStop={() => abortRef.current?.abort()}
          busy={thinking}
          blocked={sendBlocked}
          disabled={inputBlocked}
          highlight={starterReady}
          label="Message the Cover letter AI"
          placeholder={empty ? 'Draft a letter for this role, or tell the AI what to emphasize…' : 'Ask for an edit: tone, length, a project to highlight…'}
          hint={thinking ? 'Writing… Esc stops the reply' : review ? 'Keep or undo the AI draft to continue' : starterReady ? 'Press Enter to draft, or edit the request first' : 'Enter to send · Shift+Enter for a new line'}
          maxLength={8000}
          textareaRef={messageRef}
        />}
      </Card>
    </AiSheet>
    <AiSheetTrigger label="Cover letter AI" onOpen={() => setSheet(true)} />
  </div>
}

function LetterField({ label, value, disabled, readOnly, placeholder, onChange }: { label: string; value: string; disabled?: boolean; readOnly?: boolean; placeholder?: string; onChange: (value: string) => void }) {
  return <label className="block space-y-1 text-xs text-[var(--color-muted)]"><span>{label}</span><input value={value} disabled={disabled} readOnly={readOnly} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className={field} /></label>
}
