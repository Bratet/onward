import { redirect } from 'next/navigation'
import { CANDIDATE } from '@/lib/candidate'
import { hasResumes } from '@/lib/paths'
import { WelcomeFlow } from './flow'

export const dynamic = 'force-dynamic'

/** A new user's first step in the app: their own resume becomes their master and general resumes. */
export default function WelcomePage() {
  if (hasResumes()) redirect('/profile')
  return <WelcomeFlow firstName={CANDIDATE.fullName.trim().split(/\s+/)[0] ?? ''} />
}
