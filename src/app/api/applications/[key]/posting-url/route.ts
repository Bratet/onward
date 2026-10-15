import { NextResponse } from 'next/server'
import { setPostingUrl } from '@/lib/postingLink'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PUT(req: Request, { params }: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await params
    const body = await req.json().catch(() => ({})) as { url?: unknown }
    return NextResponse.json({ url: await setPostingUrl(key, body.url) })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 })
  }
}
