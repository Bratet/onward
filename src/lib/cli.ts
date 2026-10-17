import { randomUUID } from 'crypto'
import { computeStats, listApplications, type Application } from './applications'
import { localIso, periodActivity } from './activity'
import { deleteApplication } from './deleteApplication'
import { findExistingApplications, isBlocking } from './duplicates'
import { GOAL_MAX, clearGoal, goalProgress, parseGoal, readGoal, writeGoal } from './goal'
import { savedSearchSchema } from './savedSearchSchema'
import { savedSearchStore } from './savedSearches'
import { STATUSES, addRow, readRows, updateRow, type TrackerRow } from './tracker'
import { readWorkspace, updateWorkspace } from './workspaces'

/**
 * The command-line front end to the same lib code the web app uses, so a
 * change made from a terminal or a chat gets the app's validation and atomic
 * writes. Every command prints plain text, or JSON with --json.
 *
 * Imports stay relative: tests chdir into a scratch repo before importing.
 */

export interface CliIo {
  out: (line: string) => void
  err: (line: string) => void
  now?: Date
}

class UsageError extends Error {}

interface Args {
  positional: string[]
  flags: Record<string, string | true>
}

/** `--key value`, `--key=value` and bare `--flag`; everything else is positional. */
export function parseArgs(argv: string[]): Args {
  const positional: string[] = []
  const flags: Record<string, string | true> = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith('--')) {
      positional.push(arg)
      continue
    }
    const eq = arg.indexOf('=')
    if (eq !== -1) {
      flags[arg.slice(2, eq)] = arg.slice(eq + 1)
    } else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
      flags[arg.slice(2)] = argv[++i]
    } else {
      flags[arg.slice(2)] = true
    }
  }
  return { positional, flags }
}

const HELP = `onward CLI

Applications
  apps list [--status S] [--since YYYY-MM-DD] [--search TEXT] [--limit N]
  apps show <id|folder>
  apps add --company C --role R [--status S] [--date YYYY-MM-DD] [--notes N] [--score X] [--force]
  apps update <id|folder> [--status S] [--notes N] [--append-note N] [--score X]
  apps delete <id|folder> --yes

Progress
  stats
  goal
  goal set <amount> <day|week|month>
  goal clear

Saved searches
  searches list
  searches add --title T --url U [--track T] [--notes N]
  searches update <id|title> [--title T] [--url U] [--track T] [--notes N]
  searches remove <id|title>

Add --json to any read command for machine-readable output.
Statuses: ${STATUSES.join(', ')}`

export async function runCli(argv: string[], io: CliIo): Promise<number> {
  const args = parseArgs(argv)
  const [group, action, ...rest] = args.positional
  try {
    switch (group) {
      case undefined:
      case 'help':
        io.out(HELP)
        return 0
      case 'apps':
        await apps(action, rest, args.flags, io)
        return 0
      case 'stats':
        await stats(args.flags, io)
        return 0
      case 'goal':
        await goal(action, rest, args.flags, io)
        return 0
      case 'searches':
        await searches(action, rest, args.flags, io)
        return 0
      default:
        throw new UsageError(`unknown command '${group}'`)
    }
  } catch (error) {
    io.err(`error: ${(error as Error).message}`)
    if (error instanceof UsageError) io.err("run 'help' for usage")
    return 1
  }
}

function text(flags: Args['flags'], name: string): string | undefined {
  const value = flags[name]
  if (value === undefined) return undefined
  if (value === true) throw new UsageError(`--${name} needs a value`)
  return value
}

function required(flags: Args['flags'], name: string): string {
  const value = text(flags, name)?.trim()
  if (!value) throw new UsageError(`--${name} is required`)
  return value
}

/** Tracker cells are one physical line; a '|' or newline would break the table. */
function cell(value: string, name: string): string {
  const trimmed = value.trim()
  if (/[\r\n|]/.test(trimmed)) throw new UsageError(`--${name} must be a single line without '|'`)
  return trimmed
}

function status(value: string): string {
  const match = STATUSES.find((s) => s.toLowerCase() === value.trim().toLowerCase())
  if (!match) throw new UsageError(`'${value}' is not a status; use one of ${STATUSES.join(', ')}`)
  return match
}

function isoDate(value: string, name: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new UsageError(`--${name} must be a date as YYYY-MM-DD`)
  }
  return value
}

function json(io: CliIo, value: unknown) {
  io.out(JSON.stringify(value, null, 2))
}

/** An application by tracker # or by its folder key. */
async function findApp(ref: string | undefined): Promise<Application> {
  if (!ref) throw new UsageError('give an application # or folder name')
  const all = await listApplications()
  const app = /^\d+$/.test(ref)
    ? all.find((a) => a.row?.id === Number(ref))
    : all.find((a) => a.key === ref)
  if (!app) throw new Error(`no application '${ref}'`)
  return app
}

function rowLine(row: TrackerRow): string {
  return `#${row.id}  ${row.date}  ${row.status.padEnd(10)}  ${row.company} — ${row.role}`
}

