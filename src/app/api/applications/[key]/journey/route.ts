import { NextResponse } from 'next/server'
import { z } from 'zod'
import { operationSchema } from '@/lib/journey'
import { applyJourneyUpdate, readJourney, undoJourneyUpdate } from '@/lib/journeyStore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('apply'), operations: z.array(operationSchema).min(1).max(20), summary: z.string().max(400).optional(), source: z.string().max(20000).optional() }),
  z.object({ action: z.literal('undo'), entryId: z.string().min(1).max(40) }),
])

export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await params
    return NextResponse.json({ journey: await readJourney(key) })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 })
  }
}

/** Apply the candidate's changes, or undo the latest update. */
export async function POST(req: Request, { params }: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await params
    const body = bodySchema.parse(await req.json())
    if (body.action === 'apply') return NextResponse.json(await applyJourneyUpdate(key, body))
    return NextResponse.json(await undoJourneyUpdate(key, body.entryId))
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 })
  }
}
