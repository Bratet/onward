import Link from 'next/link'
import { CalendarDays, Mail, MessageCircle, Sparkles } from 'lucide-react'
import type { Application } from '@/lib/applications'
import { daysSinceApplied, followUpDue } from '@/lib/followUp'
import { Card, CardHeader } from '@/components/ui/primitives'
import { CompanyAvatar } from '@/components/ui/flair'
import { fmtDate } from '@/lib/utils'

interface Item { key: string; href: string; company: string; title: string; hint: string; icon: React.ReactNode; tone: string }

/**
 * What the applications already sent need from you today: interviews coming
 * up, replies to answer, and follow-ups that are due. Hidden when nothing is.
 */
export function UpNext({ apps }: { apps: Application[] }) {
  const items: Item[] = []
  const company = (app: Application) => app.row?.company ?? app.folder?.slug ?? 'Application'
  const href = (app: Application, query: string) => `/applications/${encodeURIComponent(app.key)}?${query}`

  for (const app of apps.filter((entry) => entry.workspace?.nextRound).sort((a, b) => a.workspace!.nextRound!.localeCompare(b.workspace!.nextRound!))) {
    items.push({ key: `round-${app.key}`, href: href(app, 'tab=prep'), company: company(app), title: `Interview ${fmtDate(app.workspace!.nextRound!.slice(0, 10))}`, hint: app.workspace?.prep !== null && app.workspace?.prep !== undefined ? `${app.workspace.prep}% prepared · practice now` : 'Build your prep pack', icon: <CalendarDays size={14} />, tone: 'var(--color-warn)' })
  }
  for (const app of apps.filter((entry) => (entry.row?.status === 'Responded' || entry.row?.status === 'Interview') && !entry.workspace?.nextRound)) {
    items.push({ key: `reply-${app.key}`, href: href(app, 'tab=home'), company: company(app), title: app.row?.status === 'Interview' ? 'Interviewing' : 'They replied', hint: app.workspace?.prep !== null && app.workspace?.prep !== undefined ? `Prep ${app.workspace.prep}% · add the next round` : 'Get ready with interview prep', icon: app.row?.status === 'Interview' ? <Sparkles size={14} /> : <MessageCircle size={14} />, tone: 'var(--color-ok)' })
  }
  const due = apps.filter((app) => followUpDue(app)).sort((a, b) => (daysSinceApplied(b) ?? 0) - (daysSinceApplied(a) ?? 0))
  for (const app of due.slice(0, 4)) {
    items.push({ key: `follow-${app.key}`, href: href(app, 'tab=next&step=email'), company: company(app), title: 'Follow up', hint: `Applied ${daysSinceApplied(app)} days ago, no reply`, icon: <Mail size={14} />, tone: 'var(--color-accent)' })
  }
  if (!items.length) return null

  return <Card className="anim-rise overflow-hidden">
    <CardHeader title="Up next" hint="What your sent applications need from you" action={due.length > 4 ? <Link href="/applications" className="text-xs text-[var(--color-accent)] hover:underline">{due.length - 4} more follow-ups →</Link> : null} />
    <ul className="-mb-px -mr-px grid sm:grid-cols-2 xl:grid-cols-3">
      {items.slice(0, 9).map((item, index) => <li key={item.key} className="anim-rise border-b border-r border-[var(--color-border)]" style={{ ['--delay' as string]: `${index * 50}ms` }}>
        <Link href={item.href} className="group flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-[var(--color-surface-2)]">
          <CompanyAvatar name={item.company} size={34} />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: item.tone }}>{item.icon}{item.title}</span>
            <span className="block truncate text-sm font-medium">{item.company}</span>
            <span className="block truncate text-[11px] text-[var(--color-muted)]">{item.hint}</span>
          </span>
          <span className="text-[var(--color-faint)] transition-transform group-hover:translate-x-0.5" aria-hidden="true">→</span>
        </Link>
      </li>)}
    </ul>
  </Card>
}
