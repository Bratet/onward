import { NextResponse } from 'next/server'
import { createProfile, readProfiles, ResumeProfileError } from '@/lib/resumeProfiles'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** The resume profiles, in the order the Profile page shows them. */
export async function GET() {
  return NextResponse.json({ profiles: await readProfiles() })
}

/** Create a profile as a copy of the all-round resume or another profile. */
export async function POST(request: Request) {
  const origin = request.headers.get('origin')
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: 'Cross-origin writes are not allowed.' }, { status: 403 })
  }
  const body = await request.json().catch(() => null) as { name?: unknown; archetypes?: unknown; from?: unknown } | null
  try {
    const profile = await createProfile({ name: body?.name, archetypes: body?.archetypes ?? [], from: body?.from ?? 'general' })
    return NextResponse.json({ profile }, { status: 201 })
  } catch (error) {
    if (error instanceof ResumeProfileError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Could not create a resume profile', error)
    return NextResponse.json({ error: 'Could not create the profile. Try again.' }, { status: 500 })
  }
}
