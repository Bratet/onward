'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Code2, Eye, FileText } from 'lucide-react'
import type { ReactCodeMirrorRef } from '@uiw/react-codemirror'
import type { Application } from '@/lib/applications'
import type { ApplicationRecord } from '@/lib/applicationRecord'
import { isAnswered, type FormAnswer } from '@/lib/formAnswers'
import type { OutreachDrafts } from '@/lib/outreach'
import type { CoverLetter } from '@/lib/coverLetter'
import { coverLetterFromWorkspace, letterSalutation, senderFromResume } from '@/lib/coverLetter'
import type { Lang } from '@/lib/paths'
import type { PostingContact } from '@/lib/postingContact'
import type { JdAnalysis } from '@/lib/tailoring/jd'
import type { ApplicationWorkspace, WorkspaceProposal } from '@/lib/workspaces'
import type { Op } from '@/lib/tailoring/ops'
import type { RequirementAction } from '@/lib/tailoring/rules'
import { EditorChat } from '@/components/EditorChat'
import { AiSheet, AiSheetTrigger } from '@/components/AiPanel'
import type { EditorApi } from '@/components/EditorPane'
import { Card, Spinner } from '@/components/ui/primitives'
import { YamlEditor } from '@/components/YamlEditor'
import { PdfPreview } from '@/components/PdfPreview'
import { ErrorNotice } from '@/components/ErrorNotice'
import type { FinalizedState } from '@/components/FinalizeStatus'
import { useFillHeight } from '@/components/useFillHeight'
import { readNdjson } from '@/lib/ndjson'
import { findPathOffset } from '@/lib/yamlPath'
import { cn } from '@/lib/utils'
import { applicationChatScope, editorChatStorageKey, parseEditorChatSnapshot, type ChatSkillEvent } from '@/lib/chatPersistence'

import type { EligibilityIssue } from '@/lib/eligibility'
import { FitStep, fitItems } from './fit-step'
import { DOCUMENT_KINDS, DocumentsStep, type DocumentKind } from './documents-step'
import { SendStep } from './send-step'
import { ApplicationHeader, type ApplyingStep } from './header'
import { wasSent } from '@/lib/applicationPhase'
import { hadInterviews } from '@/lib/journey'
import { statusLabel } from '@/lib/statuses'
import { celebrate } from '@/components/ui/flair'

/** The four steps of preparing, each its own view with its own AI: check the fit, tailor the resume, write the rest, send. */
type Step = 'fit' | 'resume' | 'documents' | 'send'
const STEPS: readonly Step[] = ['fit', 'resume', 'documents', 'send']
/** The Resume step shows the rendered preview or the YAML source. */
type Pane = 'preview' | 'source'

/**
 * The step and document a URL asks for. `?step=` names a step; links from
 * before the four steps used `?tab=` and `?pane=`, with `?step=` naming a
 * message, and still land in the matching place.
 */