async function apps(action: string | undefined, rest: string[], flags: Args['flags'], io: CliIo) {
  switch (action) {
    case 'list':
    case undefined: {
      let rows = await readRows()
      const wanted = text(flags, 'status')
      if (wanted) rows = rows.filter((r) => r.status === status(wanted))
      const since = text(flags, 'since')
      if (since) rows = rows.filter((r) => r.date >= isoDate(since, 'since'))
      const search = text(flags, 'search')?.toLowerCase()
      if (search) rows = rows.filter((r) => `${r.company} ${r.role} ${r.notes}`.toLowerCase().includes(search))
      const limit = text(flags, 'limit')
      if (limit) {
        if (!/^\d+$/.test(limit) || Number(limit) < 1) throw new UsageError('--limit must be a positive whole number')
        rows = rows.slice(0, Number(limit))
      }
      if (flags.json) return json(io, rows)
      if (!rows.length) return io.out('No applications match.')
      for (const row of rows) io.out(rowLine(row))
      io.out(`${rows.length} application${rows.length === 1 ? '' : 's'}`)
      return
    }
    case 'show': {
      const app = await findApp(rest[0])
      if (flags.json) return json(io, app)
      const row = app.row
      if (row) {
        io.out(`#${row.id} ${row.company} — ${row.role}`)
        io.out(`Date:    ${row.date}`)
        io.out(`Status:  ${row.status}`)
        io.out(`Score:   ${row.score}`)
        io.out(`PDF:     ${row.pdf}`)
        io.out(`Report:  ${row.report}`)
        io.out(`Notes:   ${row.notes}`)
      } else {
        io.out(`${app.key} (folder with no tracker row)`)
      }
      if (app.folder) {
        io.out(`Folder:  workspace/applications/${app.folder.folder}`)
        io.out(`Files:   ${app.folder.docs.map((d) => d.name).join(', ') || 'none'}`)
      }
      if (app.workspace) io.out(`Resume:  ${app.workspace.resume}${app.workspace.fit ? ` · fit ${app.workspace.fit}` : ''}`)
      return
    }
    case 'add': {
      const company = cell(required(flags, 'company'), 'company')
      const role = cell(required(flags, 'role'), 'role')
      if (!flags.force) {
        const duplicates = (await findExistingApplications({ company, role })).filter(isBlocking)
        if (duplicates.length) {
          const list = duplicates.map((d) => `${d.key} (${d.date}, ${d.status})`).join(', ')
          throw new Error(`this looks like an application you already have: ${list}. Add --force to add it anyway`)
        }
      }
      const row = await addRow({
        date: text(flags, 'date') ? isoDate(text(flags, 'date')!, 'date') : localIso(io.now ?? new Date()),
        company,
        role,
        score: cell(text(flags, 'score') ?? 'N/A', 'score') || 'N/A',
        status: status(text(flags, 'status') ?? 'Applied'),
        pdf: '❌',
        report: '—',
        notes: cell(text(flags, 'notes') ?? 'Added from the CLI.', 'notes'),
      })
      if (flags.json) return json(io, row)
      io.out(`Added ${rowLine(row)}`)
      return
    }
    case 'update': {
      const app = await findApp(rest[0])
      if (!app.row) throw new Error(`${app.key} has no tracker row to update`)
      const patch: Partial<Omit<TrackerRow, 'id'>> = {}
      const nextStatus = text(flags, 'status')
      if (nextStatus) patch.status = status(nextStatus)
      const notes = text(flags, 'notes')
      if (notes !== undefined) patch.notes = cell(notes, 'notes')
      const append = text(flags, 'append-note')
      if (append !== undefined) {
        const base = patch.notes ?? app.row.notes
        patch.notes = [base, cell(append, 'append-note')].filter(Boolean).join(' ')
      }
      const score = text(flags, 'score')
      if (score !== undefined) patch.score = cell(score, 'score') || 'N/A'
      if (!Object.keys(patch).length) throw new UsageError('nothing to update: give --status, --notes, --append-note or --score')
      const row = await updateRow(app.row.id, patch)
      // Same as the app: the first move to Applied stamps the workspace.
      if (patch.status === 'Applied' && app.folder) {
        const workspace = await readWorkspace(app.key)
        if (!workspace.appliedAt) {
          await updateWorkspace(app.key, workspace.revision, (current) => ({
            ...current, appliedAt: current.appliedAt ?? new Date().toISOString(),
          }))
        }
      }
      if (flags.json) return json(io, row)
      io.out(`Updated ${rowLine(row)}`)
      return
    }
    case 'delete': {
      const app = await findApp(rest[0])
      if (flags.yes !== true) throw new UsageError(`deleting ${app.key} needs --yes`)
      const result = await deleteApplication(app.key)
      if (flags.json) return json(io, result)
      io.out(`Deleted ${app.row ? rowLine(app.row) : app.key}`)
      if (result.trashedAs) io.out(`Its folder is kept in workspace/state/.trash/applications/${result.trashedAs}`)
      return
    }
    default:
      throw new UsageError(`unknown apps command '${action}'`)
  }
}

