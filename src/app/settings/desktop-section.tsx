'use client'

import { useEffect, useState } from 'react'
import { Check, CircleAlert, Download, FolderOpen, RefreshCw, RotateCw } from 'lucide-react'
import { desktopBridge, type DesktopBridge, type DesktopInfo, type UpdateState } from '@/lib/desktop'

const BUTTON = 'inline-flex h-9 items-center gap-2 rounded-lg border border-[var(--color-border)] px-3 text-sm font-medium transition-colors hover:border-[var(--color-border-strong)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] disabled:opacity-50'
const PRIMARY = 'inline-flex h-9 items-center gap-2 rounded-lg bg-[var(--color-accent)] px-3 text-sm font-medium text-[var(--color-on-solid)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:opacity-50'

const PLATFORMS: Record<string, string> = { darwin: 'macOS', win32: 'Windows', linux: 'Linux' }

function checkedLabel(at: number | null): string {
  if (!at) return ''
  return ` Last checked ${new Date(at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}.`
}

function UpdateStatusLine({ update }: { update: UpdateState }) {
  switch (update.status) {
    case 'unsupported':
      return <>Updates only run in the installed app.</>
    case 'checking':
      return <>Checking for updates…</>
    case 'up-to-date':
      return <><Check aria-hidden="true" className="mr-1 inline size-4 text-[var(--color-ok)]" />You have the latest version.{checkedLabel(update.checkedAt)}</>
    case 'available':
      return <>Version {update.version} is available.</>
    case 'downloading':
      return <>Downloading version {update.version}… {update.progress ?? 0}%</>
    case 'ready':
      return <>Version {update.version} is downloaded. Restart Onward to finish updating.</>
    case 'manual':
      return <>Version {update.version} is available. This copy can&apos;t install it by itself, so download it and replace the app.</>
    case 'error':
      return <span className="text-[var(--color-bad)]"><CircleAlert aria-hidden="true" className="mr-1 inline size-4" />Couldn&apos;t check for updates: {update.error}</span>
    default:
      return <>Not checked yet.</>
  }
}

function UpdateAction({ bridge, update }: { bridge: DesktopBridge; update: UpdateState }) {
  if (update.status === 'available') {
    return <button type="button" className={PRIMARY} onClick={() => void bridge.downloadUpdate()}><Download aria-hidden="true" className="size-4" />Download {update.version}</button>
  }
  if (update.status === 'ready') {
    return <button type="button" className={PRIMARY} onClick={() => void bridge.installUpdate()}><RotateCw aria-hidden="true" className="size-4" />Restart to update</button>
  }
  if (update.status === 'manual') {
    return <button type="button" className={PRIMARY} onClick={() => void bridge.openDownload()}><Download aria-hidden="true" className="size-4" />Download {update.version}</button>
  }
  const busy = update.status === 'checking' || update.status === 'downloading'
  return (
    <button type="button" className={BUTTON} disabled={busy || update.status === 'unsupported'} onClick={() => void bridge.checkForUpdates()}>
      <RefreshCw aria-hidden="true" className={`size-4 ${busy ? 'animate-spin' : ''}`} />Check for updates
    </button>
  )
}

/** Version, updates and the workspace folder. Only the desktop app has them, so a browser shows nothing. */
export function DesktopSection() {
  const [bridge, setBridge] = useState<DesktopBridge | null>(null)
  const [info, setInfo] = useState<DesktopInfo | null>(null)

  useEffect(() => {
    const found = desktopBridge()
    if (!found) return
    setBridge(found)
    void found.info().then(setInfo)
    return found.onUpdateState((update) => setInfo((current) => (current ? { ...current, update } : current)))
  }, [])

  if (!bridge || !info) return null

  async function toggleAutoUpdate() {
    const autoUpdate = await bridge!.setAutoUpdate(!info!.autoUpdate)
    setInfo((current) => (current ? { ...current, autoUpdate } : current))
  }

  async function changeWorkspace() {
    const workspace = await bridge!.changeWorkspace()
    setInfo((current) => (current ? { ...current, workspace } : current))
  }

  const { update } = info
  return (
    <section id="app" aria-labelledby="app-heading" className="grid scroll-mt-24 gap-5 md:grid-cols-[220px_minmax(0,1fr)]">
      <div>
        <h2 id="app-heading" className="text-base font-semibold">App &amp; updates</h2>
        <p className="mt-1 text-sm leading-relaxed text-[var(--color-muted)]">New versions come from the main branch on GitHub.</p>
      </div>
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="flex flex-wrap items-start justify-between gap-4 p-5">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Onward {info.version}</p>
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              {PLATFORMS[info.platform] ?? info.platform} · {info.arch}
              {info.commit ? <> · built from <code className="font-mono">{info.commit.slice(0, 7)}</code></> : null}
              {info.packaged ? null : ' · running from source'}
            </p>
            <p role="status" aria-live="polite" className="mt-3 text-sm text-[var(--color-muted)]"><UpdateStatusLine update={update} /></p>
            {update.status === 'downloading' ? (
              <div className="mt-3 h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-[var(--color-surface-2)]" aria-hidden="true">
                <div className="h-full rounded-full bg-[var(--color-accent)] transition-[width]" style={{ width: `${update.progress ?? 0}%` }} />
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <UpdateAction bridge={bridge} update={update} />
            {info.packaged ? <button type="button" className={BUTTON} onClick={() => void bridge.openReleaseNotes()}>What&apos;s new</button> : null}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-[var(--color-border)] p-5">
          <div>
            <p id="auto-update-label" className="text-sm font-medium">Automatic updates</p>
            <p className="mt-1 max-w-md text-xs leading-relaxed text-[var(--color-muted)]">Check when Onward opens and every four hours, download new versions in the background, and install them when you quit.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={info.autoUpdate}
            aria-labelledby="auto-update-label"
            onClick={() => void toggleAutoUpdate()}
            className="relative h-6 w-11 shrink-0 rounded-full bg-[var(--color-border-strong)] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] aria-checked:bg-[var(--color-accent)]"
          >
            <span aria-hidden="true" className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-[var(--color-bg)] shadow transition-transform ${info.autoUpdate ? 'translate-x-5' : ''}`} />
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[var(--color-border)] p-5">
          <div className="min-w-0">
            <p className="text-sm font-medium">Workspace folder</p>
            <p className="mt-1 truncate font-mono text-xs text-[var(--color-muted)]" title={info.workspace ?? undefined}>{info.workspace ?? 'Not chosen'}</p>
          </div>
          <div className="flex gap-2">
            <button type="button" className={BUTTON} onClick={() => void bridge.openWorkspace()}><FolderOpen aria-hidden="true" className="size-4" />Open</button>
            <button type="button" className={BUTTON} onClick={() => void changeWorkspace()}>Change…</button>
          </div>
        </div>
      </div>
    </section>
  )
}