function placeFromUrl(params: URLSearchParams): { step: Step | null; doc: DocumentKind | null; pane: Pane } {
  const step = params.get('step')
  const tab = params.get('tab')
  const pane = params.get('pane')
  const doc = params.get('doc')
  const legacyDoc = step === 'cover-letter' || step === 'email' || step === 'linkedin' ? step : null
  return {
    step: STEPS.includes(step as Step) ? step as Step
      : legacyDoc ? 'documents'
      : tab === 'send' || tab === 'next' ? 'send'
      : tab === 'resume' || pane === 'preview' || pane === 'source' ? 'resume'
      : pane === 'fit' ? 'fit'
      : null,
    doc: DOCUMENT_KINDS.includes(doc as DocumentKind) ? doc as DocumentKind : legacyDoc,
    pane: pane === 'source' ? 'source' : 'preview',
  }
}
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
export function ApplicationWorkspaceView({ app: serverApp, initialWorkspace, analysis, language, eligibility, contact, finalized: finalizedAtLoad, posting, legacyAnswers, postingUrl = null, reviewing = false }: {
  app: Application
  posting: ApplicationRecord['posting']
  /** Answers from an older application-answers.md, used until the form is saved here once. */
  legacyAnswers: FormAnswer[]
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
  const requested = placeFromUrl(new URLSearchParams(params.toString()))
  const [step, setStep] = useState<Step>(() => {
    const fallback: Step = initialWorkspace.pendingProposal ? 'resume' : finalizedAtLoad.resume ? 'documents' : 'fit'
    const chosen = requested.step ?? fallback
    return reviewing && chosen === 'send' ? 'fit' : chosen
  })
  const [pane, setPane] = useState<Pane>(requested.pane)
  const [doc, setDoc] = useState<DocumentKind>(requested.doc ?? (contact.coverLetter ? 'cover-letter' : 'answers'))
  // A requirement or eligibility question sent from the Fit step into its chat.
  const [fitSeed, setFitSeed] = useState<{ text: string; at: number } | undefined>(undefined)
  // The documents, shared by the Documents step and the Send checklist.
  const [coverLetter, setCoverLetter] = useState<CoverLetter>(() => coverLetterFromWorkspace(initialWorkspace.coverLetter, initialWorkspace.outreach?.['cover-letter'], {
    companyName: serverApp.row?.company ?? '',
    paper: senderFromResume(initialWorkspace.draftYaml).paper,
    recipientName: contact.name ?? '',
    salutation: letterSalutation(contact.firstName ?? '', language),
    lang: language,
  }))
  const [storedLetter, setStoredLetter] = useState<CoverLetter | null>(initialWorkspace.coverLetter ?? null)
  const [letterPdfName, setLetterPdfName] = useState<string | null>(serverApp.folder?.docs.find((each) => each.key === 'letterPdf' && each.name.endsWith('.pdf'))?.name ?? null)
  const [drafts, setDrafts] = useState<OutreachDrafts>(initialWorkspace.outreach ?? {})
  const [savedDrafts, setSavedDrafts] = useState<OutreachDrafts>(initialWorkspace.outreach ?? {})
  const [formAnswers, setFormAnswers] = useState<FormAnswer[]>(initialWorkspace.formAnswers ?? legacyAnswers)
  const [workspace, setWorkspace] = useState(initialWorkspace)
  const fitList = useMemo(() => fitItems(workspace.fit.report, analysis, eligibility), [workspace.fit.report, analysis, eligibility])
  const [draft, setDraft] = useState(initialWorkspace.draftYaml)
  // A resume already finalized from this draft does not open on the Tailor button, one click from an
  // AI run. Read once, so finalizing later does not reset the chat.
  const [offerTailorStarter] = useState(() => !(serverApp.folder?.has.pdf && finalizedAtLoad.resume?.yaml === initialWorkspace.draftYaml))
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
  const fitChatRef = useRef<HTMLDivElement>(null)
  // Below the wide layout each step's AI opens as a sheet over the step (AiSheet).
  const [fitSheet, setFitSheet] = useState(false)
  const [resumeSheet, setResumeSheet] = useState(false)
  useFillHeight(fitChatRef, step === 'fit', 80)
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

  // Mirror the place in the URL so reloads and shared links land in the same place. A step
  // change is a history entry, so Back returns to the previous step; the rest replaces it.
  const lastStep = useRef(step)
  useEffect(() => {
    const url = new URL(window.location.href)
    for (const name of ['tab', 'pane', 'step', 'doc']) url.searchParams.delete(name)
    url.searchParams.set('step', step)
    if (step === 'resume' && pane === 'source') url.searchParams.set('pane', 'source')
    if (step === 'documents') url.searchParams.set('doc', doc)
    if (url.href === window.location.href) return
    if (lastStep.current !== step) window.history.pushState(window.history.state, '', url)
    else window.history.replaceState(window.history.state, '', url)
    lastStep.current = step
  }, [step, pane, doc])
  useEffect(() => {
    function onPop() {
      const place = placeFromUrl(new URLSearchParams(window.location.search))
      if (place.step) { lastStep.current = place.step; setStep(place.step) }
      if (place.doc) setDoc(place.doc)
      setPane(place.pane)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  function goTo(next: Step) {
    setStep(next)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function openDocument(next: DocumentKind) {
    setDoc(next)
    goTo('documents')
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
    if (!draft.trim()) return
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
  }, [draft])

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
    if (surface === 'resume') setPane('preview')
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
      goTo('documents')
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
      setStep('resume')
      setPane('source')
      resumePaneRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      window.requestAnimationFrame(() => editorRef.current?.view?.focus())
    },
    pages: preview.pages,
    fill: preview.fill,
  }

  const finalized = !!app.folder?.has.pdf
  const resumeCurrent = !!resumeFinalized && resumeFinalized.yaml === draft
  const pdfName = app.folder?.docs.find((each) => each.key === 'pdf')?.name ?? null
  const documentsDone = !!letterPdfName || formAnswers.some(isAnswered) || !!savedDrafts.email || !!savedDrafts.linkedin
  const steps: ApplyingStep<Step>[] = [
    { value: 'fit', label: workspace.general ? 'Details' : 'Fit', done: workspace.general || !!workspace.fit.report, hint: 'How your resume stands against the posting' },
    { value: 'resume', label: 'Resume', done: finalized && resumeCurrent, hint: 'Tailor and finalize the resume you send' },
    { value: 'documents', label: 'Documents', done: documentsDone, hint: 'Cover letter, form questions and messages, all optional' },
    ...(reviewing ? [] : [{ value: 'send' as const, label: 'Send', done: false, hint: 'Check the packet and record that you sent it' }]),
  ]
  // 32px on a desk, 44px under a thumb.
  const toolButton = 'inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 text-xs font-medium transition-colors hover:bg-[var(--color-surface-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] max-sm:min-h-11'
  const mainButton = 'inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3.5 text-sm font-semibold text-[var(--color-on-solid)] shadow-[0_1px_2px_oklch(0_0_0/0.15)] transition-[filter] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:cursor-not-allowed disabled:bg-[var(--color-surface-2)] disabled:text-[var(--color-faint)] disabled:shadow-none max-sm:min-h-11'
  const chatCard = 'workspace-pane flex min-h-0 flex-col overflow-hidden'

  async function refreshAfterProfileUpdate() {
    const response = await fetch(`/api/applications/${encodeURIComponent(app.key)}/workspace`, { cache: 'no-store' })
    const data = await response.json()
    if (!response.ok || !data.workspace) throw new Error(data.error ?? 'could not refresh the application workspace')
    const next = data.workspace as ApplicationWorkspace
    if (next.draftYaml !== savedDraft.current) {
      if (latestDraft.current !== savedDraft.current) {
        setDraftConflict(true)
        throw new Error('The application resume changed while you had unsaved edits. Copy your edits before reloading.')
      }
      savedDraft.current = next.draftYaml
      setDraft(next.draftYaml)
      setSaveState('saved')
    }
    setWorkspace(next)
    revision.current = next.revision
    router.refresh()
  }

  function askFit(text: string) {
    setFitSeed({ text, at: Date.now() })
    if (window.matchMedia('(min-width: 1024px)').matches) fitChatRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    else setFitSheet(true)
  }

  /** Fit saves confirmed Skills into the working copy; Resume proposes full tailoring for review. */
  function stepChat(surface: 'overview' | 'resume', title: string, hint: string) {
    return <EditorChat
      title={title}
      hint={hint}
      onProfileUpdated={refreshAfterProfileUpdate}
      reviewOnly={surface === 'overview'}
      api={surface === 'overview' ? { ...editorApi, reviewPending: false } : editorApi}
      mode={workspace.general ? 'master' : 'tailored'}
      applicationKey={app.key}
      chatScope={applicationChatScope(app.key, surface)}
      starterMessage={surface === 'resume' && !workspace.general && offerTailorStarter ? 'Tailor my resume for this role' : undefined}
      seed={surface === 'overview' ? fitSeed : undefined}
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
  }

  // One answer to "can I send this resume?", in the words of what to do next.
  const resumeState: { tone: 'ok' | 'warn' | 'bad'; title: string; detail: string } = saveState === 'error'
    ? { tone: 'bad', title: 'Your latest edits aren’t saved', detail: 'Autosave failed. Keep this tab open and try again.' }
    : reviewPending ? { tone: 'warn', title: 'AI changes are waiting for you', detail: 'Accept or reject them in the chat, then finalize.' }
    : !finalized ? { tone: 'warn', title: 'Not finalized yet', detail: 'Finalizing saves this draft as the PDF you send.' }
    : !resumeCurrent ? { tone: 'warn', title: 'Changed since you finalized', detail: 'The PDF is the earlier version. Finalize again to send this one.' }
    : { tone: 'ok', title: 'Finalized and ready to send', detail: 'The PDF matches this draft.' }
  const fitsPage = preview.pages === 1 && !preview.failures.length

  // Each step's way forward sits in the step strip: the first later step not done yet, or the last one.
  // The Resume step offers it once the PDF is current.
  const later = steps.slice(steps.findIndex((each) => each.value === step) + 1)
  const ahead = later.find((each) => !each.done) ?? later[later.length - 1]
  const next = reviewing || !ahead || (step === 'resume' && !(finalized && resumeCurrent)) ? null
    : { to: ahead.value, label: `Continue to ${ahead.label}` }
  // A role you set aside or skipped can still be worked on, but nothing on it is the page's next move.
  const closedByYou = status === 'Discarded' || status === 'SKIP'
  const finalizeAction = !reviewing && step === 'resume' && !(finalized && resumeCurrent)
    ? <button type="button" disabled={busy || draftConflict || reviewPending || saveState !== 'saved'} onClick={() => void finalize()} title={reviewPending ? 'Accept or reject the pending change first' : 'Saves the current draft as the PDF you send'} className={closedByYou ? toolButton : cn(mainButton, 'h-8')}><Check size={14} strokeWidth={2.5} aria-hidden="true" /> {finalized ? 'Finalize again' : 'Finalize resume'}</button>
    : null
  // One primary per view: on Documents the open document has its own (Finalize letter, Draft it with AI),
  // and every document is optional, so moving on to Send is the quieter choice there.
  const nextAction = finalizeAction ?? (next ? <button type="button" onClick={() => goTo(next.to)} className={step === 'documents' || closedByYou ? toolButton : cn(mainButton, 'h-8')}>{next.label} <ArrowRight size={14} aria-hidden="true" /></button> : null)

  return (
    // On a phone each step ends with room for its floating AI button, so the last row is never under it.
    <div className="-mt-2 space-y-2 max-lg:pb-16 sm:-mt-3">
      <ApplicationHeader
        app={app}
        status={status}
        interviewed={hadInterviews(workspace.journey)}
        busy={busy}
        postingUrl={postingUrl}
        appliedAt={workspace.appliedAt}
        onStatus={(next, origin) => void patchStatus(next, origin)}
        steps={steps}
        step={step}
        onStep={goTo}
        stepsWhenSent={reviewing}
        action={nextAction}
      />
      {error ? <Card className="overflow-hidden border-[var(--color-bad-soft)]"><ErrorNotice error={error} onDismiss={() => setError(null)} /></Card> : null}
      {undoStatus || closedByYou ? <div role="status" className="anim-rise flex flex-wrap items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
        <p className="flex-1 text-sm"><span className="font-semibold">{undoStatus?.label ?? statusLabel(status)}.</span> <span className="text-[var(--color-muted)]">This application is closed. Everything you prepared is kept, and you can still open every step.</span></p>
        {undoStatus
          ? <button type="button" disabled={busy} onClick={() => { const back = undoStatus.previous; setUndoStatus(null); void patchStatus(back) }} className={toolButton}>Undo</button>
          : <button type="button" disabled={busy} onClick={() => void patchStatus('Preparing')} className={toolButton}>Reopen</button>}
      </div> : null}
      {reviewing ? <div className="anim-rise flex flex-wrap items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
        <p className="min-w-48 flex-1 text-xs text-[var(--color-muted)]">You’ve already sent this application. These are the tools you prepared it with. Changes here don’t change what they received.</p>
        <button type="button" onClick={() => router.push(`/applications/${encodeURIComponent(app.key)}`)} className={toolButton}><ArrowLeft size={13} aria-hidden="true" /> Back to the application</button>
      </div> : null}
      {draftConflict ? <Card className="flex flex-wrap items-center gap-3 border-[var(--color-bad-soft)] px-4 py-3"><p role="alert" className="flex-1 text-xs text-[var(--color-bad)]">{DRAFT_CONFLICT}</p><button type="button" onClick={() => window.location.reload()} className={mainButton}>Reload</button></Card> : null}

      {/* Steps stay mounted while hidden, so a chat or a tailoring run keeps going when you look elsewhere. */}
      <div hidden={step !== 'fit'} className="anim-fade">
        {/* The AI gets the right column from the step bar down. */}
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-4">
            <FitStep appKey={app.key} analysis={analysis} workspace={workspace} posting={posting} hasJd={!!app.folder?.has.jd}
              items={fitList} resumeText={draft}
              onRetry={() => setWorkspace((current) => ({ ...current, fit: { ...current.fit, status: 'queued' } }))}
              onAsk={askFit} />
          </div>
          <AiSheet label="Fit AI" open={fitSheet} onOpenChange={setFitSheet} active={step === 'fit'}>
            <div ref={fitChatRef} className="flex h-[max(420px,70vh)] flex-col">
              <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
                {stepChat('overview', 'Fit AI', 'Adds confirmed Skills to this application’s resume')}
              </Card>
            </div>
          </AiSheet>
          <AiSheetTrigger label="Fit AI" onOpen={() => setFitSheet(true)} />
        </div>
      </div>

      <div hidden={step !== 'resume'} className="anim-fade space-y-3">
        {preview.failures.length ? <Card className="border-[var(--color-bad-soft)]"><ul className="list-disc px-8 py-2 text-xs text-[var(--color-bad)]">{preview.failures.map((failure, index) => <li key={index}>{failure.why}</li>)}</ul></Card> : null}
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
          <section ref={resumePaneRef} aria-labelledby="resume-title" className="min-w-0">
            <h2 id="resume-title" className="sr-only">Your tailored resume</h2>
            <Card className="workspace-pane flex min-h-0 flex-col overflow-hidden">
              <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--color-border)] px-4 py-2">
                <div className="flex min-w-0 flex-1 basis-64 items-center gap-2.5" role="status">
                  <span aria-hidden="true" className={cn('grid size-6 shrink-0 place-items-center rounded-[var(--radius-md)]',
                    resumeState.tone === 'ok' ? 'bg-[var(--color-ok-soft)] text-[var(--color-ok)]' : resumeState.tone === 'bad' ? 'bg-[var(--color-bad-soft)] text-[var(--color-bad)]' : 'bg-[var(--color-warn-soft)] text-[var(--color-warn)]')}>
                    {resumeState.tone === 'ok' ? <Check size={13} strokeWidth={3} /> : <AlertTriangle size={12} strokeWidth={2.5} />}
                  </span>
                  <p className="min-w-0 text-sm leading-snug">
                    <span className="font-semibold">{saveState === 'saving' ? 'Saving your draft…' : resumeState.title}</span>
                    <span className="text-[var(--color-muted)]"> · {resumeState.detail}</span>
                  </p>
                </div>
                {rendering ? <span className="flex items-center gap-1.5 text-sm text-[var(--color-muted)]"><Spinner /> Rendering…</span>
                  : preview.pages ? <div className="flex items-center gap-2 text-sm" title={`${preview.pages} page${preview.pages === 1 ? '' : 's'}${preview.fill != null ? `, ${preview.fill}% of the page used` : ''}`}>
                    <span className={cn('rounded-[var(--radius-md)] px-1.5 py-0.5 text-xs font-semibold', fitsPage ? 'bg-[var(--color-ok-soft)] text-[var(--color-ok)]' : 'bg-[var(--color-warn-soft)] text-[var(--color-warn)]')}>{preview.pages} page{preview.pages === 1 ? '' : 's'}</span>
                    {preview.fill != null ? <>
                      <span aria-hidden="true" className="h-1.5 w-16 overflow-hidden rounded-[2px] bg-[var(--color-surface-2)]"><span className={cn('block h-full', fitsPage ? 'bg-[var(--color-ok)]' : 'bg-[var(--color-warn)]')} style={{ width: `${Math.min(100, preview.fill)}%` }} /></span>
                      <span className="font-semibold tabular-nums">{preview.fill}%</span><span className="sr-only"> of the page used</span>
                    </> : null}
                  </div> : null}
                {located ? <span role="status" className="text-xs text-[var(--color-muted)]">{located}</span> : null}
                <div className="flex items-center gap-2">
                  {finalized && pdfName ? <a href={`/api/applications/${encodeURIComponent(app.key)}/file/${encodeURIComponent(pdfName)}`} target="_blank" rel="noreferrer" className={cn(toolButton, 'h-7')}><FileText size={13} aria-hidden="true" /> Open PDF</a> : null}
                  <button type="button" aria-pressed={pane === 'source'} onClick={() => setPane(pane === 'source' ? 'preview' : 'source')} className={cn(toolButton, 'h-7')}>{pane === 'source' ? <><Eye size={13} aria-hidden="true" /> Preview</> : <><Code2 size={13} aria-hidden="true" /> Edit source</>}</button>
                </div>
              </div>
              <div className={cn('min-h-0 flex-1 overflow-hidden', pane !== 'preview' && 'hidden')}><PdfPreview token={preview.token} /></div>
              <div className={cn('min-h-0 flex-1 overflow-hidden', pane !== 'source' && 'hidden')}><YamlEditor ref={editorRef} value={draft} onChange={setDraft} /></div>
            </Card>
          </section>
          <AiSheet label="Resume AI" open={resumeSheet} onOpenChange={setResumeSheet} active={step === 'resume'}>
            <Card className={chatCard}>
              {stepChat('resume', 'Resume AI', workspace.general ? 'Ask for changes to this copy of your general resume.' : 'Also reads your Fit conversation. You review every change before it’s saved.')}
            </Card>
          </AiSheet>
          <AiSheetTrigger label="Resume AI" onOpen={() => setResumeSheet(true)} />
        </div>
      </div>

      <div hidden={step !== 'documents'} className="anim-fade">
        <DocumentsStep
          app={app}
          active={step === 'documents'}
          contact={contact}
          resumeReady={finalized}
          onGoToResume={() => goTo('resume')}
          doc={doc}
          onDoc={setDoc}
          initialLetter={coverLetter}
          storedLetter={storedLetter}
          letterFinalized={finalizedAtLoad.letter}
          letterPdf={!!letterPdfName}
          onLetterSaved={(letter) => { setCoverLetter(letter); setStoredLetter(letter) }}
          onLetterFinalized={setLetterPdfName}
          drafts={drafts}
          savedDrafts={savedDrafts}
          onDraft={(kind, text) => setDrafts((current) => ({ ...current, [kind]: text }))}
          onDraftSaved={(kind, text) => setSavedDrafts((current) => ({ ...current, [kind]: text }))}
          answers={formAnswers}
          answersImported={!initialWorkspace.formAnswers && legacyAnswers.length > 0}
          onAnswers={setFormAnswers}
        />
      </div>

      {!reviewing ? <div hidden={step !== 'send'} className="anim-fade">
        <SendStep
          app={app}
          status={status}
          pdfName={pdfName}
          letterPdf={!!letterPdfName}
          letterDrafted={!!coverLetter.content.trim()}
          letterAsked={!!contact.coverLetter}
          answers={formAnswers}
          contact={contact}
          postingUrl={postingUrl}
          checks={{ resumeFinalized: finalized, resumeCurrent, pendingEdit: reviewPending, invalidDraft: preview.failures.length > 0 }}
          onResume={() => goTo('resume')}
          onDocument={openDocument}
          onLocatePdf={(reveal) => void locatePdf(reveal)}
          onSent={(next, origin) => { const previous = status; setStatus(next); onStatusChanged(previous, next, origin); router.refresh() }}
        />
        {located ? <p role="status" className="mt-2 text-center text-xs text-[var(--color-muted)]">{located}</p> : null}
      </div> : null}
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

/** Each kind of edit keeps one colour: additions green, removals red, the rest the accent. */
const OP_TONE: Record<Op['op'], string> = {
  set: 'bg-[var(--color-ok-soft)] text-[var(--color-ok)]',
  import: 'bg-[var(--color-ok-soft)] text-[var(--color-ok)]',
  drop: 'bg-[var(--color-bad-soft)] text-[var(--color-bad)]',
  reword: 'bg-[var(--color-surface-2)] text-[var(--color-muted)]',
  reorder: 'bg-[var(--color-surface-2)] text-[var(--color-muted)]',
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
    <section aria-label="Suggested resume changes" className="mt-3 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="border-b border-[var(--color-border)] px-4 py-2.5">
        <p className="text-sm font-semibold text-[var(--color-text)]">Suggested changes <span className="ml-1 font-normal tabular-nums text-[var(--color-muted)]">{proposal.ops.length}</span></p>
      </div>
      {!individuallyReviewable ? <p className="border-b border-[var(--color-border)] px-4 py-2 text-[13px] text-[var(--color-muted)]">This older proposal can be accepted or rejected as a whole.</p> : null}
      <ul className="divide-y divide-[var(--color-border)]">
        {proposal.ops.map((op, index) => {
          const selected = proposal.choices[index] !== false
          return (
            <li key={`${op.path}-${index}`}>
              <label className={cn('flex items-start gap-3 px-4 py-3 transition-colors', individuallyReviewable && !busy && 'cursor-pointer hover:bg-[var(--color-surface-2)]')}>
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => onToggle(index)}
                  disabled={busy || !individuallyReviewable}
                  aria-label={`Keep change: ${op.why}`}
                  className="mt-1 size-4 shrink-0 accent-[var(--color-accent)]"
                />
                <div className={cn('min-w-0 flex-1 space-y-1.5', !selected && 'opacity-50')}>
                  <p className={cn('text-sm leading-snug', !selected && 'line-through')}>
                    <span className={cn('mr-2 rounded-[var(--radius-md)] px-1.5 py-0.5 text-xs font-semibold capitalize', OP_TONE[op.op])}>{op.op}</span>
                    {op.why}
                  </p>
                  {op.op === 'reword' ? <div className="space-y-1 text-[13px] leading-relaxed">
                    <p className="rounded-md bg-[var(--color-bad-soft)] px-2 py-1"><span aria-hidden="true" className="mr-1 font-semibold text-[var(--color-bad)]">−</span><span className="sr-only">Before: </span>{op.from}</p>
                    <p className="rounded-md bg-[var(--color-ok-soft)] px-2 py-1"><span aria-hidden="true" className="mr-1 font-semibold text-[var(--color-ok)]">+</span><span className="sr-only">After: </span>{op.to}</p>
                  </div> : null}
                  {op.op === 'set' ? <p className="rounded-md bg-[var(--color-ok-soft)] px-2 py-1 text-[13px] leading-relaxed"><span aria-hidden="true" className="mr-1 font-semibold text-[var(--color-ok)]">+</span>{op.value}</p> : null}
                  <p className="truncate font-mono text-xs text-[var(--color-faint)]">{op.path}</p>
                </div>
              </label>
            </li>
          )
        })}
      </ul>
      <div className="space-y-2.5 border-t border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-3">
        <div>
          <p className="text-sm font-semibold tabular-nums text-[var(--color-text)]">{kept} of {proposal.ops.length} changes selected</p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-[var(--color-muted)]">
            {currentPages ?? proposal.render.pages ?? '—'} page · {currentFill ?? proposal.render.fill ?? '—'}% of the page used. Accepting keeps these changes in your draft; finalize the resume when you’re ready.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onAccept} disabled={busy || kept === 0} className="inline-flex min-h-9 cursor-pointer items-center rounded-lg bg-[var(--color-accent)] px-3 text-sm font-semibold text-[var(--color-on-solid)] transition-[filter] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-40">Accept {kept === proposal.ops.length ? 'all' : kept}</button>
          <button type="button" onClick={onReject} disabled={busy} className="inline-flex min-h-9 cursor-pointer items-center rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 text-sm font-medium text-[var(--color-bad)] transition-colors hover:bg-[var(--color-bad-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-bad)] disabled:cursor-not-allowed disabled:opacity-40">Reject all</button>
        </div>
      </div>
    </section>
  )
}
