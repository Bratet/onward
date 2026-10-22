import { NextResponse } from 'next/server'
import { runEditorAgent } from '@/lib/editorAgent'
import { applicationEditorContext } from '@/lib/applicationContext'
import type { Mode } from '@/lib/validate'
import { readWorkspace, workspaceInputs } from '@/lib/workspaces'
import { saveAnalysisChatChanges } from '@/lib/analysisChat'
import { parseProfileFit } from '@/lib/profileFit'
import { reconcileConfirmedSkills, rememberConfirmedSkills } from '@/lib/fitSkillSync'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 900

export async function POST(req: Request) {
  let body: {
    reviewOnly?: unknown
    conversation?: unknown
    yaml?: unknown
    mode?: unknown
    message?: unknown
    applicationKey?: unknown
    sessionId?: unknown
    stream?: unknown
  }
  try {
    body = await req.json()
    validate(body)
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 })
  }

  const encoder = new TextEncoder()
  const responseStream = new ReadableStream({
    async start(controller) {
      // The client may have stopped the run; writing to a closed stream would throw over the real outcome.
      const send = (event: Record<string, unknown>) => {
        try { controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`)) } catch { /* reader is gone */ }
      }
      try {
        const applicationKey = typeof body.applicationKey === 'string' && body.applicationKey
          ? body.applicationKey
          : null
        const context = applicationKey ? await applicationEditorContext(applicationKey) : null
        const analysisWorkspace = applicationKey && body.reviewOnly === true ? await readWorkspace(applicationKey) : null
        if (analysisWorkspace && analysisWorkspace.draftYaml !== body.yaml) {
          throw new Error('Wait for the application resume to finish saving, then retry the fit correction.')
        }
        const result = await runEditorAgent({
          sessionId: body.sessionId as string,
          yaml: body.yaml as string,
          mode: body.mode as Mode,
          message: (body.message as string).trim(),
          applicationContext: context,
          conversation: parseConversation(body.conversation),
          reviewOnly: body.reviewOnly === true,
          fitReport: analysisWorkspace?.fit.report ?? null,
          signal: req.signal,
          onEvent: (event) => {
            if (event.type === 'activity' || body.stream === true) send({ ...event })
          },
        })
        if (body.reviewOnly === true && result.changed && (!analysisWorkspace?.fit.report || result.fitReport === undefined)) {
          throw new Error('Wait for the first fit analysis to finish before updating the application resume.')
        }
        let fitReport = result.fitReport
        let nextYaml = result.yaml
        let confirmed: string[] = []
        if (applicationKey && analysisWorkspace && fitReport !== undefined) {
          const inputs = await workspaceInputs(applicationKey)
          if (!inputs.analysis) throw new Error('Wait for the first fit analysis to finish before correcting Skills.')
          const synced = reconcileConfirmedSkills(
            body.message as string, inputs.analysis.keywords,
            parseProfileFit(fitReport, inputs.analysis, `${inputs.masterYaml}\n${inputs.guidance}\n${nextYaml}`), nextYaml,
          )
          fitReport = synced.report
          nextYaml = synced.yaml
          confirmed = synced.confirmed
          await rememberConfirmedSkills(confirmed, synced.report.keywordMappings)
        }
        const saved = applicationKey && analysisWorkspace && fitReport !== undefined
          ? await saveAnalysisChatChanges(applicationKey, analysisWorkspace, fitReport, body.yaml as string, nextYaml)
          : { analysisUpdated: false, draftUpdated: false }
        const confirmation = [saved.analysisUpdated ? 'Fit analysis saved.' : '', saved.draftUpdated ? 'Application resume Skills saved for the Resume step.' : ''].filter(Boolean).join(' ')
        send({ type: 'done', ...result, yaml: nextYaml, changed: body.reviewOnly === true ? false : result.changed,
          ...saved, answer: result.answer + (confirmation ? `\n\n${confirmation}` : '') })
      } catch (error) {
        send({ type: 'error', message: (error as Error).message })
      } finally {
        try { controller.close() } catch { /* already closed or cancelled */ }
      }
    },
  })

  return new NextResponse(responseStream, {
    headers: {
      'content-type': 'application/x-ndjson',
      'cache-control': 'no-store, no-transform',
      'x-accel-buffering': 'no',
    },
  })
}

function validate(body: {
  yaml?: unknown
  mode?: unknown
  message?: unknown
  sessionId?: unknown
}) {
  if (typeof body.yaml !== 'string' || !body.yaml.trim()) throw new Error('yaml is required')
  if (body.yaml.length > 250_000) throw new Error('yaml is too large for editor chat')
  if (body.mode !== 'master' && body.mode !== 'tailored') throw new Error('invalid editor mode')
  if (typeof body.message !== 'string' || !body.message.trim()) throw new Error('message is required')
  if (body.message.length > 8_000) throw new Error('message must be 8,000 characters or fewer')
  if (typeof body.sessionId !== 'string') throw new Error('editor session is required')
}

function parseConversation(value: unknown): { role: 'user' | 'assistant'; content: string }[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > 100) throw new Error('invalid conversation')
  let size = 0
  return value.map((turn) => {
    if (!turn || (turn.role !== 'user' && turn.role !== 'assistant') || typeof turn.content !== 'string') throw new Error('invalid conversation turn')
    size += turn.content.length
    if (size > 500_000) throw new Error('conversation is too large')
    return { role: turn.role, content: turn.content }
  })
}
