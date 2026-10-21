'use client'

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { ChevronRight, ClipboardCheck, Pencil, SlidersHorizontal, Square } from 'lucide-react'
import { Badge, Spinner } from './ui/primitives'
import { ResumeReview } from './ResumeReview'
import { ChatMarkdown } from './ChatMarkdown'
import type { EditorApi } from './EditorPane'
import { readNdjson } from '@/lib/ndjson'
import type { Mode } from '@/lib/validate'
import { cn } from '@/lib/utils'
import { PROFILE_UPDATE_REQUEST } from '@/lib/skills/learning'
import { ErrorNotice } from './ErrorNotice'
import { LearnFromChat } from './LearnFromChat'
import { FeatureEnginePicker } from './FeatureEnginePicker'
import { chatSkillForMessage } from '@/lib/chatSkills'
import { resumeFingerprint, resumeReviewParser, type ResumeReview as Review } from '@/lib/resumeReview'
import {
  editorChatStorageKey,
  parseEditorChatSnapshot,
  serializeEditorChatSnapshot,
  type EditorChatSnapshot,
  type ChatSkillEvent,
  type EditorChatTurn as DisplayTurn,
} from '@/lib/chatPersistence'

export function EditorChat({
  api,
  reviewOnly = false,
  onProfileUpdated,
  mode,
  applicationKey,
  chatScope,
  reviewSource,
  tailoring,
  tailoringSkill,
  seed,
  title,
  hint,
}: {
  /** Names the chat in its own top bar, beside New chat and the settings. */
  title?: string
  hint?: string
  onProfileUpdated?: () => Promise<void>
  reviewOnly?: boolean
  api: EditorApi
  mode: Mode
  applicationKey?: string
  chatScope: string
  reviewSource?: string
  tailoring?: ReactNode
  /** Text put in the message box from outside, such as a requirement to discuss; `at` makes a repeat count. */
  seed?: { text: string; at: number }
  /** Runs only when the user asks for tailoring; opening the chat never starts it. */
  tailoringSkill?: {
    run: (handlers: {
      conversation?: { role: 'user' | 'assistant'; content: string }[]
      onEvent: (event: ChatSkillEvent) => void
      signal?: AbortSignal
    }) => Promise<{ answer: string; engine?: string; skillId: string; runId?: string }>
    review?: ReactNode
    /** How the latest proposal was settled; written onto the tailoring turn that made it. */
    outcome?: { text: string; at: number }
  }
}) {
  const storageKey = editorChatStorageKey(chatScope)
  const [turns, setTurns] = useState<DisplayTurn[]>([])
  const [message, setMessage] = useState('')
  const [hydrated, setHydrated] = useState(false)
  const [busy, setBusy] = useState(false)
  const [activity, setActivity] = useState<string | null>(null)
  const [liveReasoning, setLiveReasoning] = useState('')
  const [liveSkillEvents, setLiveSkillEvents] = useState<ChatSkillEvent[]>([])
  const [streamResponses, setStreamResponses] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [resolving, setResolving] = useState<number | null>(null)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editingText, setEditingText] = useState('')
  const [resumeReviewMode, setResumeReviewMode] = useState(false)
  const [confirmingNewChat, setConfirmingNewChat] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const settingsId = useId()
  const [unseenReply, setUnseenReply] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const reviewStartRef = useRef<HTMLDivElement>(null)
  const messageRef = useRef<HTMLTextAreaElement>(null)
  const sessionRef = useRef('')
  const abortRef = useRef<AbortController | null>(null)
  /** Follow new output only while the reader is already at the bottom of the conversation. */
  const stickToBottomRef = useRef(true)
  const scrolledReviewRef = useRef(-1)
  const seenTurnsRef = useRef(0)
  const wasBusyRef = useRef(false)
  /** A draft write waiting out the typing debounce. */
  const pendingDraftRef = useRef<{ key: string; snapshot: EditorChatSnapshot; timer: number } | null>(null)
  /** Values async handlers read after an await, when their render's closure is stale. */
  const latestRef = useRef({ text: api.text, message, resumeReviewMode })
  latestRef.current = { text: api.text, message, resumeReviewMode }
  /** Re-sends the request that just failed, from the conversation as it was before it. */
  const retryRef = useRef<(() => void) | null>(null)
  const pendingProposal = turns.some((turn) => turn.proposal?.status === 'pending')
  const latestResumeReviewIndex = turns.reduce((found, turn, index) => turn.review ? index : found, -1)
  const latestResumeReview = latestResumeReviewIndex >= 0 ? turns[latestResumeReviewIndex].review : undefined
  const staleResumeReview = Boolean(latestResumeReview && latestResumeReview.fingerprint !== resumeFingerprint(api.text))
  const reviewLocked = resumeReviewMode && (staleResumeReview || !latestResumeReview)
  /** Typing stays possible while these hold; only sending waits. */
  const sendBlocked = !hydrated || busy || api.reviewPending || editingIndex !== null || reviewLocked

  useEffect(() => () => {
    abortRef.current?.abort()
    flushDraft()
  }, [])

  useEffect(() => {
    flushDraft()
    setHydrated(false)
    const saved = parseEditorChatSnapshot(readEditorChat(storageKey))
    const nextTurns = saved?.turns ?? []
    const nextMessage = saved?.draft ?? ''
    sessionRef.current = saved?.sessionId ?? crypto.randomUUID()
    setTurns(nextTurns)
    setMessage(nextMessage)
    setError(null)
    setActivity(null)
    setLiveReasoning('')
    setLiveSkillEvents([])
    setEditingIndex(null)
    setEditingText('')
    setResumeReviewMode(saved?.reviewMode === true)
    setConfirmingNewChat(false)
    setUnseenReply(false)
    stickToBottomRef.current = true
    scrolledReviewRef.current = -1
    seenTurnsRef.current = nextTurns.length
    setHydrated(true)

    const pending = [...nextTurns].reverse().find((turn) => turn.proposal?.status === 'pending')?.proposal
    if (pending) {
      api.setText(pending.after)
      api.setReviewPending(true)
    }
  }, [storageKey])

  useEffect(() => {
    const saved = readEditorChat('career-ops-editor-stream')
    if (saved !== null) setStreamResponses(saved === 'true')
  }, [])
  // Scroll the conversation itself, never the page: scrollIntoView also moved the window and left the reply out of view.
  useEffect(() => {
    const list = listRef.current
    if (!list || !hydrated) return
    const review = reviewStartRef.current
    if (turns.at(-1)?.review && !busy && review && scrolledReviewRef.current !== latestResumeReviewIndex) {
      scrolledReviewRef.current = latestResumeReviewIndex
      list.scrollTop += review.getBoundingClientRect().top - list.getBoundingClientRect().top - 12
      stickToBottomRef.current = false
      return
    }
    const grew = turns.length > seenTurnsRef.current
    seenTurnsRef.current = turns.length
    if (stickToBottomRef.current) list.scrollTop = list.scrollHeight
    else if (busy || grew) setUnseenReply(true)
  }, [hydrated, turns, busy, activity, liveReasoning, liveSkillEvents, latestResumeReviewIndex])

  // A hidden tab has no height; pin to the bottom again once it is shown or resized.
  useEffect(() => {
    const list = listRef.current
    if (!list || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      if (stickToBottomRef.current) list.scrollTop = list.scrollHeight
    })
    observer.observe(list)
    return () => observer.disconnect()
  }, [])

  // Disabled controls drop focus to the page when a reply ends; give it back to the composer.
  useEffect(() => {
    if (wasBusyRef.current && !busy) {
      const active = document.activeElement
      if (!active || active === document.body || rootRef.current?.contains(active)) messageRef.current?.focus({ preventScroll: true })
    }
    wasBusyRef.current = busy
  }, [busy])

  function onListScroll() {
    const list = listRef.current
    if (!list) return
    const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 48
    stickToBottomRef.current = atBottom
    if (atBottom) setUnseenReply(false)
  }

  function scrollToLatest() {
    const list = listRef.current
    if (!list) return
    list.scrollTop = list.scrollHeight
    stickToBottomRef.current = true
    setUnseenReply(false)
  }

  /** Writes the snapshot now, dropping any debounced draft write that would overwrite it. */
  function persist(key: string, snapshot: EditorChatSnapshot) {
    if (pendingDraftRef.current) window.clearTimeout(pendingDraftRef.current.timer)
    pendingDraftRef.current = null
    storeEditorChat(key, snapshot)
  }

  function persistDraftSoon(snapshot: EditorChatSnapshot) {
    if (pendingDraftRef.current) window.clearTimeout(pendingDraftRef.current.timer)
    const key = storageKey
    const timer = window.setTimeout(() => persist(key, snapshot), 400)
    pendingDraftRef.current = { key, snapshot, timer }
  }

  function flushDraft() {
    const pending = pendingDraftRef.current
    if (pending) persist(pending.key, pending.snapshot)
  }

  function setStreaming(value: boolean) {
    setStreamResponses(value)
    try { window.localStorage.setItem('career-ops-editor-stream', String(value)) } catch { /* keep the in-memory choice */ }
  }

  function newChat() {
    if (pendingProposal || busy) return
    sessionRef.current = crypto.randomUUID()
    setTurns([])
    setMessage('')
    setError(null)
    setActivity(null)
    setLiveReasoning('')
    setLiveSkillEvents([])
    setEditingIndex(null)
    setEditingText('')
    setResumeReviewMode(false)
    setConfirmingNewChat(false)
    retryRef.current = null
    persist(storageKey, { sessionId: sessionRef.current, turns: [], draft: '', reviewMode: false })
    messageRef.current?.focus()
  }

  function exitResumeReview() {
    setResumeReviewMode(false)
    persist(storageKey, { sessionId: sessionRef.current, turns, draft: message, reviewMode: false })
    messageRef.current?.focus()
  }

  useEffect(() => {
    if (!seed || !hydrated) return
    setMessage(seed.text)
    persist(storageKey, { sessionId: sessionRef.current, turns, draft: seed.text, reviewMode: resumeReviewMode })
    const box = messageRef.current
    if (box) { box.focus(); box.setSelectionRange(seed.text.length, seed.text.length) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed?.at, hydrated])

  function discussFinding(value: string) {
    if (busy || staleResumeReview) return
    setResumeReviewMode(true)
    setMessage(value)
    persist(storageKey, { sessionId: sessionRef.current, turns, draft: value, reviewMode: true })
    messageRef.current?.focus()
  }

  function stop() {
    abortRef.current?.abort()
  }

  function startEdit(index: number) {
    if (busy || resumeReviewMode || api.reviewPending || turns[index]?.role !== 'user' || turns[index + 1]?.review) return
    setEditingIndex(index)
    setEditingText(turns[index].content)
  }

  function cancelEdit() {
    setEditingIndex(null)
    setEditingText('')
  }

  /** Rewrite a past prompt: drop it and everything after, then resend from there. */
  async function submitEdit() {
    if (editingIndex === null || busy) return
    const index = editingIndex
    const text = editingText.trim()
    if (!text) return
    let restored = api.text
    for (const turn of turns.slice(index)) {
      if (turn.proposal?.status === 'pending') {
        restored = turn.proposal.before
        api.setText(restored)
        api.setReviewPending(false)
      }
    }
    const truncated = turns.slice(0, index)
    setTurns(truncated)
    persist(storageKey, { sessionId: sessionRef.current, turns: truncated, draft: message, reviewMode: resumeReviewMode })
    setEditingIndex(null)
    setEditingText('')
    await send(text, truncated, false, restored)
  }

  async function send(request?: string, baseHistory?: DisplayTurn[], startResumeReview = false, yamlOverride?: string) {
    const userMessage = (request ?? message).trim()
    if (!userMessage || busy) return
    if (resumeReviewMode && staleResumeReview && !startResumeReview) return
    const activeReviewMode = Boolean(reviewSource && (startResumeReview || resumeReviewMode))
    const userTurn: DisplayTurn = { role: 'user', content: userMessage }
    const earlierTurns = baseHistory ?? turns
    const history = [...earlierTurns, userTurn]
    const activeStorageKey = storageKey
    const activeSessionId = sessionRef.current
    // A typed message leaves the composer; a button-started request (review, rerun) leaves the draft alone.
    const activeDraft = request === undefined ? '' : latestRef.current.message
    /** The buffer the AI works from. If it changes before the reply lands, the reply must not overwrite it. */
    const sentYaml = yamlOverride ?? latestRef.current.text
    stickToBottomRef.current = true
    setUnseenReply(false)
    setTurns(history)
    setMessage(activeDraft)
    persist(activeStorageKey, { sessionId: activeSessionId, turns: history, draft: activeDraft, reviewMode: activeReviewMode })
    setBusy(true)
    setAnnouncement('Working on your request.')
    setActivity(activeReviewMode ? 'Starting resume review…' : 'Starting the editor agent…')
    setLiveReasoning('')
    setLiveSkillEvents([])
    setError(null)
    setConfirmingNewChat(false)
    retryRef.current = null
    // Retry works from the draft as it is then, and takes the request back out of the composer.
    const retry = () => {
      setError(null)
      if (latestRef.current.message.trim() === userMessage) {
        latestRef.current.message = ''
        setMessage('')
      }
      void send(userMessage, earlierTurns, startResumeReview)
    }
    const controller = new AbortController()
    abortRef.current = controller
    let streamed = ''
    let reasoning = ''
    let skillEvents: ChatSkillEvent[] = []
    let doneEvent: Record<string, unknown> | null = null

    try {
      if (activeReviewMode && reviewSource) {
        setActivity(startResumeReview ? 'Reviewing the current draft…' : 'Reconsidering the review…')
        const previous = startResumeReview ? undefined : latestResumeReview?.report
        const response = await fetch('/api/profile/review', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            yaml: sentYaml,
            source: reviewSource,
            ...(previous ? {
              message: userMessage,
              previousReview: previous,
              conversation: earlierTurns.slice(-20).map(({ role, content }) => ({ role, content: content.slice(0, 16000) })),
            } : {}),
          }),
        })
        if (!response.ok) throw new Error(await responseError(response, 'Could not review this resume'))
        const result = await readJson(response)
        const report = resumeReviewParser.parse(result.review) as Review
        const reply = typeof result.reply === 'string' && result.reply.trim()
          ? result.reply.trim()
          : 'I reviewed the current draft. You can question any finding below.'
        const nextTurns: DisplayTurn[] = [...history, {
          role: 'assistant',
          content: formatResumeReviewForConversation(reply, report),
          review: {
            report, reply, fingerprint: resumeFingerprint(sentYaml),
            runId: String(result.runId ?? ''), skillVersion: Number(result.skillVersion ?? 0), engine: String(result.engine ?? ''),
          },
        }]
        setTurns(nextTurns)
        setResumeReviewMode(true)
        persist(activeStorageKey, { sessionId: activeSessionId, turns: nextTurns, draft: latestRef.current.message, reviewMode: true })
        setAnnouncement('Review ready.')
        return
      }
      if (tailoringSkill && chatSkillForMessage(userMessage) === 'tailor-cv') {
        setActivity(null)
        const result = await tailoringSkill.run({
          conversation: history.slice(-100).map(({ role, content }) => ({ role, content })),
          signal: controller.signal,
          onEvent: (event) => {
            skillEvents = appendSkillEvent(skillEvents, event)
            setLiveSkillEvents(skillEvents)
          },
        })
        const nextTurns: DisplayTurn[] = [...history, {
          role: 'assistant',
          content: result.answer,
          engine: result.engine,
          skillRun: { skillId: result.skillId, runId: result.runId, events: skillEvents },
        }]
        setTurns(nextTurns)
        persist(activeStorageKey, { sessionId: activeSessionId, turns: nextTurns, draft: latestRef.current.message, reviewMode: activeReviewMode })
        setAnnouncement('Tailoring finished. Review the proposed changes.')
        return
      }

      const response = await fetch('/api/editor/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          reviewOnly,
          yaml: sentYaml,
          mode,
          message: userMessage,
          applicationKey,
          sessionId: sessionRef.current,
          stream: streamResponses,
          conversation: earlierTurns.slice(-100).map(({ role, content }) => ({ role, content })),
        }),
      })
      if (!response.ok) throw new Error(await responseError(response, 'The editor agent failed'))

      await readNdjson(response, (event) => {
        if (event.type === 'activity' && typeof event.text === 'string') {
          setActivity(event.text)
          return
        }
        if (event.type === 'delta' && typeof event.text === 'string') {
          // Kept in memory only: the finished turn is stored once, not rewritten on every chunk.
          streamed += event.text
          setActivity(null)
          setTurns([...history, { role: 'assistant', content: streamed }])
          return
        }
        if (event.type === 'reasoning' && typeof event.text === 'string') {
          reasoning += event.text
          setLiveReasoning(reasoning)
          return
        }
        if (event.type === 'error') throw new Error(String(event.message ?? 'editor agent failed'))
        if (event.type === 'done') doneEvent = event
      })

      if (!doneEvent) throw new Error('editor agent ended without a result')
      const result = doneEvent as Record<string, unknown>
      const answer = typeof result.answer === 'string' ? result.answer : streamed || 'Done.'
      const engine = typeof result.engine === 'string' ? result.engine : undefined
      const proposedYaml = result.changed === true && typeof result.yaml === 'string' ? result.yaml : null
      const editedMeanwhile = proposedYaml !== null && latestRef.current.text !== sentYaml
      const changedYaml = editedMeanwhile ? null : proposedYaml
      if (changedYaml) {
        api.setText(changedYaml)
        api.setReviewPending(true)
      }

      const nextTurns: DisplayTurn[] = [...history, {
        role: 'assistant',
        content: answer,
        changed: Boolean(changedYaml),
        engine,
        reasoning: reasoning || undefined,
        proposal: changedYaml ? { before: sentYaml, after: changedYaml, status: 'pending' } : undefined,
      }]
      setTurns(nextTurns)
      persist(activeStorageKey, { sessionId: activeSessionId, turns: nextTurns, draft: latestRef.current.message, reviewMode: activeReviewMode })
      setActivity(null)
      setLiveReasoning('')
      if (editedMeanwhile) {
        retryRef.current = retry
        setError('The draft changed while the AI was working, so its edit was not applied and your changes were kept. Retry to apply the request to the current draft.')
        setAnnouncement('Reply ready. Its edit was not applied because the draft changed.')
      } else {
        setAnnouncement(changedYaml ? 'Reply ready with a proposed change to review.' : 'Reply ready.')
      }
      if (userMessage === PROFILE_UPDATE_REQUEST || result.analysisUpdated === true) {
        try { await onProfileUpdated?.() } catch { setError('Changes were saved, but the overview could not refresh. Reload to see the updated analysis.') }
      }
    } catch (reason) {
      const aborted = (reason as Error).name === 'AbortError'
      if (startResumeReview && !latestResumeReview) setResumeReviewMode(false)
      // Keep whatever arrived. With nothing to show, the request goes back to the composer instead of
      // staying in history, so a corrected resend doesn't leave two user turns in a row.
      const partial: DisplayTurn | null = !activeReviewMode && (streamed || skillEvents.length)
        ? {
            role: 'assistant',
            content: streamed || 'Stopped before finishing.',
            reasoning: reasoning || undefined,
            stopped: true,
            skillRun: skillEvents.length ? { skillId: 'tailor-cv', events: skillEvents } : undefined,
          }
        : null
      const nextTurns = partial ? [...history, partial] : earlierTurns
      const currentDraft = latestRef.current.message
      const nextDraft = partial || request !== undefined ? currentDraft : currentDraft.trim() ? currentDraft : userMessage
      setTurns(nextTurns)
      setMessage(nextDraft)
      persist(activeStorageKey, { sessionId: activeSessionId, turns: nextTurns, draft: nextDraft, reviewMode: latestRef.current.resumeReviewMode })
      if (aborted) setAnnouncement('Stopped.')
      else {
        retryRef.current = retry
        setError((reason as Error).message)
        setAnnouncement('')
      }
    } finally {
      abortRef.current = null
      setBusy(false)
      setActivity(null)
      setLiveReasoning('')
      setLiveSkillEvents([])
    }
  }

  async function acceptProposal(index: number) {
    const proposal = turns[index]?.proposal
    if (!proposal || proposal.status !== 'pending') return
    setResolving(index)
    setError(null)
    try {
      await api.save(latestRef.current.text)
      updateProposalStatus(index, 'accepted')
      api.setReviewPending(false)
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setResolving(null)
    }
  }

  function rejectProposal(index: number) {
    const proposal = turns[index]?.proposal
    if (!proposal || proposal.status !== 'pending') return
    api.setText(proposal.before)
    updateProposalStatus(index, 'rejected')
    api.setReviewPending(false)
  }

  // Record how the last tailoring proposal was settled on the turn that made it, so the
  // reply's "accept or reject" never points at a review that is gone without saying how it went.
  const settled = tailoringSkill?.outcome
  useEffect(() => {
    if (!settled || !hydrated) return
    const key = storageKey
    const sessionId = sessionRef.current
    setTurns((current) => {
      const index = current.reduce((found, turn, turnIndex) => turn.skillRun?.skillId === 'tailor-cv' ? turnIndex : found, -1)
      if (index === -1 || current[index].skillRun?.outcome) return current
      const next = current.map((turn, turnIndex) => turnIndex === index && turn.skillRun ? { ...turn, skillRun: { ...turn.skillRun, outcome: settled.text } } : turn)
      persist(key, { sessionId, turns: next, draft: latestRef.current.message, reviewMode: latestRef.current.resumeReviewMode })
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settled?.at, hydrated])

  function updateProposalStatus(index: number, status: 'accepted' | 'rejected') {
    const key = storageKey
    const sessionId = sessionRef.current
    setTurns((current) => {
      const next = current.map((turn, turnIndex) => turnIndex === index && turn.proposal
        ? { ...turn, proposal: { ...turn.proposal, status } }
        : turn)
      persist(key, { sessionId, turns: next, draft: latestRef.current.message, reviewMode: latestRef.current.resumeReviewMode })
      return next
    })
  }

  const reviewTurn = tailoringSkill?.review
    ? turns.reduce((found, turn, index) => turn.skillRun?.skillId === 'tailor-cv' ? index : found, -1)
    : -1

  return (
    <div ref={rootRef} className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--color-border)] px-3 py-2 text-xs">
        {title ? <div className="flex min-w-0 flex-1 items-baseline gap-2 pl-1">
          <h2 className="shrink-0 text-[15px] font-semibold">{title}</h2>
          {hint ? <p title={hint} className="min-w-0 truncate text-[13px] text-[var(--color-muted)]">{hint}</p> : null}
        </div> : null}
        {reviewSource ? (
          <>
            <button
              type="button"
              onClick={() => void send('Review this resume.', undefined, true)}
              disabled={!hydrated || busy || api.reviewPending || pendingProposal || !api.text.trim()}
              title="Reviews the draft as it is now, unsaved edits included. The resume is not changed."
              className="inline-flex min-h-8 items-center gap-1.5 rounded-md bg-[var(--color-accent-soft)] px-2.5 font-medium text-[var(--color-accent)] hover:opacity-80 disabled:opacity-40"
            >
              <ClipboardCheck size={14} aria-hidden="true" />
              {latestResumeReview ? 'Review current draft' : 'Review resume'}
            </button>
            {resumeReviewMode && latestResumeReview ? (
              <button type="button" onClick={exitResumeReview} disabled={busy} className="min-h-8 rounded-md border border-[var(--color-border)] px-2.5 font-medium hover:bg-[var(--color-surface-2)] disabled:opacity-40">Back to editing</button>
            ) : null}
            {resumeReviewMode && staleResumeReview ? <span className="text-[var(--color-muted)]">Draft changed · review again to continue</span> : null}
          </>
        ) : null}
        <div className="ml-auto flex items-center gap-1">
          {confirmingNewChat ? (
            <span className="flex items-center gap-1" role="group" aria-label="Clear this conversation">
              <span className="px-1 text-[var(--color-muted)]">Clear this conversation?</span>
              <button type="button" onClick={newChat} disabled={busy || pendingProposal} className="min-h-8 rounded-md px-2 font-medium text-[var(--color-bad)] hover:bg-[var(--color-bad-soft)] disabled:opacity-40">Clear</button>
              <button type="button" onClick={() => setConfirmingNewChat(false)} autoFocus className="min-h-8 rounded-md px-2 hover:bg-[var(--color-surface-2)]">Keep</button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirmingNewChat(true)} disabled={!hydrated || busy || api.reviewPending || pendingProposal || !turns.length} className="min-h-8 rounded-md px-2 text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)] disabled:opacity-40">
              New chat
            </button>
          )}
          <button
            type="button"
            onClick={() => setSettingsOpen((open) => !open)}
            aria-expanded={settingsOpen}
            aria-controls={settingsId}
            className={cn(
              'inline-flex min-h-8 items-center gap-1.5 rounded-md px-2 hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]',
              settingsOpen ? 'bg-[var(--color-surface-2)] text-[var(--color-text)]' : 'text-[var(--color-muted)]',
            )}
          >
            <SlidersHorizontal size={14} aria-hidden="true" />
            Chat settings
          </button>
        </div>
      </div>

      {/* Stays mounted while closed, so a skill update being drafted is not lost. */}
      <div id={settingsId} hidden={!settingsOpen} className="shrink-0 space-y-3 border-b border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-3 text-xs">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <FeatureEnginePicker feature="editor-chat" disabled={!hydrated || busy || pendingProposal} compact />
          <label className="flex cursor-pointer items-center gap-1.5 text-[var(--color-muted)]">
            <input
              type="checkbox"
              checked={streamResponses}
              onChange={(event) => setStreaming(event.target.checked)}
              disabled={!hydrated || busy}
              className="accent-[var(--color-accent)]"
            />
            Show replies as they are written
          </label>
        </div>
        {applicationKey ? <LearnFromChat embedded key={storageKey + sessionRef.current} skillId={reviewOnly ? 'analyze-job' : 'tailor-cv'} onUpdateProfile={() => void send(PROFILE_UPDATE_REQUEST)} turns={turns} disabled={!hydrated || busy || pendingProposal || api.reviewPending} /> : null}
        {reviewSource ? <Link href="/skills/review-resume" className="inline-block text-[var(--color-muted)] underline underline-offset-4 hover:text-[var(--color-text)]">Edit review skill</Link> : null}
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={listRef} onScroll={onListScroll} aria-label="Conversation" aria-busy={busy} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {!hydrated ? (
          <div className="flex h-48 items-center justify-center"><Spinner /></div>
        ) : turns.length ? turns.map((turn, index) => (
          editingIndex === index ? (
            <div key={index} className="ml-auto max-w-[88%] rounded-xl rounded-br-sm border border-[var(--color-accent)] bg-[var(--color-bg)] px-3 py-2">
              <textarea
                value={editingText}
                onChange={(event) => setEditingText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing) return
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    void submitEdit()
                  }
                  if (event.key === 'Escape') cancelEdit()
                }}
                autoFocus
                rows={3}
                maxLength={8000}
                aria-label="Edit message"
                className="w-full resize-none bg-transparent text-sm leading-relaxed outline-none"
              />
              <div className="mt-1.5 flex justify-end gap-2">
                <button onClick={cancelEdit} className="rounded-md border border-[var(--color-border-strong)] px-2.5 py-1.5 text-xs hover:bg-[var(--color-surface-2)]">
                  Cancel
                </button>
                <button
                  onClick={() => void submitEdit()}
                  disabled={busy || !editingText.trim()}
                  className="rounded-md bg-[var(--color-accent)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-bg)] disabled:opacity-40"
                >
                  Save &amp; rerun
                </button>
              </div>
            </div>
          ) : turn.role === 'user' ? (
          // The edit action sits beside the bubble, so a hidden control never leaves a gap inside it.
          <div key={index} className="group flex items-end justify-end gap-2">
            {!busy && !resumeReviewMode && !api.reviewPending && !turns[index + 1]?.review ? (
              <button
                type="button"
                onClick={() => startEdit(index)}
                className="mb-1 flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs text-[var(--color-muted)] opacity-0 transition-opacity hover:text-[var(--color-accent)] focus:opacity-100 group-hover:opacity-100"
              >
                <Pencil size={12} aria-hidden="true" /> Edit &amp; rerun
              </button>
            ) : null}
            <div className="max-w-[88%] rounded-xl rounded-br-sm bg-[var(--color-accent-soft)] px-3 py-2 text-sm leading-relaxed">
              <p className="whitespace-pre-wrap break-words">{turn.content}</p>
            </div>
          </div>
          ) : (
          <div
            key={index}
            ref={turn.review && index === latestResumeReviewIndex ? reviewStartRef : undefined}
            className="max-w-[94%] rounded-xl rounded-bl-sm border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2.5 text-sm leading-relaxed"
          >
            <ChatMarkdown text={turn.review ? turn.review.reply : turn.content} />
            {turn.role === 'assistant' && turn.review ? (
              <ResumeReview review={turn.review} current={index === latestResumeReviewIndex} stale={staleResumeReview} onDiscuss={discussFinding} />
            ) : null}
            {turn.role === 'assistant' && turn.skillRun ? <SkillRunTranscript run={turn.skillRun} /> : null}
            {turn.role === 'assistant' && turn.reasoning ? <ReasoningSummary text={turn.reasoning} /> : null}
            {turn.role === 'assistant' && turn.proposal ? (
              <EditProposal
                proposal={turn.proposal}
                currentYaml={api.text}
                saving={resolving === index}
                onAccept={() => void acceptProposal(index)}
                onReject={() => rejectProposal(index)}
                onEdit={api.showEditor}
              />
            ) : null}
            {turn.role === 'assistant' && index === reviewTurn ? tailoringSkill?.review : null}
            {/* The reply asked for a review below it; once that proposal is settled, say so instead of pointing at nothing. */}
            {turn.role === 'assistant' && turn.skillRun?.skillId === 'tailor-cv' && index !== reviewTurn ? <p className="mt-2 text-xs font-medium text-[var(--color-muted)]">{turn.skillRun.outcome ?? 'Settled before outcomes were recorded.'}</p> : null}
            {turn.role === 'assistant' && turn.stopped ? (
              <div className="mt-2"><Badge tone="warn">stopped before finishing</Badge></div>
            ) : null}
          </div>
          )
        )) : !tailoring ? (
          <ChatEmpty
            suggestions={busy || !hydrated ? [] : reviewOnly ? ['Is this role a good fit for me?', 'Which gap matters most here?'] : tailoringSkill ? ['Tailor my resume for this role', 'Which must-haves does the draft still miss?', 'Make it fit on one page'] : []}
            onPick={(text) => { setMessage(text); rootRef.current?.querySelector('textarea')?.focus() }}
            title={reviewOnly ? 'Let’s check whether this role works for you' : reviewSource ? 'Review or edit this resume' : tailoringSkill ? 'What should we do with this resume?' : 'Edit with a CLI agent'}
            hint={reviewOnly ? 'Ask about work authorization, discuss a gap, or correct the analysis. No resume tailoring starts until you request it.' : tailoringSkill
              ? 'Discuss the tailored draft, ask for changes, or compare it with anything in your repository. I can consult your masters, earlier applications, and notes.'
              : reviewSource ? 'Run a structured review, then challenge findings or answer its questions here. Switch back to editing whenever you want to change the draft.'
                : 'This is a persistent Claude/Codex session with file tools and buffer history. Ask it to edit, explain, compare, restore, or undo.'}
          />
        ) : null}
        {busy && liveReasoning ? (
          <div className="max-w-[94%] rounded-xl rounded-bl-sm border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2.5">
            <p className="text-xs font-medium text-[var(--color-muted)]">Reasoning summary · live</p>
            <ChatMarkdown text={liveReasoning} className="mt-1 text-xs leading-relaxed text-[var(--color-muted)]" />
          </div>
        ) : null}
        {busy && liveSkillEvents.length ? (
          <div className="max-w-[94%] rounded-xl rounded-bl-sm border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2.5 text-sm leading-relaxed">
            <p>Tailoring your resume…</p>
            <SkillRunTranscript run={{ skillId: 'tailor-cv', events: liveSkillEvents }} live />
          </div>
        ) : null}
        {busy && activity ? <div className="flex items-center gap-2 text-xs text-[var(--color-muted)]"><Spinner /> {activity}</div> : null}
        {tailoring}
        {tailoringSkill?.review && reviewTurn === -1 ? (
          <div className="max-w-[94%] rounded-xl rounded-bl-sm border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2.5 text-sm leading-relaxed">
            <p>I restored the tailoring proposal for review.</p>
            {tailoringSkill.review}
          </div>
        ) : null}
      </div>
      {unseenReply ? (
        <button
          type="button"
          onClick={scrollToLatest}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-1 text-xs font-medium shadow-[0_2px_8px_rgb(0_0_0/0.12)] hover:bg-[var(--color-surface-2)]"
        >
          {busy ? 'Reply in progress · jump to latest' : 'New reply · jump to latest'}
        </button>
      ) : null}
      </div>
      <p className="sr-only" role="status" aria-live="polite">{announcement}</p>

      {error ? <ErrorNotice error={error} className="border-t border-[var(--color-bad-soft)]" onRetry={retryRef.current && !busy ? retryRef.current : undefined} onDismiss={() => { setError(null); retryRef.current = null }} /> : null}

      <div className="shrink-0 border-t border-[var(--color-border)] p-3">
        <textarea
          ref={messageRef}
          value={message}
          onChange={(event) => {
            const draft = event.target.value
            setMessage(draft)
            persistDraftSoon({ sessionId: sessionRef.current, turns, draft, reviewMode: resumeReviewMode })
          }}
          onKeyDown={(event) => {
            // Enter also confirms an IME candidate; that keystroke is not a send.
            if (event.nativeEvent.isComposing) return
            if (event.key === 'Escape' && busy) {
              event.preventDefault()
              stop()
              return
            }
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              if (!sendBlocked) void send()
            }
          }}
          placeholder={resumeReviewMode ? 'Question a finding or add context…' : reviewOnly ? 'What should we clarify before I apply?' : tailoringSkill ? 'Try “Tailor my resume for this role”…' : tailoring ? 'Ask for another edit, explanation, or undo…' : 'Ask the Claude/Codex editor agent…'}
          aria-label="Message CV editor agent"
          disabled={!hydrated}
          maxLength={8000}
          rows={3}
          className="w-full resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm leading-relaxed outline-none placeholder:text-[var(--color-muted)] focus:border-[var(--color-accent)] disabled:opacity-60"
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-xs text-[var(--color-muted)]">
            {busy ? 'Working… Esc stops the reply' : editingIndex !== null ? 'Editing a previous message — save to rerun from there' : api.reviewPending ? 'Accept or reject the current proposal before sending another edit' : resumeReviewMode ? 'Your feedback updates the review, not the resume' : reviewOnly ? 'Confirmed corrections are saved to this application’s analysis' : 'AI edits are previewed before they can be saved'}
          </span>
          <button
            onClick={() => busy ? stop() : void send()}
            disabled={!busy && (sendBlocked || !message.trim())}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-40',
              busy ? 'border border-[var(--color-bad)] text-[var(--color-bad)]' : 'bg-[var(--color-accent)] text-[var(--color-bg)]',
            )}
          >
            {busy ? <Square size={12} aria-hidden="true" /> : null}
            {busy ? 'Stop' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}

