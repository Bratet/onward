'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Code2, Eye, FileSearch, FileText } from 'lucide-react'
import type { ReactCodeMirrorRef } from '@uiw/react-codemirror'
import type { Application } from '@/lib/applications'
import { coverLetterFromWorkspace, letterSalutation, senderFromResume } from '@/lib/coverLetter'
import type { Lang } from '@/lib/paths'
import type { PostingContact } from '@/lib/postingContact'
import type { JdAnalysis } from '@/lib/tailoring/jd'
import type { ApplicationWorkspace, WorkspaceProposal } from '@/lib/workspaces'
import type { Op } from '@/lib/tailoring/ops'
import type { RequirementAction } from '@/lib/tailoring/rules'
import { EditorChat } from '@/components/EditorChat'
import type { EditorApi } from '@/components/EditorPane'
import { Badge, Card, Spinner } from '@/components/ui/primitives'
import { YamlEditor } from '@/components/YamlEditor'
import { PdfPreview } from '@/components/PdfPreview'
import { ErrorNotice } from '@/components/ErrorNotice'
import { FinalizeStatus, type FinalizedState } from '@/components/FinalizeStatus'
import { readNdjson } from '@/lib/ndjson'
import { findPathOffset } from '@/lib/yamlPath'
import { cn } from '@/lib/utils'
import { applicationChatScope, editorChatStorageKey, parseEditorChatSnapshot, type ChatSkillEvent } from '@/lib/chatPersistence'

import type { EligibilityIssue } from '@/lib/eligibility'
import { Overview } from './overview'
import { NextStepsPanel, type NextStep } from './next-steps-panel'
import { ApplicationHeader, type ApplyingStep } from './header'
import { wasSent } from '@/lib/applicationPhase'
import { statusLabel } from '@/lib/statuses'
import { celebrate } from '@/components/ui/flair'
import { PaneTabs, paneTabPanelProps } from '@/components/ui/PaneTabs'

/** The two steps of preparing: the workspace (analysis, resume, AI), then sending. */
type Tab = 'workspace' | 'send'
/** The workspace's left pane: the fit analysis, the resume preview, or the resume's YAML source. */
type Pane = 'fit' | 'preview' | 'source'
/** The workspace's right pane, the AI: clarify the analysis, or tailor the resume. */
type ChatMode = 'clarify' | 'tailor'

/** Reads `?tab=`, including the three-step values older links still use. */
function tabFromUrl(value: string | null): Tab {
  return value === 'send' || value === 'next' ? 'send' : 'workspace'
}

const NEXT_STEPS: readonly NextStep[] = ['status', 'cover-letter', 'email', 'linkedin']
type SaveState = 'saved' | 'saving' | 'error'

/** Background jobs (fit analysis, a concurrent tailoring run) bump the workspace revision on the server before this tab's own request resolves. */
const DRAFT_CONFLICT = 'This resume was changed somewhere else, in another tab or by Claude. Your edits here are not saved. Reload to continue from the latest version.'

function isRevisionConflict(message: string): boolean {
  return message.startsWith('workspace changed: expected revision')
}

/**
 * The server props lag behind a finalize until router.refresh lands, and a
 * stale copy says there is no PDF. The finalize response already names it.
 */
function withFinalizedPdf(app: Application, pdfName: string | null): Application {
  if (!pdfName || !app.folder || app.folder.has.pdf) return app
  return {
    ...app,
    folder: {
      ...app.folder,
      has: { ...app.folder.has, pdf: true },
      docs: [...app.folder.docs, { key: 'pdf', name: pdfName, size: 0 }],
    },
  }
}

/**
 * The application before it is sent: analyze, tailor, apply, and nothing else.
 * Once it is sent the page renders PostApplicationView instead; `reviewing`
 * is this page opened from there to look back at the preparation tools.
 */
