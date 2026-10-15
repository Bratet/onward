import { NextResponse } from 'next/server'
import { fetchPosting, JobFetchError } from '@/lib/jobFetch'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Read a job posting from its link, so the new-application form can analyze it without a paste. */
export async function POST(req: Request) {
  const { url } = (await req.json().catch(() => ({}))) as { url?: unknown }
  if (typeof url !== 'string' || !url.trim()) return NextResponse.json({ error: 'Add the posting link first.' }, { status: 400 })
  try {
    return NextResponse.json(await fetchPosting(url, req.signal))
  } catch (error) {
    if (error instanceof JobFetchError) return NextResponse.json({ error: error.message }, { status: 422 })
    throw error
  }
}