async function stats(flags: Args['flags'], io: CliIo) {
  const now = io.now ?? new Date()
  const [all, rows] = await Promise.all([computeStats(now), readRows()])
  const week = periodActivity(rows, 'week', now)
  const month = periodActivity(rows, 'month', now)
  if (flags.json) return json(io, { ...all, week, month })
  io.out(`Tracked:        ${all.total}`)
  io.out(`Sent:           ${all.sent}`)
  io.out(`Responded:      ${all.responded}${all.responseRate === null ? '' : ` (${Math.round(all.responseRate * 100)}%)`}`)
  io.out(`This week:      ${week.applied} sent (last week by this point: ${week.previousSoFar})`)
  io.out(`This month:     ${month.applied} sent (last month by this point: ${month.previousSoFar})`)
  io.out('By status:')
  for (const { status, count } of all.byStatus) io.out(`  ${status.padEnd(12)} ${count}`)
}

async function goal(action: string | undefined, rest: string[], flags: Args['flags'], io: CliIo) {
  if (action === 'set') {
    const next = parseGoal({ amount: Number(rest[0]), unit: rest[1] })
    if (!next) throw new UsageError(`use: goal set <1-${GOAL_MAX}> <day|week|month>`)
    await writeGoal(next)
    io.out(`Goal set: ${next.amount} per ${next.unit}`)
    return
  }
  if (action === 'clear') {
    await clearGoal()
    io.out('Goal cleared.')
    return
  }
  if (action !== undefined) throw new UsageError(`unknown goal command '${action}'`)
  const current = await readGoal()
  if (!current) {
    if (flags.json) return json(io, null)
    return io.out("No goal set. Use 'goal set <amount> <day|week|month>'.")
  }
  const progress = goalProgress(current, await readRows(), io.now ?? new Date())
  if (flags.json) return json(io, progress)
  io.out(`Goal: ${current.amount} per ${current.unit}`)
  const tracks = [['Today', progress.today], ['Week', progress.week], ['Month', progress.month]] as const
  for (const [label, track] of tracks) {
    if (!track) continue
    const need = track.perDayNeeded ? `, ${track.perDayNeeded}/day needed` : ''
    io.out(`${label.padEnd(6)} ${track.done}/${track.target} · ${track.status}${need}`)
  }
  io.out(`Streak: ${progress.streak.current} ${current.unit}(s), best ${progress.streak.best}`)
}

async function searches(action: string | undefined, rest: string[], flags: Args['flags'], io: CliIo) {
  const { searches: list, revision } = await savedSearchStore.read()
  const find = (ref: string | undefined) => {
    if (!ref) throw new UsageError('give a search id or title')
    const byId = list.find((s) => s.id === ref)
    if (byId) return byId
    const byTitle = list.filter((s) => s.title.toLowerCase() === ref.toLowerCase())
    if (byTitle.length > 1) throw new Error(`more than one search is titled '${ref}'; use its id`)
    if (!byTitle.length) throw new Error(`no saved search '${ref}'`)
    return byTitle[0]
  }
  const check = (value: unknown) => {
    const parsed = savedSearchSchema.safeParse(value)
    if (!parsed.success) throw new UsageError(parsed.error.issues[0].message)
    return parsed.data
  }

  switch (action) {
    case 'list':
    case undefined: {
      if (flags.json) return json(io, list)
      if (!list.length) return io.out('No saved searches.')
      for (const s of list) {
        io.out(`${s.title}${s.track ? `  [${s.track}]` : ''}`)
        io.out(`  ${s.url}`)
        if (s.notes) io.out(`  ${s.notes}`)
        io.out(`  id ${s.id}`)
      }
      return
    }
    case 'add': {
      const search = check({
        id: randomUUID(),
        title: required(flags, 'title'),
        url: required(flags, 'url'),
        track: text(flags, 'track') ?? '',
        notes: text(flags, 'notes') ?? '',
      })
      await savedSearchStore.save([...list, search], revision)
      io.out(`Added search '${search.title}'`)
      return
    }
    case 'update': {
      const current = find(rest[0])
      const next = check({
        ...current,
        ...(text(flags, 'title') !== undefined ? { title: text(flags, 'title') } : {}),
        ...(text(flags, 'url') !== undefined ? { url: text(flags, 'url') } : {}),
        ...(text(flags, 'track') !== undefined ? { track: text(flags, 'track') } : {}),
        ...(text(flags, 'notes') !== undefined ? { notes: text(flags, 'notes') } : {}),
      })
      await savedSearchStore.save(list.map((s) => (s.id === current.id ? next : s)), revision)
      io.out(`Updated search '${next.title}'`)
      return
    }
    case 'remove': {
      const current = find(rest[0])
      await savedSearchStore.save(list.filter((s) => s.id !== current.id), revision)
      io.out(`Removed search '${current.title}'`)
      return
    }
    default:
      throw new UsageError(`unknown searches command '${action}'`)
  }
}