export function ApplicationWorkspaceView({ app: serverApp, initialWorkspace, analysis, language, eligibility, contact, finalized: finalizedAtLoad, postingUrl = null, reviewing = false }: {
  app: Application
  postingUrl?: string | null
  reviewing?: boolean
  language: Lang
  contact: PostingContact
  finalized: FinalizedState
  eligibility: EligibilityIssue[]
  initialWorkspace: ApplicationWorkspace
  analysis: JdAnalysis | null
}) {
  const [finalizedPdf, setFinalizedPdf] = useState<string | null>(null)
  const [resumeFinalized, setResumeFinalized] = useState(finalizedAtLoad.resume)
  const app = withFinalizedPdf(serverApp, finalizedPdf)
  const router = useRouter()
  const params = useSearchParams()
  const requested = params.get('tab')
  const requestedStep = params.get('step')
  const [tab, setTab] = useState<Tab>(reviewing ? 'workspace' : tabFromUrl(requested))
  const requestedPane = params.get('pane')
  const [pane, setPane] = useState<Pane>(requestedPane === 'fit' || requestedPane === 'preview' || requestedPane === 'source' ? requestedPane
    : requested === 'resume' || initialWorkspace.general || !analysis || finalizedAtLoad.resume ? 'preview' : 'fit')
  const [chatMode, setChatMode] = useState<ChatMode>(requested === 'resume' || finalizedAtLoad.resume || initialWorkspace.pendingProposal ? 'tailor' : 'clarify')
  const [nextStep, setNextStep] = useState<NextStep | null>(NEXT_STEPS.includes(requestedStep as NextStep) ? requestedStep as NextStep : null)
  const [workspace, setWorkspace] = useState(initialWorkspace)
  const [draft, setDraft] = useState(initialWorkspace.draftYaml)
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [preview, setPreview] = useState<{ token: string | null; pages: number | null; fill: number | null; failures: { why: string }[] }>({ token: null, pages: null, fill: null, failures: [] })
  const [rendering, setRendering] = useState(false)
  const [tailoring, setTailoring] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draftConflict, setDraftConflict] = useState(false)
  const [editorReviewPending, setEditorReviewPending] = useState(false)
  const [status, setStatus] = useState(app.row?.status ?? '')
  const [located, setLocated] = useState<string | null>(null)
  // Set aside and Skip apply at once; this keeps a way back for a few seconds.
  const [undoStatus, setUndoStatus] = useState<{ previous: string; label: string } | null>(null)
  useEffect(() => {
    if (!undoStatus) return
    const timer = window.setTimeout(() => setUndoStatus(null), 10000)
    return () => window.clearTimeout(timer)
  }, [undoStatus])
  const [proposalOutcome, setProposalOutcome] = useState<{ text: string; at: number } | undefined>(undefined)
  // The chat a tailoring run was started from; only that chat's reply gets the proposal's outcome.
  const tailoredFrom = useRef<'overview' | 'resume'>('resume')
  const savedDraft = useRef(initialWorkspace.draftYaml)
  const revision = useRef(initialWorkspace.revision)
  const editorRef = useRef<ReactCodeMirrorRef>(null)
  const editorCardRef = useRef<HTMLDivElement>(null)
  const resumePaneRef = useRef<HTMLElement>(null)

  useEffect(() => { revision.current = workspace.revision }, [workspace.revision])

  // Server props can be older than what this page already saved: a remount
  // (hot reload, back/forward cache) rebuilds state from them, and the chat
  // would then send that stale draft to the agent. Adopt the saved workspace
  // whenever it is newer, unless there are unsaved local edits to keep.
  const latestDraft = useRef(draft)
  latestDraft.current = draft
  function adoptNewerWorkspace(next: ApplicationWorkspace) {
    if (next.revision <= revision.current || latestDraft.current !== savedDraft.current) return
    revision.current = next.revision
    savedDraft.current = next.draftYaml
    setWorkspace(next)
    setDraft(next.draftYaml)
  }
  useEffect(() => {
    let cancelled = false
    void fetch(`/api/applications/${encodeURIComponent(serverApp.key)}/workspace`, { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => { if (!cancelled && data?.workspace) adoptNewerWorkspace(data.workspace as ApplicationWorkspace) })
      .catch(() => { /* the props remain a valid starting point */ })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverApp.key])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => adoptNewerWorkspace(initialWorkspace), [initialWorkspace])

  // Mirror the current step in the URL so reloads and shared links land in the same place.
  useEffect(() => {
    const url = new URL(window.location.href)
    url.searchParams.set('tab', tab)
    if (tab === 'workspace') url.searchParams.set('pane', pane); else url.searchParams.delete('pane')
    if (tab === 'send' && nextStep) url.searchParams.set('step', nextStep); else url.searchParams.delete('step')
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, '', url)
  }, [tab, pane, nextStep])

  function goTo(next: Tab) {
    setTab(next)
    if (next !== 'send') setNextStep(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  /** Refetch the workspace to pick up a revision this tab did not know had already moved on. */
  async function refreshWorkspaceRevision(): Promise<ApplicationWorkspace> {
    const response = await fetch(`/api/applications/${encodeURIComponent(app.key)}/workspace`, { cache: 'no-store' })
    const data = await response.json()
    if (!response.ok || !data.workspace) throw new Error(data.error ?? 'could not refresh the application workspace')
    setWorkspace(data.workspace)
    revision.current = data.workspace.revision
    return data.workspace as ApplicationWorkspace
  }

  /**
   * Retry once against the latest revision, but only when the other write left
   * the resume draft alone (a fit run, a cover letter save). If the draft itself
   * moved on, retrying would overwrite it with this tab's older copy, so stop
   * and ask for a reload instead.
   */
  async function withRevisionRetry<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation()
    } catch (error) {
      if (!isRevisionConflict((error as Error).message)) throw error
      const latest = await refreshWorkspaceRevision()
      if (latest.draftYaml !== savedDraft.current) {
        setDraftConflict(true)
        throw new Error(DRAFT_CONFLICT)
      }
      return await operation()
    }
  }

  useEffect(() => {
    if (draft === savedDraft.current || draftConflict || editorReviewPending || tailoring || workspace.pendingProposal) return
    setSaveState('saving')
    const timer = window.setTimeout(async () => {
      try {
        const saved = await withRevisionRetry(async () => {
          const response = await fetch(`/api/applications/${encodeURIComponent(app.key)}/workspace`, {
            method: 'PUT', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ revision: revision.current, draftYaml: draft }),
          })
          const data = await response.json()
          if (!response.ok) throw new Error(data.error ?? 'autosave failed')
          return data.workspace as ApplicationWorkspace
        })
        savedDraft.current = draft
        revision.current = saved.revision
        setWorkspace(saved)
        setSaveState('saved')
      } catch (reason) {
        setSaveState('error')
        setError((reason as Error).message)
      }
    }, 650)
    return () => window.clearTimeout(timer)
  }, [app.key, draft, draftConflict, editorReviewPending, tailoring, workspace.pendingProposal])

  useEffect(() => {
    if (tab !== 'workspace' || !draft.trim()) return
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setRendering(true)
      try {
        const response = await fetch('/api/render', {
          method: 'POST', headers: { 'content-type': 'application/json' }, signal: controller.signal,
          body: JSON.stringify({ yaml: draft, mode: workspace.general ? 'general' : 'tailored' }),
        })
        const data = await response.json()
        setPreview({ token: data.token, pages: data.pages, fill: data.fill, failures: data.failures ?? [] })
      } catch (reason) {
        if ((reason as Error).name !== 'AbortError') setError((reason as Error).message)
      } finally { setRendering(false) }
    }, 700)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [draft, tab])

  useEffect(() => {
    if (workspace.fit.status !== 'queued' || !analysis) return
    let active = true
    void fetch(`/api/applications/${encodeURIComponent(app.key)}/workspace/fit`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    }).then(async (response) => {
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'fit analysis failed')
      if (active) { setWorkspace(data.workspace); revision.current = data.workspace.revision }
    }).catch(async (reason) => {
      if (!active) return
      // A concurrent background request may already have claimed the job.
      // Refresh once so the local queued state cannot create a retry loop.
      try {
        const data = await fetch(`/api/applications/${encodeURIComponent(app.key)}/workspace`, { cache: 'no-store' }).then((response) => response.json())
        if (data.workspace) { setWorkspace(data.workspace); revision.current = data.workspace.revision; return }
      } catch {}
      setError((reason as Error).message)
    })
    return () => { active = false }
  }, [analysis, app.key, workspace.fit.status])

  useEffect(() => {
    if (workspace.fit.status !== 'running') return
    let active = true
    const poll = window.setInterval(() => {
      void fetch(`/api/applications/${encodeURIComponent(app.key)}/workspace`, { cache: 'no-store' })
        .then((response) => response.json())
        .then((data) => {
          if (!active || !data.workspace) return
          setWorkspace(data.workspace)
          revision.current = data.workspace.revision
        })
        .catch(() => {})
    }, 2000)
    return () => { active = false; window.clearInterval(poll) }
  }, [app.key, workspace.fit.status])

  /** Sent: confetti, then the server renders the post-application page in place of this one. */
  function onStatusChanged(previous: string, next: string, origin?: { x: number; y: number }) {
    if (!wasSent(previous) && wasSent(next)) {
      if (next !== 'Rejected') celebrate(origin)
      router.replace(`/applications/${encodeURIComponent(app.key)}`)
    }
  }

  async function patchStatus(next: string, origin?: { x: number; y: number }) {
    setBusy(true); setError(null)
    try {
      const response = await fetch(`/api/applications/${encodeURIComponent(app.key)}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: next }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'status update failed')
      const previous = status
      setStatus(next)
      setUndoStatus(next === 'Discarded' || next === 'SKIP' ? { previous, label: statusLabel(next) } : null)
      onStatusChanged(previous, next, origin)
      if (next === 'Applied') {
        const refreshed = await fetch(`/api/applications/${encodeURIComponent(app.key)}/workspace`, { cache: 'no-store' }).then((row) => row.json())
        if (refreshed.workspace) { setWorkspace(refreshed.workspace); revision.current = refreshed.workspace.revision }
      }
      router.refresh()
    } catch (reason) { setError((reason as Error).message) } finally { setBusy(false) }
  }

  async function tailor(handlers: {
    onEvent: (event: ChatSkillEvent) => void
    conversation?: { role: 'user' | 'assistant'; content: string }[]
    signal?: AbortSignal
  }, surface: 'overview' | 'resume' = 'resume'): Promise<{ answer: string; engine?: string; skillId: string; runId?: string }> {
    if (tailoring || editorReviewPending) throw new Error('Finish the current resume changes before tailoring again.')
    if (workspace.pendingProposal) throw new Error('Accept or reject the current proposal before tailoring again.')
    if (saveState !== 'saved') throw new Error('Wait for the current resume draft to finish saving first.')
    setTab('workspace'); setPane('preview'); setChatMode('tailor')
    tailoredFrom.current = surface
    setTailoring(true); setError(null); handlers.onEvent({ kind: 'start', text: 'Invoking the Tailor CV skill.' })
    const beforeYaml = draft
    let conversation = handlers.conversation
    if (surface === 'resume') {
      try {
        const overview = parseEditorChatSnapshot(window.localStorage.getItem(editorChatStorageKey(applicationChatScope(app.key, 'overview'))))
        conversation = [...(overview?.turns ?? []).map(({ role, content }) => ({ role, content })), ...(conversation ?? [])].slice(-100)
      } catch { /* Tailoring can still use the current request if storage is unavailable. */ }
    }
    try {
      const response = await fetch(`/api/applications/${encodeURIComponent(app.key)}/tailor`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ skillId: 'tailor-cv', conversation }), signal: handlers.signal,
      })
      if (!response.ok) throw new Error((await response.json()).error ?? 'tailoring failed')
      let engine: string | undefined
      let runId: string | undefined
      let result: { baseYaml: string; yaml: string; ops: Op[]; requirementActions: RequirementAction[]; pages: number; fill: number; iterations: number; runId: string } | null = null
      let streamError: string | null = null
      await readNdjson(response, (event) => {
        if (event.type === 'start') {
          if (typeof event.engine === 'string') engine = event.engine
          if (typeof event.runId === 'string') runId = event.runId
          handlers.onEvent({ kind: 'start', text: `${String(event.engine ?? 'AI')} started ${String(event.skillId ?? 'tailor-cv')} v${String(event.skillVersion ?? '')}.` })
        }
        if (event.type === 'progress' && typeof event.message === 'string') handlers.onEvent({ kind: 'activity', text: event.message })
        if (event.type === 'reasoning' && typeof event.message === 'string') handlers.onEvent({ kind: 'reasoning', text: event.message })
        if (event.type === 'candidate' && typeof event.yaml === 'string') {
          setDraft(event.yaml)
          handlers.onEvent({
            kind: 'preview',
            text: `Iteration ${String(event.attempt ?? '?')} preview: ${String(event.pages ?? '?')} page, ${String(event.fill ?? '?')}% fill, ${Array.isArray(event.ops) ? event.ops.length : 0} validated changes.`,
          })
        }
        if (event.type === 'change' && event.op && typeof event.op === 'object') {
          const op = event.op as Op
          handlers.onEvent({ kind: 'change', text: tailoringOperationEvent(op) })
        }
        if (event.type === 'error') {
          streamError = String(event.message ?? 'tailoring failed')
          setError(streamError)
        }
        if (event.type === 'done') {
          result = event as unknown as typeof result
          handlers.onEvent({
            kind: 'result',
            text: `Verified ${String(event.pages ?? '?')} page at ${String(event.fill ?? '?')}% fill after ${String(event.iterations ?? '?')} measured iterations.`,
          })
        }
      })
      const completed = result as { baseYaml: string; yaml: string; ops: Op[]; requirementActions: RequirementAction[]; pages: number; fill: number; iterations: number; runId: string } | null
      if (!completed) throw new Error(streamError ?? 'tailoring ended without a reviewable proposal')
      const saved = await withRevisionRetry(async () => {
        const response2 = await fetch(`/api/applications/${encodeURIComponent(app.key)}/workspace/proposal`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ revision: revision.current, kind: 'tailoring', beforeYaml, operationBaseYaml: completed.baseYaml, currentYaml: completed.yaml, ops: completed.ops, requirementActions: completed.requirementActions, pages: completed.pages, fill: completed.fill, runId: completed.runId }),
        })
        const data = await response2.json()
        if (!response2.ok) throw new Error(data.error ?? 'could not save proposal')
        return data.workspace as ApplicationWorkspace
      })
      savedDraft.current = saved.draftYaml
      setDraft(saved.draftYaml); setWorkspace(saved); revision.current = saved.revision; setSaveState('saved')
      return {
        answer: `I tailored the resume with the Tailor CV skill in ${completed.iterations} measured iteration${completed.iterations === 1 ? '' : 's'}. I’m previewing ${completed.ops.length} suggested change${completed.ops.length === 1 ? '' : 's'} at ${completed.pages} page and ${completed.fill}% fill. Review each change below, then accept or reject the proposal.`,
        engine,
        skillId: 'tailor-cv',
        runId: completed.runId ?? runId,
      }
    } catch (reason) {
      setDraft(savedDraft.current)
      const aborted = (reason as Error).name === 'AbortError'
      setError(aborted ? null : (reason as Error).message)
      throw reason
    } finally { setTailoring(false) }
  }

  async function toggleTailoringChange(index: number) {
    const proposal = workspace.pendingProposal
    if (!proposal?.operationBaseYaml || proposal.kind !== 'tailoring') return
    const choices = proposal.choices.map((choice, choiceIndex) => choiceIndex === index ? !choice : choice)
    setBusy(true); setError(null)
    try {
      const applyResponse = await fetch(`/api/applications/${encodeURIComponent(app.key)}/apply-ops`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ yaml: proposal.operationBaseYaml, ops: proposal.ops.filter((_, opIndex) => choices[opIndex] !== false) }),
      })
      const applied = await applyResponse.json()
      if (!applyResponse.ok) throw new Error(applied.error ?? 'could not update the tailoring proposal')
      const saved = await withRevisionRetry(async () => {
        const response = await fetch(`/api/applications/${encodeURIComponent(app.key)}/workspace/proposal`, {
          method: 'PATCH', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ revision: revision.current, action: 'update', yaml: applied.yaml, choices }),
        })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error ?? 'could not save the tailoring choices')
        return data.workspace as ApplicationWorkspace
      })
      savedDraft.current = saved.draftYaml
      setDraft(saved.draftYaml); setWorkspace(saved); revision.current = saved.revision
    } catch (reason) { setError((reason as Error).message) } finally { setBusy(false) }
  }

  async function resolveProposal(action: 'accept' | 'reject') {
    const proposal = workspace.pendingProposal
    const total = proposal?.ops.length ?? 0
    const kept = proposal?.choices.filter((choice) => choice !== false).length ?? 0
    setBusy(true); setError(null)
    try {
      const saved = await withRevisionRetry(async () => {
        const response = await fetch(`/api/applications/${encodeURIComponent(app.key)}/workspace/proposal`, {
          method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ revision: revision.current, action, yaml: draft }),
        })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error ?? `${action} failed`)
        return data.workspace as ApplicationWorkspace
      })
      savedDraft.current = saved.draftYaml
      setDraft(saved.draftYaml); setWorkspace(saved); revision.current = saved.revision
      setProposalOutcome({ text: action === 'accept' ? `Accepted ${kept} of ${total} change${total === 1 ? '' : 's'}.` : `Rejected ${total === 1 ? 'the change' : `all ${total} changes`}.`, at: Date.now() })
      router.refresh()
    } catch (reason) { setError((reason as Error).message) } finally { setBusy(false) }
  }

  async function finalize() {
    if (saveState !== 'saved' || editorReviewPending) return
    setBusy(true); setError(null)
    try {
      const result = await withRevisionRetry(async () => {
        const response = await fetch(`/api/applications/${encodeURIComponent(app.key)}/workspace/finalize`, {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ revision: revision.current }),
        })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error ?? 'finalize failed')
        return data as { workspace: ApplicationWorkspace; finalized: { pdfName: string } }
      })
      setWorkspace(result.workspace); revision.current = result.workspace.revision
      setFinalizedPdf(result.finalized.pdfName)
      // The server finalized its saved draft, which is this tab's saved draft.
      setResumeFinalized({ at: new Date().toISOString(), yaml: savedDraft.current })
      goTo('send')
      router.refresh()
    } catch (reason) { setError((reason as Error).message) } finally { setBusy(false) }
  }

  async function locatePdf(reveal: boolean) {
    setError(null)
    try {
      const response = await fetch(`/api/applications/${encodeURIComponent(app.key)}/reveal`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ doc: 'pdf', reveal }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'could not locate the finalized PDF')
      if (!reveal) await navigator.clipboard.writeText(data.path)
      setLocated(reveal ? (data.revealed ? 'Revealed in Finder' : data.path) : 'Path copied')
      window.setTimeout(() => setLocated(null), 2500)
    } catch (reason) { setError((reason as Error).message) }
  }

  async function saveEditorDraft(yaml = draft) {
    setSaveState('saving')
    setError(null)
    try {
      const data = await withRevisionRetry(async () => {
        const response = await fetch(`/api/applications/${encodeURIComponent(app.key)}/workspace`, {
          method: 'PUT', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ revision: revision.current, draftYaml: yaml }),
        })
        const body = await response.json()
        if (!response.ok) throw new Error(body.error ?? 'save failed')
        return body as { workspace: ApplicationWorkspace }
      })
      savedDraft.current = yaml
      revision.current = data.workspace.revision
      setDraft(yaml)
      setWorkspace(data.workspace)
      setSaveState('saved')
    } catch (reason) {
      setSaveState('error')
      setError((reason as Error).message)
      throw reason
    }
  }

  function jumpTo(path: string) {
    const view = editorRef.current?.view
    if (!view) return
    const offset = findPathOffset(draft, path)
    if (offset === null) return
    view.dispatch({ selection: { anchor: offset }, scrollIntoView: true })
    view.focus()
  }

  const reviewPending = editorReviewPending || tailoring || !!workspace.pendingProposal
  const editorApi: EditorApi = {
    text: draft,
    setText: setDraft,
    jumpTo,
    save: saveEditorDraft,
    markSaved: () => { savedDraft.current = draft; setSaveState('saved') },
    setReviewPending: setEditorReviewPending,
    reviewPending,
    showEditor: () => {
      setPane('source')
      resumePaneRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      window.requestAnimationFrame(() => editorRef.current?.view?.focus())
    },
    pages: preview.pages,
    fill: preview.fill,
  }

  const finalized = !!app.folder?.has.pdf
  const resumeCurrent = !!resumeFinalized && resumeFinalized.yaml === draft
  const steps: ApplyingStep<Tab>[] = [
    { value: 'workspace', label: 'Prepare', done: finalized, locked: false, next: false },
    { value: 'send', label: 'Send', done: false, locked: !finalized, next: finalized && tab !== 'send' },
  ]
  const pdfName = app.folder?.docs.find((doc) => doc.key === 'pdf')?.name ?? ''
  const chatTabs: { value: ChatMode; label: string; hint: string }[] = [
    { value: 'clarify', label: 'Clarify', hint: workspace.general ? 'Discuss the application. Doesn’t edit your resume.' : 'Discuss the analysis. Doesn’t edit your resume.' },
    { value: 'tailor', label: 'Tailor', hint: 'Ask for changes. Each one is previewed before it’s saved.' },
  ]
  const toolButton = 'inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 text-xs text-[var(--color-muted)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)]'
  const mainButton = 'inline-flex h-8 items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 text-xs font-semibold text-[var(--color-bg)] hover:opacity-90 disabled:opacity-40'

  function openClarify() {
    setChatMode('clarify')
    editorCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }

  return (
    <div className="space-y-4">
      <ApplicationHeader
        app={app}
        status={status}
        interviewed={(workspace.interview?.rounds.length ?? 0) > 0}
        busy={busy}
        postingUrl={postingUrl}
        appliedAt={workspace.appliedAt}
        onStatus={(next, origin) => void patchStatus(next, origin)}
        steps={reviewing ? undefined : steps}
        step={tab}
        onStep={(next) => { if (next === 'send' && !finalized) return; goTo(next) }}
      />
      {error ? <Card className="overflow-hidden border-[var(--color-bad-soft)]"><ErrorNotice error={error} onDismiss={() => setError(null)} /></Card> : null}
      {undoStatus ? <div role="status" className="anim-rise flex flex-wrap items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
        <p className="flex-1 text-sm"><span className="font-semibold">{undoStatus.label}.</span> <span className="text-[var(--color-muted)]">This application is closed. Everything you prepared is kept.</span></p>
        <button type="button" disabled={busy} onClick={() => { const back = undoStatus.previous; setUndoStatus(null); void patchStatus(back) }} className={toolButton}>Undo</button>
      </div> : null}
      {reviewing ? <div className="anim-rise flex flex-wrap items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
        <p className="min-w-48 flex-1 text-xs text-[var(--color-muted)]">You’ve already sent this application. These are the tools you prepared it with. Changes here don’t change what they received.</p>
        <button type="button" onClick={() => router.push(`/applications/${encodeURIComponent(app.key)}`)} className={toolButton}><ArrowLeft size={13} aria-hidden="true" /> Back to the application</button>
      </div> : null}

      {tab === 'send' ? <div key="send" className="anim-rise"><NextStepsPanel
        sent={reviewing}
        app={app}
        status={status}
        onStatusSaved={(next, origin) => { const previous = status; setStatus(next); onStatusChanged(previous, next, origin); router.refresh() }}
        initialDrafts={workspace.outreach ?? {}}
        savedCoverLetter={workspace.coverLetter ?? null}
        initialCoverLetter={coverLetterFromWorkspace(workspace.coverLetter, workspace.outreach?.['cover-letter'], {
          companyName: app.row?.company ?? '',
          paper: senderFromResume(workspace.draftYaml).paper,
          recipientName: contact.name ?? '',
          salutation: letterSalutation(contact.firstName ?? '', language),
          lang: language,
        })}
        contact={contact}
        letterFinalized={finalizedAtLoad.letter}
        step={nextStep}
        onStep={(step) => { setNextStep(step); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
        onGoToResume={() => { setPane('preview'); setChatMode('tailor'); goTo('workspace') }}
        onLocatePdf={(reveal) => void locatePdf(reveal)}
        checks={{ resumeCurrent, pendingEdit: reviewPending, invalidDraft: preview.failures.length > 0 }}
        postingUrl={postingUrl}
      /></div> : null}
      {tab === 'send' && located ? <p role="status" className="text-xs text-[var(--color-accent)]">{located}</p> : null}

      <div className={cn('space-y-3', tab !== 'workspace' && 'hidden')}>
        {draftConflict ? <Card className="flex flex-wrap items-center gap-3 border-[var(--color-bad-soft)] px-4 py-3"><p role="alert" className="flex-1 text-xs text-[var(--color-bad)]">{DRAFT_CONFLICT}</p><button type="button" onClick={() => window.location.reload()} className={mainButton}>Reload</button></Card> : null}
        {preview.failures.length ? <Card className="border-[var(--color-bad-soft)]"><ul className="list-disc px-8 py-2 text-xs text-[var(--color-bad)]">{preview.failures.map((failure, index) => <li key={index}>{failure.why}</li>)}</ul></Card> : null}

        <div className="grid items-start gap-4 lg:grid-cols-2">
          {/* The resume and the action on it sit together: the main button heads this pane. */}
          <section ref={resumePaneRef} aria-label="Fit analysis and resume" className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <PaneTabs label="Analysis or resume" idBase="left-pane" value={pane === 'source' ? 'preview' : pane} onChange={setPane} items={[
                { value: 'fit', label: workspace.general ? 'Details' : 'Fit analysis', icon: <FileSearch size={14} /> },
                { value: 'preview', label: 'Resume', icon: <FileText size={14} /> },
              ]} />
              <div className="ml-auto flex flex-wrap items-center gap-2">
                {located ? <span role="status" className="text-xs text-[var(--color-accent)]">{located}</span> : null}
                {finalized && resumeCurrent && !reviewing
                  ? <button type="button" onClick={() => goTo('send')} className={mainButton}>Continue to Send <ArrowRight size={13} aria-hidden="true" /></button>
                  : <button type="button" disabled={busy || draftConflict || reviewPending || saveState !== 'saved'} onClick={() => void finalize()} title={reviewPending ? 'Accept or reject the pending change first' : 'Saves the current draft as the PDF you send'} className={mainButton}>{finalized ? 'Finalize again' : 'Finalize resume'}</button>}
              </div>
            </div>
            <div {...paneTabPanelProps('left-pane', 'fit')} className={cn('workspace-pane anim-fade overflow-y-auto pr-1', pane !== 'fit' && 'hidden')}><Overview eligibility={eligibility} onOpenChat={openClarify} analysis={analysis} workspace={workspace} onRetry={() => setWorkspace((current) => ({ ...current, fit: { ...current.fit, status: 'queued' } }))} /></div>
            <Card {...paneTabPanelProps('left-pane', 'preview')} className={cn('workspace-pane flex min-h-0 flex-col overflow-hidden', pane === 'fit' && 'hidden')}>
              <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--color-border)] px-3 py-2">
                <FinalizeStatus saveState={saveState} pendingReview={reviewPending} finalized={resumeFinalized} upToDate={resumeCurrent} />
                {rendering ? <span className="flex items-center gap-1 text-xs text-[var(--color-muted)]"><Spinner /> Rendering…</span> : preview.pages ? <Badge tone={preview.pages === 1 && !preview.failures.length ? 'ok' : 'warn'}>{preview.pages} page · {preview.fill ?? '—'}% of the page used</Badge> : null}
                <div className="ml-auto flex items-center gap-2">
                  {finalized ? <a href={`/api/applications/${encodeURIComponent(app.key)}/file/${encodeURIComponent(pdfName)}`} target="_blank" rel="noreferrer" className={toolButton}><FileText size={13} aria-hidden="true" /> Open PDF</a> : null}
                  <button type="button" aria-pressed={pane === 'source'} onClick={() => setPane(pane === 'source' ? 'preview' : 'source')} className={toolButton}>{pane === 'source' ? <><Eye size={13} aria-hidden="true" /> Back to preview</> : <><Code2 size={13} aria-hidden="true" /> Edit source</>}</button>
                </div>
              </div>
              <div className={cn('min-h-0 flex-1 overflow-hidden', pane !== 'preview' && 'hidden')}><PdfPreview token={preview.token} /></div>
              <div className={cn('min-h-0 flex-1 overflow-hidden', pane !== 'source' && 'hidden')}><YamlEditor ref={editorRef} value={draft} onChange={setDraft} /></div>
            </Card>
          </section>
          <div ref={editorCardRef} className="min-w-0 lg:sticky lg:top-24">
            <Card className="workspace-pane flex min-h-0 flex-col overflow-hidden">
              <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--color-border)] px-3 pt-2">
                <PaneTabs label="AI" idBase="chat-pane" value={chatMode} onChange={setChatMode} items={chatTabs.map(({ value, label }) => ({ value, label }))} />
                <span className="ml-auto pb-2 text-xs text-[var(--color-muted)]">{chatTabs.find((each) => each.value === chatMode)?.hint}</span>
              </div>
              {(['clarify', 'tailor'] as const).map((mode) => {
                const surface = mode === 'clarify' ? 'overview' : 'resume'
                return <div key={mode} {...paneTabPanelProps('chat-pane', mode)} className={cn('min-h-0 flex-1 flex-col', chatMode === mode ? 'flex' : 'hidden')}>
                  <EditorChat
                    onProfileUpdated={async () => {
                      const response = await fetch(`/api/applications/${encodeURIComponent(app.key)}/workspace`, { cache: 'no-store' })
                      const data = await response.json()
                      if (response.ok && data.workspace) { setWorkspace(data.workspace); revision.current = data.workspace.revision }
                      router.refresh()
                    }}
                    reviewOnly={surface === 'overview'}
                    api={surface === 'overview' ? { ...editorApi, reviewPending: false } : editorApi}
                    mode={workspace.general ? 'master' : 'tailored'}
                    applicationKey={app.key}
                    chatScope={applicationChatScope(app.key, surface)}
                    tailoringSkill={workspace.general ? undefined : {
                      run: (handlers) => tailor(handlers, surface),
                      outcome: tailoredFrom.current === surface ? proposalOutcome : undefined,
                      review: surface === 'resume' && workspace.pendingProposal ? (
                        <TailoringProposal
                          proposal={workspace.pendingProposal}
                          busy={busy}
                          currentPages={preview.pages}
                          currentFill={preview.fill}
                          onToggle={(index) => void toggleTailoringChange(index)}
                          onReject={() => void resolveProposal('reject')}
                          onAccept={() => void resolveProposal('accept')}
                        />
                      ) : undefined,
                    }}
                  />
                </div>
              })}
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

function tailoringOperationEvent(op: Op): string {
  const detail = op.op === 'reword'
    ? `\n− ${op.from ?? ''}\n+ ${op.to ?? ''}`
    : op.op === 'set'
      ? `\n+ ${op.value ?? ''}`
      : ''
  return `${op.op.toUpperCase()} ${op.path}\n${op.why}${detail}`
}

function TailoringProposal({ proposal, busy, currentPages, currentFill, onToggle, onReject, onAccept }: {
  proposal: WorkspaceProposal
  busy: boolean
  currentPages: number | null
  currentFill: number | null
  onToggle: (index: number) => void
  onReject: () => void
  onAccept: () => void
}) {
  const kept = proposal.choices.filter((choice) => choice !== false).length
  const individuallyReviewable = !!proposal.operationBaseYaml

  return (
    <div className="mt-2 overflow-hidden border-t border-[var(--color-border)]">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-accent-soft)] px-3 py-2.5">
        <div className="min-w-48 flex-1">
          <p className="text-xs font-medium">Tailoring proposal · {kept}/{proposal.ops.length} changes selected</p>
          <p className="mt-0.5 text-xs text-[var(--color-muted)]">
            {currentPages ?? proposal.render.pages ?? '—'} page · {currentFill ?? proposal.render.fill ?? '—'}% fill · Accepting keeps these changes in your draft; finalize the resume when you’re ready
          </p>
        </div>
        <button onClick={onReject} disabled={busy} className="rounded-md border border-[var(--color-bad)] px-2.5 py-1 text-xs text-[var(--color-bad)] disabled:opacity-40">Reject all</button>
        <button onClick={onAccept} disabled={busy || kept === 0} className="rounded-md bg-[var(--color-ok)] px-2.5 py-1 text-xs font-medium text-white disabled:opacity-40">Accept changes</button>
      </div>
      {!individuallyReviewable ? <p className="border-b border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-faint)]">This older proposal can be accepted or rejected as a whole.</p> : null}
      <ul className="max-h-64 divide-y divide-[var(--color-border)] overflow-y-auto">
        {proposal.ops.map((op, index) => {
          const selected = proposal.choices[index] !== false
          return (
            <li key={`${op.path}-${index}`} className="flex items-start gap-2 px-3 py-2">
              <input
                type="checkbox"
                checked={selected}
                onChange={() => onToggle(index)}
                disabled={busy || !individuallyReviewable}
                aria-label={`Keep change: ${op.why}`}
                className="mt-0.5 shrink-0 accent-[var(--color-accent)]"
              />
              <div className={cn('min-w-0 flex-1', !selected && 'opacity-50')}>
                <p className={cn('text-xs leading-snug', !selected && 'line-through')}><span className="mr-1.5 font-mono text-xs uppercase text-[var(--color-accent)]">{op.op}</span>{op.why}</p>
                <p className="mt-0.5 truncate font-mono text-xs text-[var(--color-faint)]">{op.path}</p>
                {op.op === 'reword' ? <p className="mt-1 text-xs text-[var(--color-muted)]"><span className="text-[var(--color-bad)]">− {op.from}</span><br /><span className="text-[var(--color-ok)]">+ {op.to}</span></p> : null}
                {op.op === 'set' ? <p className="mt-1 text-xs text-[var(--color-ok)]">+ {op.value}</p> : null}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
