/**
 * The bridge the desktop app (desktop/preload.cjs) puts on window. It is absent
 * when Onward runs in a browser, so every caller must handle null.
 */
export type UpdateStatus =
  | 'unsupported'
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'manual'
  | 'error'

export interface UpdateState {
  status: UpdateStatus
  /** The newer version, once one is found. */
  version: string | null
  progress: number | null
  error: string | null
  checkedAt: number | null
}

export interface DesktopInfo {
  version: string
  commit: string | null
  platform: string
  arch: string
  packaged: boolean
  workspace: string | null
  autoUpdate: boolean
  update: UpdateState
}

export interface DesktopBridge {
  info(): Promise<DesktopInfo>
  checkForUpdates(): Promise<UpdateState>
  downloadUpdate(): Promise<UpdateState>
  installUpdate(): Promise<void>
  openDownload(): Promise<void>
  openReleaseNotes(): Promise<void>
  setAutoUpdate(enabled: boolean): Promise<boolean>
  changeWorkspace(): Promise<string | null>
  openWorkspace(): Promise<string>
  onUpdateState(listener: (state: UpdateState) => void): () => void
}

export function desktopBridge(): DesktopBridge | null {
  if (typeof window === 'undefined') return null
  return (window as Window & { onwardDesktop?: DesktopBridge }).onwardDesktop ?? null
}