function SkillRunTranscript({ run, live = false }: {
  run: NonNullable<DisplayTurn['skillRun']>
  live?: boolean
}) {
  const listRef = useRef<HTMLOListElement>(null)
  // Older runs were stored one reasoning fragment per row; join them for display.
  const events = run.events.reduce<ChatSkillEvent[]>(appendSkillEvent, [])
  useEffect(() => {
    if (live && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [live, run.events])

  const name = run.skillId === 'tailor-cv' ? 'Tailoring run' : `${run.skillId} run`
  const steps = `${events.length} step${events.length === 1 ? '' : 's'}`

  // Open while it runs; a finished run folds away so the reply and the proposal lead.
  return (
    <details open={live} className="group/run mt-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] text-xs">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-2.5 py-1.5 text-[var(--color-muted)] [&::-webkit-details-marker]:hidden">
        {live ? <Spinner /> : <ChevronRight size={14} aria-hidden="true" className="transition-transform group-open/run:rotate-90" />}
        <span className="font-medium text-[var(--color-text)]">{name}</span>
        <span>{live ? `running · ${steps}` : steps}</span>
        {run.runId ? <a href={`/runs/${run.runId}`} className="ml-auto text-[var(--color-accent)] hover:underline">Inspect run</a> : null}
      </summary>
      <ol ref={listRef} className="max-h-64 space-y-1.5 overflow-y-auto border-t border-[var(--color-border)] px-2.5 py-2">
        {events.map((event, index) => (
          <li key={`${index}-${event.kind}`} className="grid grid-cols-[4.5rem_1fr] gap-2 leading-relaxed">
            <span className={event.kind === 'change' ? 'text-[var(--color-ok)]' : 'text-[var(--color-muted)]'}>{SKILL_EVENT_LABELS[event.kind]}</span>
            <span className="whitespace-pre-wrap break-words">{event.text}</span>
          </li>
        ))}
      </ol>
    </details>
  )
}

const SKILL_EVENT_LABELS: Record<ChatSkillEvent['kind'], string> = {
  start: 'Started',
  activity: 'Step',
  reasoning: 'Thinking',
  preview: 'Preview',
  change: 'Change',
  result: 'Result',
}

/** Joins streamed reasoning fragments into the row before them instead of giving each its own row. */
function appendSkillEvent(events: ChatSkillEvent[], event: ChatSkillEvent): ChatSkillEvent[] {
  const last = events.at(-1)
  if (last?.kind === 'reasoning' && event.kind === 'reasoning') {
    return [...events.slice(0, -1), { kind: 'reasoning', text: (last.text + event.text).slice(0, 4_000) }]
  }
  return [...events, { ...event, text: event.text.slice(0, 4_000) }].slice(-160)
}

/** The route's own error message when it sent JSON, otherwise a status line instead of a JSON parse error. */
async function responseError(response: Response, fallback: string): Promise<string> {
  const body = await response.text().catch(() => '')
  try {
    const data = JSON.parse(body) as { error?: unknown }
    if (typeof data.error === 'string' && data.error.trim()) return data.error
  } catch { /* an HTML error page or an empty body */ }
  return `${fallback} (HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}).`
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    return await response.json() as Record<string, unknown>
  } catch {
    throw new Error('The server sent a response that could not be read.')
  }
}

function storeEditorChat(storageKey: string, snapshot: EditorChatSnapshot) {
  try {
    window.localStorage.setItem(storageKey, serializeEditorChatSnapshot(snapshot))
  } catch {
    // A full or disabled localStorage must not block editing or AI responses.
  }
}

function readEditorChat(storageKey: string): string | null {
  try { return window.localStorage.getItem(storageKey) } catch { return null }
}

function formatResumeReviewForConversation(reply: string, review: Review): string {
  return [
    reply,
    `Assessment: ${review.assessment}`,
    ...review.strengths.map((strength) => `Strength: ${strength}`),
    ...review.findings.map((finding) => `Finding in ${finding.location}: ${finding.issue} Recommendation: ${finding.recommendation}${finding.excerpt ? ` Excerpt: ${finding.excerpt}` : ''}${finding.suggestedWording ? ` Suggested wording: ${finding.suggestedWording}` : ''}`),
    ...review.questions.map((question) => `Question: ${question}`),
  ].join('\n')
}

function ReasoningSummary({ text }: { text: string }) {
  return (
    <details className="mt-2 border-t border-[var(--color-border)] pt-2 text-xs text-[var(--color-muted)]">
      <summary className="cursor-pointer font-medium">
        Reasoning summary
      </summary>
      <ChatMarkdown text={text} className="mt-1 leading-relaxed" />
    </details>
  )
}

function EditProposal({
  proposal,
  currentYaml,
  saving,
  onAccept,
  onReject,
  onEdit,
}: {
  proposal: NonNullable<DisplayTurn['proposal']>
  currentYaml: string
  saving: boolean
  onAccept: () => void
  onReject: () => void
  onEdit: () => void
}) {
  const pending = proposal.status === 'pending'
  const manuallyEdited = pending && currentYaml !== proposal.after
  const changes = changedLines(proposal.before, proposal.after)
  const shown = changes.slice(0, MAX_DIFF_LINES)

  const lineCount = `${changes.length} changed line${changes.length === 1 ? '' : 's'}`
  const diff = <>
    <div className="mt-1.5 max-h-40 overflow-y-auto rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] font-mono text-xs leading-relaxed">
      {shown.map((change, index) => (
        <div
          key={`${index}-${change.text}`}
          className={cn(
            'px-2 py-0.5',
            change.kind === 'add' ? 'bg-[var(--color-ok-soft)] text-[var(--color-ok)]' : 'bg-[var(--color-bad-soft)] text-[var(--color-bad)]',
          )}
        >
          <span className="sr-only">{change.kind === 'add' ? 'Added: ' : 'Removed: '}</span>
          <span aria-hidden="true">{change.kind === 'add' ? '+' : '−'} </span>{change.text || ' '}
        </div>
      ))}
    </div>
    {changes.length > shown.length ? (
      <p className="mt-1 text-xs text-[var(--color-muted)]">
        Showing {shown.length} of {changes.length} changed lines. Open the YAML editor to see the rest.
      </p>
    ) : null}
  </>

  // A settled proposal is history: fold it to one line instead of leaving a red and green block in the thread.
  if (!pending) {
    return (
      <details className="group/diff mt-2 border-t border-[var(--color-border)] pt-2 text-xs">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[var(--color-muted)] [&::-webkit-details-marker]:hidden">
          <ChevronRight size={14} aria-hidden="true" className="transition-transform group-open/diff:rotate-90" />
          <span className="font-medium text-[var(--color-text)]">{proposal.status === 'accepted' ? 'Change accepted' : 'Change rejected'}</span>
          <span>· {lineCount}</span>
        </summary>
        {diff}
      </details>
    )
  }

  return (
    <div className="mt-2 border-t border-[var(--color-border)] pt-2">
      <div className="flex items-center justify-between gap-2 text-xs">
        <p><span className="font-medium">Proposed change</span> <span className="text-[var(--color-muted)]">· {lineCount}</span></p>
        {manuallyEdited ? <Badge tone="accent">includes your edits</Badge> : null}
      </div>
      {diff}
      {pending ? (
        <div className="mt-2 flex flex-wrap justify-end gap-2">
          <button onClick={onEdit} disabled={saving} className="rounded-md border border-[var(--color-border-strong)] px-2.5 py-1.5 text-xs hover:bg-[var(--color-surface-2)] disabled:opacity-40">
            Edit YAML
          </button>
          <button onClick={onReject} disabled={saving} className="rounded-md border border-[var(--color-bad)] px-2.5 py-1.5 text-xs text-[var(--color-bad)] hover:bg-[var(--color-bad-soft)] disabled:opacity-40">
            Reject
          </button>
          <button onClick={onAccept} disabled={saving} className="flex items-center gap-1.5 rounded-md bg-[var(--color-ok)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-on-solid)] hover:opacity-90 disabled:opacity-40">
            {saving ? <Spinner className="border-t-[var(--color-on-solid)]" /> : null}
            {saving ? 'Saving…' : 'Accept & save'}
          </button>
        </div>
      ) : null}
    </div>
  )
}

const MAX_DIFF_LINES = 120

interface ChangedLine {
  kind: 'add' | 'remove'
  text: string
}

/** Small line-level LCS diff; unchanged YAML is intentionally omitted. */
function changedLines(before: string, after: string): ChangedLine[] {
  const left = before.split('\n')
  const right = after.split('\n')
  if (left.length * right.length > 1_000_000) return changedMiddle(left, right)
  const table = Array.from({ length: left.length + 1 }, () => new Uint16Array(right.length + 1))

  for (let i = left.length - 1; i >= 0; i--) {
    for (let j = right.length - 1; j >= 0; j--) {
      table[i][j] = left[i] === right[j]
        ? table[i + 1][j + 1] + 1
        : Math.max(table[i + 1][j], table[i][j + 1])
    }
  }

  const changes: ChangedLine[] = []
  let i = 0
  let j = 0
  while (i < left.length || j < right.length) {
    if (i < left.length && j < right.length && left[i] === right[j]) {
      i++
      j++
    } else if (j < right.length && (i === left.length || table[i][j + 1] >= table[i + 1][j])) {
      changes.push({ kind: 'add', text: right[j++] })
    } else if (i < left.length) {
      changes.push({ kind: 'remove', text: left[i++] })
    }
  }
  return changes
}

/** Avoid allocating a quadratic LCS table for unusually large YAML buffers. */
function changedMiddle(left: string[], right: string[]): ChangedLine[] {
  let start = 0
  while (start < left.length && start < right.length && left[start] === right[start]) start++

  let leftEnd = left.length - 1
  let rightEnd = right.length - 1
  while (leftEnd >= start && rightEnd >= start && left[leftEnd] === right[rightEnd]) {
    leftEnd--
    rightEnd--
  }

  return [
    ...left.slice(start, leftEnd + 1).map((text) => ({ kind: 'remove' as const, text })),
    ...right.slice(start, rightEnd + 1).map((text) => ({ kind: 'add' as const, text })),
  ]
}

/** The chat before its first message: what it is for, in readable type, and a few ways to start. */
function ChatEmpty({ title, hint, suggestions, onPick }: { title: string; hint: string; suggestions: string[]; onPick: (text: string) => void }) {
  return <div className="mx-auto flex max-w-md flex-col items-center gap-2 px-4 py-12 text-center">
    <p className="text-base font-semibold">{title}</p>
    <p className="text-sm leading-relaxed text-[var(--color-muted)]">{hint}</p>
    {suggestions.length ? <div className="mt-3 flex flex-wrap justify-center gap-2">
      {suggestions.map((text) => <button key={text} type="button" onClick={() => onPick(text)}
        className="cursor-pointer rounded-full border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-1.5 text-[13px] font-medium transition-colors hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]">{text}</button>)}
    </div> : null}
  </div>
}
