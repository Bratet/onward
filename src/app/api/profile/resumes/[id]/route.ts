import { NextResponse } from 'next/server'
import { deleteProfile, ResumeProfileError, updateProfile } from '@/lib/resumeProfiles'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

function crossOrigin(request: Request): NextResponse | null {
  const origin = request.headers.get('origin')
  return origin && origin !== new URL(request.url).origin
    ? NextResponse.json({ error: 'Cross-origin writes are not allowed.' }, { status: 403 })
    : null
}

function failure(error: unknown, action: string): NextResponse {
  if (error instanceof ResumeProfileError) return NextResponse.json({ error: error.message }, { status: error.status })
  console.error(`Could not ${action} a resume profile`, error)
  return NextResponse.json({ error: `Could not ${action} the profile. Try again.` }, { status: 500 })
}

/** Rename a profile or change the role types it is picked for. Its files stay where they are. */
export async function PATCH(request: Request, { params }: Params) {
  const blocked = crossOrigin(request)
  if (blocked) return blocked
  const { id } = await params
  const body = await request.json().catch(() => null) as { name?: unknown; archetypes?: unknown } | null
  try {
    return NextResponse.json({ profile: await updateProfile(id, { name: body?.name, archetypes: body?.archetypes ?? [] }) })
  } catch (error) {
    return failure(error, 'update')
  }
}

/** Remove a profile; its folders move to the workspace trash. */
export async function DELETE(request: Request, { params }: Params) {
  const blocked = crossOrigin(request)
  if (blocked) return blocked
  const { id } = await params
  try {
    return NextResponse.json(await deleteProfile(id))
  } catch (error) {
    return failure(error, 'delete')
  }
}
