import { randomUUID } from 'crypto'
import { getApplication } from './applications'
import {
  applyOperations, describeOperation, initialJourney, parseJourney, statusForStage, type Journey, type Operation, type TimelineEntry,
} from './journey'
import { readRows, updateRow } from './tracker'
import { readWorkspace, updateWorkspace, WorkspaceRevisionConflict, type ApplicationWorkspace } from './workspaces'

const MAX_MESSAGE = 20000

function journeyOf(workspace: ApplicationWorkspace, status: string | null): Journey {
  return parseJourney(workspace.journey) ?? initialJourney({ status, appliedAt: workspace.appliedAt })
}

async function load(key: string) {
  const app = await getApplication(key)
  if (!app) throw new Error('No such application')
  const workspace = await readWorkspace(key)
  return { app, workspace, journey: journeyOf(workspace, app.row?.status ?? null) }
}

export async function readJourney(key: string): Promise<Journey> {
  return (await load(key)).journey
}

const datedNote = (text: string) => `${new Date().toISOString().slice(0, 10)}: ${text}`

/** Apply the candidate's changes as one timeline entry that can be undone. */
export async function applyJourneyUpdate(key: string, input: { operations: Operation[]; summary?: string; source?: string }): Promise<{ journey: Journey; status: string | null }> {
  if (!input.operations.length) throw new Error('Nothing selected to apply')
  for (let attempt = 0; ; attempt++) {
    const { app, workspace, journey } = await load(key)
    const { journey: changed, notes } = applyOperations(journey, input.operations)
    const row = app.row
    const stageChanged = input.operations.some((operation) => operation.op === 'set_stage')
    const status = row ? (stageChanged ? statusForStage(changed.stage, changed.outcome, row.status) : row.status) : null
    const { timeline: _, ...snapshot } = journey
    const entry: TimelineEntry = {
      id: randomUUID().slice(0, 8),
      at: new Date().toISOString(),
      summary: input.summary?.trim() || input.operations.map((operation) => describeOperation(operation, journey)).join('; ').slice(0, 400),
      source: (input.source ?? '').slice(0, MAX_MESSAGE),
      operations: input.operations,
      before: { journey: snapshot, status: row?.status ?? null, notes: row?.notes ?? null },
      undoneAt: null,
    }
    try {
      await updateWorkspace(key, workspace.revision, (latest) => ({ ...latest, journey: { ...changed, timeline: [entry, ...journey.timeline].slice(0, 200) } }))
    } catch (error) {
      if (error instanceof WorkspaceRevisionConflict && attempt < 3) continue
      throw error
    }
    if (row && (status !== row.status || notes.length)) {
      const extra = notes.map(datedNote).join(' ')
      await updateRow(row.id, { status: status ?? row.status, ...(extra ? { notes: row.notes ? `${row.notes} ${extra}` : extra } : {}) })
    }
    return { journey: { ...changed, timeline: [entry, ...journey.timeline] }, status }
  }
}

/** Undo the most recent update that is still in effect. Older ones undo in order, newest first. */
export async function undoJourneyUpdate(key: string, entryId: string): Promise<{ journey: Journey; status: string | null }> {
  for (let attempt = 0; ; attempt++) {
    const { app, workspace, journey } = await load(key)
    if (journey.timeline.find((entry) => entry.id === entryId)?.undoneAt) throw new Error('That update is already undone')
    const latest = journey.timeline.find((entry) => !entry.undoneAt)
    if (!latest || latest.id !== entryId) throw new Error('Only the most recent update can be undone; undo the newer ones first')
    const restored = parseJourney({ ...(latest.before?.journey as object), timeline: [] })
    if (!restored) throw new Error('This update has no saved state to return to')
    const timeline = journey.timeline.map((entry) => entry.id === entryId ? { ...entry, undoneAt: new Date().toISOString() } : entry)
    try {
      await updateWorkspace(key, workspace.revision, (current) => ({ ...current, journey: { ...restored, timeline } }))
    } catch (error) {
      if (error instanceof WorkspaceRevisionConflict && attempt < 3) continue
      throw error
    }
    const row = app.row
    let status = row?.status ?? null
    if (row && latest.before) {
      // Notes go back only when the update appended to them and they still start
      // with the old text; otherwise the candidate edited them since, and theirs win.
      const fresh = (await readRows()).find((entry) => entry.id === row.id) ?? row
      const before = latest.before
      status = before.status ?? fresh.status
      const addedNotes = latest.operations.some((operation) => operation.op === 'add_note')
      const restoreNotes = addedNotes && before.notes !== null && fresh.notes.startsWith(before.notes)
      if (status !== fresh.status || restoreNotes) await updateRow(row.id, { status, ...(restoreNotes ? { notes: before.notes! } : {}) })
    }
    return { journey: { ...restored, timeline }, status }
  }
}
