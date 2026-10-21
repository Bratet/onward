'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { FileText, Home, Mail, Wrench } from 'lucide-react'
import type { Application } from '@/lib/applications'
import type { ApplicationRecord } from '@/lib/applicationRecord'
import { applicationStanding, wasSent } from '@/lib/applicationPhase'
import { coverLetterFromWorkspace, letterSalutation, senderFromResume } from '@/lib/coverLetter'
import type { Lang } from '@/lib/paths'
import type { PostingContact } from '@/lib/postingContact'
import type { JdAnalysis } from '@/lib/tailoring/jd'
import type { ApplicationWorkspace } from '@/lib/workspaces'
import type { FinalizedState } from '@/components/FinalizeStatus'
import { Card } from '@/components/ui/primitives'
import { ErrorNotice } from '@/components/ErrorNotice'
import { JourneyCompanion } from '@/components/JourneyCompanion'
import { hadInterviews, parseJourney } from '@/lib/journey'
import { celebrate } from '@/components/ui/flair'
import { PaneTabs, paneTabPanelProps } from '@/components/ui/PaneTabs'
import { ApplicationHeader } from './header'
import { NextStepsPanel, type NextStep } from './next-steps-panel'
import { ApplicationRecordView, PostHome } from './record'

type Tab = 'home' | 'next' | 'record'
const TABS: readonly Tab[] = ['home', 'next', 'record']
const NEXT_STEPS: readonly NextStep[] = ['status', 'cover-letter', 'email', 'linkedin']

/**
 * The application once it has been sent. Nothing here edits the resume: it is
 * about the people on the other side, so it offers messages, the status, and
 * the job and documents as they were sent. The tools used to
 * prepare stay one link away, on the pre-application page.
 */
export function PostApplicationView({ app, record, analysis, initialWorkspace, contact, language, finalized }: {
  app: Application
  record: ApplicationRecord
  analysis: JdAnalysis | null
  initialWorkspace: ApplicationWorkspace
  contact: PostingContact
  language: Lang
  finalized: FinalizedState
}) {
  const router = useRouter()
  const params = useSearchParams()
  const requested = params.get('tab')
  const requestedStep = params.get('step')
  const [tab, setTab] = useState<Tab>(TABS.includes(requested as Tab) ? requested as Tab : 'home')
  const [nextStep, setNextStep] = useState<NextStep | null>(NEXT_STEPS.includes(requestedStep as NextStep) ? requestedStep as NextStep : null)
  const [workspace, setWorkspace] = useState(initialWorkspace)
  const [status, setStatus] = useState(app.row?.status ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [located, setLocated] = useState<string | null>(null)
  const base = `/api/applications/${encodeURIComponent(app.key)}`
  const standing = applicationStanding(status)

  // Mirror the current view in the URL so reloads and shared links land in the same place.
  useEffect(() => {
    const url = new URL(window.location.href)
    url.searchParams.set('tab', tab)
    if (tab === 'next' && nextStep) url.searchParams.set('step', nextStep); else url.searchParams.delete('step')
    url.searchParams.delete('view')
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, '', url)
  }, [tab, nextStep])

  function goTo(next: Tab) {
    setTab(next)
    if (next !== 'next') setNextStep(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  /** The preparation tools live on the pre-application page; this opens them there. */
  function openPreparation(pane: 'fit' | 'preview' = 'fit') {
    router.push(`/applications/${encodeURIComponent(app.key)}?view=prepare&tab=workspace&pane=${pane}`)
  }

  function statusChanged(previous: string, next: string, origin?: { x: number; y: number }) {
    if ((next === 'Responded' && previous === 'Applied') || (next === 'Interview' && previous !== 'Interview') || (next === 'Offer' && previous !== 'Offer')) celebrate(origin)
    // Back to not-sent (a mis-click, say): the server renders the pre-application page again.
    router.refresh()
  }

  async function patchStatus(next: string, origin?: { x: number; y: number }, note?: string) {
    setBusy(true); setError(null)
    try {
      const existing = app.row?.notes?.trim() ?? ''
      const body = note ? { status: next, notes: existing ? `${existing} ${note}` : note } : { status: next }
      const response = await fetch(base, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'status update failed')
      const previous = status
      setStatus(next)
      statusChanged(previous, next, origin)
    } catch (reason) { setError((reason as Error).message) } finally { setBusy(false) }
  }

  async function locatePdf(reveal: boolean) {
    setError(null)
    try {
      const response = await fetch(`${base}/reveal`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ doc: 'pdf', reveal }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'could not locate the finalized PDF')
      if (!reveal) await navigator.clipboard.writeText(data.path)
      setLocated(reveal ? (data.revealed ? 'Revealed in Finder' : data.path) : 'Path copied')
      window.setTimeout(() => setLocated(null), 2500)
    } catch (reason) { setError((reason as Error).message) }
  }

  return <div className="space-y-4">
    <ApplicationHeader app={app} status={status} interviewed={hadInterviews(workspace.journey)} busy={busy} postingUrl={record.posting.url} appliedAt={workspace.appliedAt} onStatus={(next, origin, note) => void patchStatus(next, origin, note)} />
    {error ? <Card className="overflow-hidden border-[var(--color-bad-soft)]"><ErrorNotice error={error} onDismiss={() => setError(null)} /></Card> : null}

    <div className="anim-rise flex flex-wrap items-center gap-3">
      <PaneTabs label="Application" idBase="sent" value={tab} onChange={goTo} className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden border-b border-[var(--color-border)] [scrollbar-width:none] sm:flex-none" items={[
        { value: 'home', label: 'Overview', icon: <Home size={15} /> },
        { value: 'next', label: 'Messages & status', icon: <Mail size={15} /> },
        { value: 'record', label: 'Job & documents', icon: <FileText size={15} /> },
      ]} />
      <button type="button" onClick={() => openPreparation()} className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-[var(--color-muted)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]" title="The fit analysis and resume you prepared this application with"><Wrench size={13} aria-hidden="true" /> Preparation tools</button>
    </div>

    <div {...paneTabPanelProps('sent', tab)}>
    {tab === 'home' ? <PostHome
      app={app}
      record={record}
      workspace={workspace}
      journey={parseJourney(workspace.journey)}
      companion={<JourneyCompanion
        appKey={app.key}
        onJourney={(journey) => setWorkspace((current) => ({ ...current, journey }))}
        onStatus={(next) => { setStatus(next); router.refresh() }}
      />}
      status={status}
      phase={standing}
      contact={contact}
      analysis={analysis}
      onGo={goTo}
      onStatus={(next, origin) => void patchStatus(next, origin)}
      onNotesSaved={() => router.refresh()}
    /> : null}
    {tab === 'next' ? <div className="anim-rise"><NextStepsPanel
      sent
      app={app}
      status={status}
      onStatusSaved={(next) => { const previous = status; setStatus(next); if (wasSent(next)) statusChanged(previous, next); else router.refresh() }}
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
      letterFinalized={finalized.letter}
      step={nextStep}
      onStep={(step) => { setNextStep(step); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
      onGoToResume={() => openPreparation('preview')}
      onLocatePdf={(reveal) => void locatePdf(reveal)}
    /></div> : null}
    {tab === 'next' && located ? <p role="status" className="text-xs text-[var(--color-accent)]">{located}</p> : null}
    {tab === 'record' ? <ApplicationRecordView
      app={app}
      record={record}
      analysis={analysis}
      workspace={workspace}
      contact={contact}
      letter={finalized.letter?.letter ?? workspace.coverLetter ?? null}
      onGoToAnalysis={() => openPreparation('fit')}
    /> : null}
    </div>
  </div>
}
