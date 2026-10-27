'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import type { Application } from '@/lib/applications'
import type { ApplicationRecord } from '@/lib/applicationRecord'
import type { JdAnalysis } from '@/lib/tailoring/jd'
import type { ApplicationWorkspace } from '@/lib/workspaces'
import { Card } from '@/components/ui/primitives'
import { ErrorNotice } from '@/components/ErrorNotice'
import { JourneyTrack } from '@/components/JourneyTrack'
import { hadInterviews } from '@/lib/journey'
import { celebrate } from '@/components/ui/flair'
import { ApplicationHeader } from './header'
import { SentApplication } from './record'

/**
 * The application once it has been sent, on one page. Nothing here edits the
 * resume: it shows where it stands, and the job and documents as they were
 * sent. The tools used to prepare stay one link away, on the pre-application
 * page.
 */
export function PostApplicationView({ app, record, analysis, initialWorkspace }: {
  app: Application
  record: ApplicationRecord
  analysis: JdAnalysis | null
  initialWorkspace: ApplicationWorkspace
}) {
  const router = useRouter()
  const [workspace, setWorkspace] = useState(initialWorkspace)
  const [status, setStatus] = useState(app.row?.status ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const base = `/api/applications/${encodeURIComponent(app.key)}`

  // Older links carry the tab, message or view they opened; this page has none.
  useEffect(() => {
    const url = new URL(window.location.href)
    for (const name of ['tab', 'step', 'view']) url.searchParams.delete(name)
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, '', url)
  }, [])

  /** The preparation tools live on the pre-application page; this opens them there. */
  function openPreparation() {
    router.push(`/applications/${encodeURIComponent(app.key)}?view=prepare&step=fit`)
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


  return <div className="space-y-4">
    <ApplicationHeader app={app} status={status} interviewed={hadInterviews(workspace.journey)} busy={busy} postingUrl={record.posting.url} appliedAt={workspace.appliedAt} onStatus={(next, origin, note) => void patchStatus(next, origin, note)} progress={<JourneyTrack
      appKey={app.key}
      status={status}
      sentAt={workspace.appliedAt ?? app.row?.date ?? null}
      withdrawn={/Withdrew on \d{4}-\d{2}-\d{2}/.test(app.row?.notes ?? '')}
      busy={busy}
      onMove={(next, origin, note) => void patchStatus(next, origin, note)}
      onJourney={(journey) => setWorkspace((current) => ({ ...current, journey }))}
      onStatus={(next) => { setStatus(next); router.refresh() }}
    />} />
    {error ? <Card className="overflow-hidden border-[var(--color-bad-soft)]"><ErrorNotice error={error} onDismiss={() => setError(null)} /></Card> : null}

    <SentApplication
      app={app}
      record={record}
      workspace={workspace}
      analysis={analysis}
      sentAt={workspace.appliedAt ?? app.row?.date ?? null}
      onPreparation={() => openPreparation()}
    />
  </div>
}
