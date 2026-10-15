import { NextResponse } from 'next/server'
import { reviewPracticeAnswer } from '@/lib/interviewStore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(req: Request, { params }: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await params
    const body = await req.json().catch(() => ({})) as { questionId?: unknown; answer?: unknown }
    if (typeof body.questionId !== 'string' || typeof body.answer !== 'string') throw new Error('questionId and answer are required')
    return NextResponse.json({ feedback: await reviewPracticeAnswer(key, body.questionId, body.answer, req.signal) })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 })
  }
}
