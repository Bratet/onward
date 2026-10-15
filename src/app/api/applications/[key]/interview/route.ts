import { NextResponse } from 'next/server'
import { interviewPatchSchema } from '@/lib/interviewPrep'
import { generateInterviewPack, patchInterview } from '@/lib/interviewStore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 900

/** Generate (or regenerate) the prep pack. Practice, checklist and rounds are kept. */
export async function POST(req: Request, { params }: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await params
    return NextResponse.json({ interview: await generateInterviewPack(key, req.signal) })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 })
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await params
    const patch = interviewPatchSchema.parse(await req.json())
    return NextResponse.json({ interview: await patchInterview(key, patch) })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 })
  }
}
