'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  BookOpen, CalendarDays, Check, ChevronLeft, ChevronRight, CircleHelp, Copy, Layers, Lightbulb, Mic, Pause, Play,
  RefreshCw, RotateCcw, ShieldAlert, Sparkles, Trash2, Wand2,
} from 'lucide-react'
import {
  CATEGORY_LABELS, PREP_CHECKLIST, QUESTION_CATEGORIES, ROUND_KINDS, nextRound, prepProgress,
  type AnswerFeedback, type InterviewPatch, type InterviewRound, type InterviewState, type QuestionCategory, type Rating,
} from '@/lib/interviewPrep'
import type { ProfileFitReport } from '@/lib/profileFit'
import { Badge, Card, Spinner } from '@/components/ui/primitives'
import { ProgressRing, SegmentedNav, celebrate } from '@/components/ui/flair'
import { ErrorNotice } from '@/components/ErrorNotice'
import { cn } from '@/lib/utils'

type View = 'practice' | 'questions' | 'stories' | 'gaps' | 'pitch' | 'ask' | 'rounds'

const button = 'inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-muted)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)] disabled:opacity-40'
const primary = 'inline-flex items-center justify-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3.5 py-2 text-xs font-semibold text-[var(--color-bg)] transition-opacity hover:opacity-90 disabled:opacity-40'
const input = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--color-accent)] disabled:opacity-60'

const RATING_META: Record<Rating, { label: string; key: string; tone: 'bad' | 'warn' | 'ok'; className: string }> = {
  again: { label: 'Need work', key: '1', tone: 'bad', className: 'hover:border-[var(--color-bad)] hover:text-[var(--color-bad)]' },
  shaky: { label: 'Shaky', key: '2', tone: 'warn', className: 'hover:border-[var(--color-warn)] hover:text-[var(--color-warn)]' },
  solid: { label: 'Nailed it', key: '3', tone: 'ok', className: 'hover:border-[var(--color-ok)] hover:text-[var(--color-ok)]' },
}

const GENERATING_STEPS = [
  'Reading the posting the way the hiring manager will…',
  'Going through the resume you sent…',
  'Picking the questions they are most likely to ask…',
  'Matching each question to your real projects…',
  'Finding the stories that answer the most questions…',
  'Writing honest answers for the weak spots…',
  'Drafting your 60-second pitch…',
]

/**
 * A pack being written survives switching tabs: the request lives here, not in
 * the component, so coming back to the prep tab picks the same run up again.
 */
const inflight = new Map<string, Promise<InterviewState>>()

/** Today's date as YYYY-MM-DD in the browser's timezone. */
function today(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export function InterviewPrep({ appKey, initial, report, status, onChange }: {
  appKey: string
  initial: InterviewState
  report: ProfileFitReport | null
  status: string
  /** Keeps the page's copy current, so the overview shows the same progress. */
  onChange?: (state: InterviewState) => void
}) {
  const [state, setState] = useState(initial)
  const reported = useRef(initial)
  useEffect(() => {
    if (reported.current === state) return
    reported.current = state
    onChange?.(state)
  }, [onChange, state])
  const [view, setView] = useState<View>('practice')
  const [generating, setGenerating] = useState(() => inflight.has(appKey))
  const [error, setError] = useState<string | null>(null)
  const base = `/api/applications/${encodeURIComponent(appKey)}/interview`
  const progress = prepProgress(state)
  const upcoming = nextRound(state.rounds, today())

  const save = useCallback(async (patch: InterviewPatch) => {
    // Optimistic: the page reflects the change at once, the server confirms it.
    setState((current) => ({
      ...current,
      ratings: patch.ratings ? Object.fromEntries(Object.entries({ ...current.ratings, ...patch.ratings }).filter(([, value]) => value !== null)) as Record<string, Rating> : current.ratings,
      answers: patch.answers ? { ...current.answers, ...patch.answers } : current.answers,
      checklist: patch.checklist ? { ...current.checklist, ...patch.checklist } : current.checklist,
      rounds: patch.rounds ?? current.rounds,
    }))
    try {
      const response = await fetch(base, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'could not save your progress')
      setState(data.interview)
    } catch (reason) { setError((reason as Error).message) }
  }, [base])

  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const follow = useCallback(async (run: Promise<InterviewState>) => {
    setGenerating(true); setError(null)
    try {
      const next = await run
      setState(next); setView('practice')
      celebrate()
    } catch (reason) { setError((reason as Error).message) } finally { setGenerating(false) }
  }, [])

  useEffect(() => {
    const run = inflight.get(appKey)
    if (run) void follow(run)
  }, [appKey, follow])

  function generate() {
    if (state.pack && !window.confirm('Write a new prep pack? Your ratings, answers, checklist and rounds are kept, but ratings only carry over for questions that come back.')) return
    const run = (async () => {
      const response = await fetch(base, { method: 'POST' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'could not write the prep pack')
      // The page's copy updates even if this tab was left in the meantime.
      onChangeRef.current?.(data.interview)
      return data.interview as InterviewState
    })().finally(() => inflight.delete(appKey))
    inflight.set(appKey, run)
    void follow(run)
  }

  if (generating) return <GeneratingCard />
  if (!state.pack) return <div className="space-y-4">
    {error ? <Card className="overflow-hidden border-[var(--color-bad-soft)]"><ErrorNotice error={error} onDismiss={() => setError(null)} /></Card> : null}
    <EmptyPrep status={status} onGenerate={generate} />
    <QuickStart report={report} />
    <RoundsPanel rounds={state.rounds} onSave={(rounds) => void save({ rounds })} />
  </div>

  const pack = state.pack
  const views: { value: View; label: string; icon: ReactNode; badge?: ReactNode }[] = [
    { value: 'practice', label: 'Practice', icon: <Layers size={14} /> },
    { value: 'questions', label: 'Questions', icon: <CircleHelp size={14} />, badge: <span className="text-[10px] text-[var(--color-faint)] tnum">{pack.questions.length}</span> },
    { value: 'stories', label: 'Stories', icon: <BookOpen size={14} />, badge: <span className="text-[10px] text-[var(--color-faint)] tnum">{pack.stories.length}</span> },
    { value: 'gaps', label: 'Weak spots', icon: <ShieldAlert size={14} />, badge: pack.gaps.length ? <span className="text-[10px] text-[var(--color-faint)] tnum">{pack.gaps.length}</span> : undefined },
    { value: 'pitch', label: 'Pitch', icon: <Mic size={14} /> },
    { value: 'ask', label: 'Ask them', icon: <Lightbulb size={14} /> },
    { value: 'rounds', label: 'Rounds', icon: <CalendarDays size={14} />, badge: state.rounds.length ? <span className="text-[10px] text-[var(--color-faint)] tnum">{state.rounds.length}</span> : undefined },
  ]

  return <div className="space-y-4">
    {error ? <Card className="overflow-hidden border-[var(--color-bad-soft)]"><ErrorNotice error={error} onDismiss={() => setError(null)} /></Card> : null}
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <Card className="hero-wash anim-rise flex h-full flex-col justify-between gap-5 p-5">
        <div className="flex flex-wrap items-center gap-5">
        <ProgressRing value={progress.percent} size={84} stroke={8} tone={progress.percent >= 80 ? 'ok' : 'accent'}>
          <span><span className="block text-lg font-semibold tnum">{progress.percent}%</span><span className="block text-[10px] text-[var(--color-faint)]">ready</span></span>
        </ProgressRing>
        <div className="min-w-48 flex-1">
          <p className="text-base font-semibold">{progress.percent >= 80 ? 'You’re in good shape.' : progress.practiced === 0 ? 'Your prep pack is ready.' : 'Keep going, it adds up.'}</p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--color-muted)]">{progress.solid} of {progress.total} questions nailed · {progress.practiced - progress.solid} to polish · checklist {progress.checklist}/{progress.checklistTotal}</p>
          {upcoming ? <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-[var(--color-warn-soft)] px-2 py-1 text-xs font-medium text-[var(--color-warn)]"><CalendarDays size={13} aria-hidden="true" /> {roundCountdown(upcoming)}</p> : null}
        </div>
        <button type="button" onClick={generate} className={button} title="Write a new prep pack from the posting and your resume"><RefreshCw size={13} aria-hidden="true" /> Regenerate</button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {([
            ['Nailed', progress.solid, 'var(--color-ok)'],
            ['To polish', progress.practiced - progress.solid, 'var(--color-warn)'],
            ['Not practiced', progress.total - progress.practiced, 'var(--color-faint)'],
          ] as const).map(([label, count, color], index) => <button key={label} type="button" onClick={() => setView('practice')} className="anim-rise rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]/70 px-3 py-2.5 text-left transition-colors hover:border-[var(--color-border-strong)]" style={{ ['--delay' as string]: `${80 + index * 60}ms` }}>
            <span className="flex items-center gap-1.5 text-[11px] text-[var(--color-muted)]"><span className="size-2 rounded-full" style={{ background: color }} />{label}</span>
            <span className="mt-0.5 block text-lg font-semibold tnum">{count}</span>
            <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-[var(--color-surface-2)]"><span className="block h-full rounded-full transition-all duration-700" style={{ width: `${progress.total ? (count / progress.total) * 100 : 0}%`, background: color }} /></span>
          </button>)}
        </div>
      </Card>
      <Checklist checklist={state.checklist} onToggle={(id, value) => void save({ checklist: { [id]: value } })} />
    </div>

    <SegmentedNav label="Interview prep sections" items={views} value={view} onChange={setView} />

    <div key={view} className="anim-rise">
      {view === 'practice' ? <Practice appKey={appKey} state={state} onReset={() => { if (window.confirm('Clear every practice rating and start the deck over? Your written answers are kept.')) void save({ ratings: Object.fromEntries(Object.keys(state.ratings).map((id) => [id, null])) }) }} onRate={(id, rating) => void save({ ratings: { [id]: rating } })} onAnswer={(id, answer) => void save({ answers: { [id]: answer } })} />
        : view === 'questions' ? <QuestionList state={state} />
          : view === 'stories' ? <Stories pack={pack} />
            : view === 'gaps' ? <Gaps pack={pack} />
              : view === 'pitch' ? <Pitch pitch={pack.pitch} />
                : view === 'ask' ? <AskThem pack={pack} />
                  : <RoundsPanel rounds={state.rounds} onSave={(rounds) => void save({ rounds })} />}
    </div>
    {state.packAt ? <p className="text-[11px] text-[var(--color-faint)]" suppressHydrationWarning>Prep pack written {new Date(state.packAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} from the posting and the resume you sent.</p> : null}
  </div>
}

function roundCountdown(round: InterviewRound): string {
  const until = Math.round((Date.parse(`${round.date.slice(0, 10)}T00:00:00`) - Date.parse(`${today()}T00:00:00`)) / 86_400_000)
  return `${round.kind} ${until === 0 ? 'today' : until === 1 ? 'tomorrow' : `in ${until} days`}${round.date.length > 10 ? ` at ${round.date.slice(11, 16)}` : ''}`
}

function GeneratingCard() {
  const [step, setStep] = useState(0)
  useEffect(() => {
    const timer = window.setInterval(() => setStep((current) => Math.min(current + 1, GENERATING_STEPS.length - 1)), 9000)
    return () => window.clearInterval(timer)
  }, [])
  return <Card className="hero-wash anim-fade overflow-hidden p-8">
    <div className="mx-auto flex max-w-lg flex-col items-center gap-4 text-center">
      <span className="anim-pulse grid size-14 place-items-center rounded-2xl bg-[var(--color-accent-soft)] text-[var(--color-accent)]"><Wand2 size={24} aria-hidden="true" /></span>
      <h2 className="text-lg font-semibold">Writing your prep pack</h2>
      <p key={step} className="anim-rise min-h-5 text-sm text-[var(--color-muted)]">{GENERATING_STEPS[step]}</p>
      <div className="w-full space-y-2 pt-2">{[88, 72, 80, 60].map((width, index) => <div key={index} className="shimmer h-3 rounded" style={{ width: `${width}%` }} />)}</div>
      <p className="text-[11px] text-[var(--color-faint)]">Usually one to three minutes. You can leave this tab open and come back.</p>
    </div>
  </Card>
}

function EmptyPrep({ status, onGenerate }: { status: string; onGenerate: () => void }) {
  return <Card className="hero-wash anim-rise overflow-hidden">
    <div className="grid gap-6 p-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-accent-soft)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-accent)]"><Sparkles size={12} aria-hidden="true" /> Interview prep</span>
        <h2 className="mt-3 text-xl font-semibold tracking-tight">{status === 'Interview' ? 'Let’s get you ready for the interview.' : 'Get ahead before they call.'}</h2>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-[var(--color-muted)]">One click turns the posting and the exact resume you sent into a prep pack: the questions they are most likely to ask with talking points from your real projects, your best stories in STAR form, honest answers for the weak spots, a 60-second pitch, and sharp questions to ask them. Then practice with flashcards and get feedback on your answers.</p>
        <ul className="mt-4 grid gap-2 text-xs text-[var(--color-muted)] sm:grid-cols-2">
          {['Likely questions, ranked', 'STAR stories from your resume', 'Honest answers for gaps', 'Flashcards with AI feedback'].map((item, index) => <li key={item} className="anim-rise flex items-center gap-2" style={{ ['--delay' as string]: `${120 + index * 70}ms` }}><span className="grid size-4 place-items-center rounded-full bg-[var(--color-ok-soft)] text-[var(--color-ok)]"><Check size={10} strokeWidth={3} /></span>{item}</li>)}
        </ul>
      </div>
      <button type="button" onClick={onGenerate} className={cn(primary, 'px-5 py-3 text-sm')}><Wand2 size={16} aria-hidden="true" /> Build my prep pack</button>
    </div>
  </Card>
}

/** Before the AI pack exists, the fit analysis already says what to lead with and where they will probe. */
function QuickStart({ report }: { report: ProfileFitReport | null }) {
  if (!report) return null
  const strengths = report.requirements.filter((row) => row.weight === 'must' && row.classification === 'direct').sort((a, b) => a.rank - b.rank).slice(0, 5)
  const gaps = report.requirements.filter((row) => row.weight === 'must' && row.classification !== 'direct').sort((a, b) => a.rank - b.rank).slice(0, 5)
  if (!strengths.length && !gaps.length) return null
  return <div className="grid gap-4 md:grid-cols-2">
    <Card className="anim-rise p-5" >
      <h3 className="flex items-center gap-2 text-sm font-semibold"><span className="grid size-6 place-items-center rounded-md bg-[var(--color-ok-soft)] text-[var(--color-ok)]"><Check size={13} /></span> Lead with these</h3>
      <p className="mt-1 text-xs text-[var(--color-muted)]">Required skills you can back with direct evidence, from your fit analysis.</p>
      <ul className="mt-3 space-y-3">{strengths.map((row) => <li key={row.rank} className="text-sm"><p className="font-medium leading-snug">{row.requirement}</p>{row.evidence[0] ? <p className="mt-0.5 text-xs leading-relaxed text-[var(--color-muted)]">{row.evidence[0]}</p> : null}</li>)}</ul>
    </Card>
    <Card className="anim-rise p-5" >
      <h3 className="flex items-center gap-2 text-sm font-semibold"><span className="grid size-6 place-items-center rounded-md bg-[var(--color-warn-soft)] text-[var(--color-warn)]"><ShieldAlert size={13} /></span> Expect them to probe</h3>
      <p className="mt-1 text-xs text-[var(--color-muted)]">Required skills with partial or no evidence. Have an honest answer ready.</p>
      <ul className="mt-3 space-y-3">{gaps.map((row) => <li key={row.rank} className="flex items-start gap-2 text-sm"><Badge tone={row.classification === 'gap' ? 'bad' : 'warn'}>{row.classification === 'gap' ? 'Gap' : 'Partial'}</Badge><span className="leading-snug">{row.requirement}</span></li>)}</ul>
    </Card>
  </div>
}

function Checklist({ checklist, onToggle }: { checklist: Record<string, boolean>; onToggle: (id: string, value: boolean) => void }) {
  const done = PREP_CHECKLIST.filter((item) => checklist[item.id]).length
  return <Card className="anim-rise p-4" >
    <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Before the interview</h3><span className="text-[11px] text-[var(--color-faint)] tnum">{done}/{PREP_CHECKLIST.length}</span></div>
    <ul className="mt-2 space-y-0.5">
      {PREP_CHECKLIST.map((item) => {
        const checked = !!checklist[item.id]
        return <li key={item.id}><label className="group flex cursor-pointer items-start gap-2.5 rounded-md px-1.5 py-1 text-xs hover:bg-[var(--color-surface-2)]">
          <input type="checkbox" checked={checked} onChange={(event) => { onToggle(item.id, event.target.checked); if (event.target.checked && done + 1 === PREP_CHECKLIST.length) celebrate() }} className="sr-only" />
          <span className={cn('mt-px grid size-4 shrink-0 place-items-center rounded border transition-colors', checked ? 'anim-pop border-transparent bg-[var(--color-ok)] text-white' : 'border-[var(--color-border-strong)] group-hover:border-[var(--color-accent)]')}>{checked ? <Check size={11} strokeWidth={3} /> : null}</span>
          <span className={cn('leading-snug transition-colors', checked ? 'text-[var(--color-faint)] line-through' : 'text-[var(--color-muted)]')}>{item.label}</span>
        </label></li>
      })}
    </ul>
  </Card>
}

type Deck = 'all' | 'unrated' | 'needs-work' | QuestionCategory

function Practice({ appKey, state, onReset, onRate, onAnswer }: { appKey: string; state: InterviewState; onReset: () => void; onRate: (id: string, rating: Rating) => void; onAnswer: (id: string, answer: string) => void }) {
  const pack = state.pack!
  const [deck, setDeck] = useState<Deck>('all')
  const cards = useMemo(() => pack.questions.filter((question) =>
    deck === 'all' ? true
      : deck === 'unrated' ? !state.ratings[question.id]
        : deck === 'needs-work' ? state.ratings[question.id] && state.ratings[question.id] !== 'solid'
          : question.category === deck), [deck, pack.questions, state.ratings])
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [direction, setDirection] = useState<'next' | 'prev'>('next')
  const [writing, setWriting] = useState(false)
  const card = cards[Math.min(index, Math.max(0, cards.length - 1))]
  const deckRef = useRef(deck)

  useEffect(() => {
    if (deckRef.current !== deck) { deckRef.current = deck; setIndex(0); setFlipped(false) }
  }, [deck])

  const go = useCallback((step: number) => {
    if (!cards.length) return
    setDirection(step > 0 ? 'next' : 'prev')
    setFlipped(false)
    setIndex((current) => (current + step + cards.length) % cards.length)
  }, [cards.length])

  const rate = useCallback((rating: Rating, event?: { clientX: number; clientY: number }) => {
    if (!card) return
    onRate(card.id, rating)
    if (rating === 'solid' && event) celebrate({ x: event.clientX, y: event.clientY })
    // The "unrated" and "needs work" decks shrink as you rate, so stay on the same index there.
    if (deck === 'unrated' || (deck === 'needs-work' && rating === 'solid')) { setDirection('next'); setFlipped(false) } else go(1)
  }, [card, deck, go, onRate])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement
      if (writing || target.closest('input, textarea, select, [contenteditable]')) return
      if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); setFlipped((value) => !value) }
      else if (event.key === 'ArrowRight') go(1)
      else if (event.key === 'ArrowLeft') go(-1)
      else if (flipped && event.key === '1') rate('again')
      else if (flipped && event.key === '2') rate('shaky')
      else if (flipped && event.key === '3') rate('solid')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [flipped, go, rate, writing])

  const decks: { value: Deck; label: string; count: number }[] = [
    { value: 'all', label: 'All', count: pack.questions.length },
    { value: 'unrated', label: 'Not practiced', count: pack.questions.filter((question) => !state.ratings[question.id]).length },
    { value: 'needs-work', label: 'Needs work', count: pack.questions.filter((question) => state.ratings[question.id] && state.ratings[question.id] !== 'solid').length },
    ...QUESTION_CATEGORIES.map((category) => ({ value: category, label: CATEGORY_LABELS[category], count: pack.questions.filter((question) => question.category === category).length })).filter((entry) => entry.count),
  ]

  return <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
    <div className="min-w-0 space-y-3">
      <div className="flex flex-wrap gap-1.5">{decks.map((entry) => <button key={entry.value} type="button" onClick={() => setDeck(entry.value)} className={cn('rounded-full border px-2.5 py-1 text-[11px] transition-colors', deck === entry.value ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] font-medium text-[var(--color-accent)]' : 'border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]')}>{entry.label} <span className="tnum opacity-70">{entry.count}</span></button>)}</div>

      {!card ? <Card className="anim-pop p-10 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-[var(--color-ok-soft)] text-[var(--color-ok)]"><Check size={22} /></span>
        <p className="mt-3 text-base font-semibold">{deck === 'needs-work' ? 'Nothing left to polish.' : deck === 'unrated' ? 'You’ve been through every question.' : 'No questions here.'}</p>
        <p className="mt-1 text-xs text-[var(--color-muted)]">Pick another deck above, or run through them all once more.</p>
        <button type="button" onClick={() => setDeck('all')} className={cn(button, 'mt-4')}><RotateCcw size={13} /> Practice all</button>
      </Card> : <>
        <div key={`${card.id}-${direction}`} className={cn('flashcard', direction === 'next' ? 'anim-next' : 'anim-prev')}>
          <div className="flashcard-inner" data-flipped={flipped ? '' : undefined}>
            <button type="button" onClick={() => setFlipped(true)} aria-hidden={flipped} tabIndex={flipped ? -1 : 0} className="flashcard-face hero-wash flex min-h-72 flex-col rounded-2xl border border-[var(--color-border)] p-6 text-left">
              <span className="flex items-center justify-between gap-2"><CategoryChip category={card.category} /><span className="text-[11px] text-[var(--color-faint)] tnum">{Math.min(index, cards.length - 1) + 1} / {cards.length}</span></span>
              <span className="my-auto block py-6 text-xl font-semibold leading-snug tracking-tight">{card.question}</span>
              <span className="flex items-center justify-between gap-2 text-[11px] text-[var(--color-faint)]"><span>{state.ratings[card.id] ? <Badge tone={RATING_META[state.ratings[card.id]].tone}>{RATING_META[state.ratings[card.id]].label}</Badge> : 'Answer out loud, then flip'}</span><span>Click or <kbd>Space</kbd> to flip</span></span>
            </button>
            <div aria-hidden={!flipped} className="flashcard-face flashcard-back flex min-h-72 flex-col rounded-2xl border border-[var(--color-accent)] bg-[var(--color-surface)] p-6">
              <span className="flex items-center justify-between gap-2"><CategoryChip category={card.category} /><button type="button" tabIndex={flipped ? 0 : -1} onClick={() => setFlipped(false)} className="text-[11px] text-[var(--color-faint)] hover:text-[var(--color-text)]">Flip back</button></span>
              <p className="mt-3 text-sm font-semibold leading-snug">{card.question}</p>
              <p className="mt-1 text-xs italic leading-relaxed text-[var(--color-faint)]">Why they ask: {card.why}</p>
              <ul className="mt-4 space-y-2">{card.answer.map((point, i) => <li key={i} className={cn('flex gap-2 text-sm leading-relaxed text-[var(--color-muted)]', flipped && 'anim-rise')} style={{ ['--delay' as string]: `${200 + i * 80}ms` }}><span className="mt-2 size-1.5 shrink-0 rounded-full bg-[var(--color-accent)]" aria-hidden="true" />{point}</li>)}</ul>
              <div className="mt-auto flex flex-wrap items-center gap-2 pt-5">
                <span className="mr-auto text-[11px] text-[var(--color-faint)]">How did it go?</span>
                {(Object.keys(RATING_META) as Rating[]).map((rating) => <button key={rating} type="button" tabIndex={flipped ? 0 : -1} onClick={(event) => rate(rating, event)} className={cn(button, RATING_META[rating].className, state.ratings[card.id] === rating && 'border-current')}>{RATING_META[rating].label} <kbd>{RATING_META[rating].key}</kbd></button>)}
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => go(-1)} className={button}><ChevronLeft size={14} /> Previous</button>
          <span className="hidden text-[11px] text-[var(--color-faint)] sm:block"><kbd>←</kbd> <kbd>→</kbd> to move · <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> to rate</span>
          <button type="button" onClick={() => go(1)} className={button}>Next <ChevronRight size={14} /></button>
        </div>
        <AnswerCoach key={card.id} appKey={appKey} questionId={card.id} saved={state.answers[card.id] ?? ''} onFocusChange={setWriting} onSaved={(answer) => onAnswer(card.id, answer)} onVerdict={(rating) => onRate(card.id, rating)} />
      </>}
    </div>
    <DeckOverview state={state} onReset={onReset} currentId={card?.id ?? null} onPick={(id) => { const at = cards.findIndex((question) => question.id === id); if (at >= 0) { setDirection(at >= index ? 'next' : 'prev'); setIndex(at); setFlipped(false) } else { setDeck('all'); setIndex(pack.questions.findIndex((question) => question.id === id)) } }} />
  </div>
}

function DeckOverview({ state, currentId, onPick, onReset }: { state: InterviewState; currentId: string | null; onPick: (id: string) => void; onReset: () => void }) {
  const pack = state.pack!
  return <Card className="h-fit p-4">
    <div className="flex items-center justify-between"><h3 className="text-xs font-semibold">Your deck</h3>{Object.keys(state.ratings).length ? <button type="button" onClick={onReset} className="inline-flex items-center gap-1 text-[10px] text-[var(--color-faint)] hover:text-[var(--color-text)]"><RotateCcw size={10} /> Start over</button> : null}</div>
    <p className="mt-0.5 text-[11px] text-[var(--color-faint)]">Each square is a question. Click one to jump to it.</p>
    <div className="mt-3 grid grid-cols-6 gap-1.5">
      {pack.questions.map((question, index) => {
        const rating = state.ratings[question.id]
        return <button key={question.id} type="button" title={question.question} onClick={() => onPick(question.id)} className={cn('anim-pop aspect-square rounded-md border text-[10px] tnum transition-transform hover:scale-110', rating === 'solid' ? 'border-transparent bg-[var(--color-ok)] text-white' : rating === 'shaky' ? 'border-transparent bg-[var(--color-warn)] text-[var(--color-bg)]' : rating === 'again' ? 'border-transparent bg-[var(--color-bad)] text-white' : 'border-[var(--color-border)] text-[var(--color-faint)]', currentId === question.id && 'ring-2 ring-[var(--color-accent)] ring-offset-2 ring-offset-[var(--color-surface)]')} style={{ ['--delay' as string]: `${index * 18}ms` }}>{index + 1}</button>
      })}
    </div>
    <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-[var(--color-faint)]">
      <li className="flex items-center gap-1"><span className="size-2 rounded-sm bg-[var(--color-ok)]" />Nailed</li>
      <li className="flex items-center gap-1"><span className="size-2 rounded-sm bg-[var(--color-warn)]" />Shaky</li>
      <li className="flex items-center gap-1"><span className="size-2 rounded-sm bg-[var(--color-bad)]" />Need work</li>
      <li className="flex items-center gap-1"><span className="size-2 rounded-sm border border-[var(--color-border)]" />New</li>
    </ul>
  </Card>
}

function AnswerCoach({ appKey, questionId, saved, onFocusChange, onSaved, onVerdict }: { appKey: string; questionId: string; saved: string; onFocusChange: (focused: boolean) => void; onSaved: (answer: string) => void; onVerdict: (rating: Rating) => void }) {
  const [open, setOpen] = useState(!!saved)
  const [answer, setAnswer] = useState(saved)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<AnswerFeedback | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function review() {
    setBusy(true); setError(null); setFeedback(null)
    try {
      const response = await fetch(`/api/applications/${encodeURIComponent(appKey)}/interview/feedback`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ questionId, answer }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'could not review the answer')
      setFeedback(data.feedback); onVerdict(data.feedback.verdict)
    } catch (reason) { setError((reason as Error).message) } finally { setBusy(false) }
  }

  if (!open) return <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center gap-3 rounded-xl border border-dashed border-[var(--color-border-strong)] px-4 py-3 text-left text-xs text-[var(--color-muted)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-text)]">
    <Sparkles size={15} className="text-[var(--color-accent)]" aria-hidden="true" /> Write your answer and get feedback from an interviewer’s point of view
  </button>
  return <Card className="anim-rise space-y-3 p-4">
    <div className="flex items-center justify-between"><h3 className="flex items-center gap-2 text-xs font-semibold"><Sparkles size={13} className="text-[var(--color-accent)]" /> Practice answer</h3>{answer !== saved ? <span className="text-[10px] text-[var(--color-faint)]">Saved when you leave the box</span> : saved ? <span className="text-[10px] text-[var(--color-ok)]">Saved</span> : null}</div>
    <textarea value={answer} onChange={(event) => setAnswer(event.target.value)} onFocus={() => onFocusChange(true)} onBlur={() => { onFocusChange(false); if (answer !== saved) onSaved(answer) }} rows={5} maxLength={5000} disabled={busy} className={cn(input, 'text-[13px] leading-relaxed')} placeholder="Answer the way you would say it. Rough is fine." />
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => void review()} disabled={busy || !answer.trim()} className={primary}>{busy ? <><Spinner /> Reviewing…</> : <><Wand2 size={13} /> Get feedback</>}</button>
      <span className="text-[11px] text-[var(--color-faint)]">{answer.trim().split(/\s+/).filter(Boolean).length} words · aim for 80 to 150 spoken</span>
    </div>
    {error ? <p className="text-xs text-[var(--color-bad)]">{error}</p> : null}
    {feedback ? <div className="anim-rise space-y-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
      <Badge tone={RATING_META[feedback.verdict].tone}>{feedback.verdict === 'solid' ? 'Ready to say as is' : feedback.verdict === 'shaky' ? 'Getting there' : 'Rework this one'}</Badge>
      {feedback.strengths.length ? <div><p className="text-[11px] font-semibold text-[var(--color-ok)]">What works</p><ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-[var(--color-muted)]">{feedback.strengths.map((item, i) => <li key={i}>{item}</li>)}</ul></div> : null}
      {feedback.improve.length ? <div><p className="text-[11px] font-semibold text-[var(--color-warn)]">Make it better</p><ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-[var(--color-muted)]">{feedback.improve.map((item, i) => <li key={i}>{item}</li>)}</ul></div> : null}
      {feedback.stronger ? <div><div className="flex items-center justify-between"><p className="text-[11px] font-semibold">A tighter version</p><button type="button" onClick={() => setAnswer(feedback.stronger)} className="text-[11px] text-[var(--color-accent)] hover:underline">Use as my answer</button></div><p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--color-muted)]">{feedback.stronger}</p></div> : null}
    </div> : null}
  </Card>
}

function CategoryChip({ category }: { category: QuestionCategory }) {
  const tone = category === 'gap' ? 'warn' : category === 'technical' ? 'accent' : 'neutral'
  return <Badge tone={tone}>{CATEGORY_LABELS[category]}</Badge>
}

function QuestionList({ state }: { state: InterviewState }) {
  const pack = state.pack!
  return <div className="space-y-4">{QUESTION_CATEGORIES.map((category) => {
    const questions = pack.questions.filter((question) => question.category === category)
    if (!questions.length) return null
    return <Card key={category} className="overflow-hidden">
      <h3 className="border-b border-[var(--color-border)] px-5 py-3 text-sm font-semibold">{CATEGORY_LABELS[category]} <span className="text-[var(--color-faint)] tnum">{questions.length}</span></h3>
      <ul className="divide-y divide-[var(--color-border)]">{questions.map((question) => {
        const rating = state.ratings[question.id]
        return <li key={question.id}><details className="group">
          <summary className="flex cursor-pointer list-none items-start gap-3 px-5 py-3 hover:bg-[var(--color-surface-2)]">
            <ChevronRight size={14} className="mt-1 shrink-0 text-[var(--color-faint)] transition-transform group-open:rotate-90" aria-hidden="true" />
            <span className="flex-1 text-sm leading-snug">{question.question}</span>
            {rating ? <Badge tone={RATING_META[rating].tone}>{RATING_META[rating].label}</Badge> : null}
          </summary>
          <div className="anim-fade space-y-2 px-12 pb-4">
            <p className="text-xs italic text-[var(--color-faint)]">Why they ask: {question.why}</p>
            <ul className="list-disc space-y-1 pl-4 text-sm leading-relaxed text-[var(--color-muted)]">{question.answer.map((point, i) => <li key={i}>{point}</li>)}</ul>
            {state.answers[question.id] ? <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3"><p className="text-[11px] font-semibold">Your practice answer</p><p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-[var(--color-muted)]">{state.answers[question.id]}</p></div> : null}
          </div>
        </details></li>
      })}</ul>
    </Card>
  })}</div>
}

function Stories({ pack }: { pack: NonNullable<InterviewState['pack']> }) {
  if (!pack.stories.length) return <Card className="p-8 text-center text-sm text-[var(--color-muted)]">No stories in this pack. Regenerate it to get some.</Card>
  return <div className="grid gap-4 md:grid-cols-2">{pack.stories.map((story, index) => <Card key={index} className="lift anim-rise flex flex-col p-5" >
    <div className="flex items-start gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--color-accent-soft)] text-sm font-semibold text-[var(--color-accent)] tnum">{index + 1}</span><h3 className="text-sm font-semibold leading-snug">{story.title}</h3></div>
    <dl className="mt-4 space-y-3 text-[13px] leading-relaxed">
      {([['Situation', story.situation], ['What you did', story.action], ['Result', story.result]] as const).map(([label, value]) => <div key={label} className="border-l-2 border-[var(--color-border)] pl-3"><dt className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-faint)]">{label}</dt><dd className="mt-0.5 text-[var(--color-muted)]">{value}</dd></div>)}
    </dl>
    {story.useFor.length ? <div className="mt-auto flex flex-wrap gap-1.5 pt-4">{story.useFor.map((use) => <Badge key={use}>{use}</Badge>)}</div> : null}
  </Card>)}</div>
}

function Gaps({ pack }: { pack: NonNullable<InterviewState['pack']> }) {
  return <div className="space-y-4">
    {pack.gaps.length ? <div className="grid gap-4 md:grid-cols-2">{pack.gaps.map((gap, index) => <Card key={index} className="anim-rise p-5" >
      <h3 className="flex items-start gap-2 text-sm font-semibold leading-snug"><ShieldAlert size={15} className="mt-0.5 shrink-0 text-[var(--color-warn)]" aria-hidden="true" />{gap.topic}</h3>
      <p className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-faint)]">An honest answer</p>
      <p className="mt-1 text-[13px] leading-relaxed text-[var(--color-muted)]">{gap.answer}</p>
      <p className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-faint)]">Brush up before</p>
      <p className="mt-1 text-[13px] leading-relaxed text-[var(--color-muted)]">{gap.prepare}</p>
    </Card>)}</div> : <Card className="p-8 text-center text-sm text-[var(--color-muted)]">No weak spots found for this role.</Card>}
    {pack.refresh.length ? <Card className="p-5">
      <h3 className="text-sm font-semibold">Topics to revise</h3>
      <p className="mt-0.5 text-xs text-[var(--color-muted)]">Most important first.</p>
      <ol className="mt-3 flex flex-wrap gap-2">{pack.refresh.map((topic, index) => <li key={topic} className="anim-pop inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1 text-xs" style={{ ['--delay' as string]: `${index * 40}ms` }}><span className="text-[10px] text-[var(--color-faint)] tnum">{index + 1}</span>{topic}</li>)}</ol>
    </Card> : null}
  </div>
}

function Pitch({ pitch }: { pitch: string }) {
  const [running, setRunning] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const started = useRef<number | null>(null)
  useEffect(() => {
    if (!running) return
    started.current = Date.now() - elapsed * 1000
    const timer = window.setInterval(() => setElapsed((Date.now() - (started.current ?? Date.now())) / 1000), 100)
    return () => window.clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running])
  const words = pitch.split(/\s+/).filter(Boolean).length
  const zone = elapsed < 45 ? 'Keep going' : elapsed <= 95 ? 'Right length' : 'Too long, tighten it'
  const tone = elapsed < 45 ? 'var(--color-faint)' : elapsed <= 95 ? 'var(--color-ok)' : 'var(--color-bad)'

  return <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
    <Card className="hero-wash p-6">
      <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">“Tell me about yourself”</h3><button type="button" onClick={() => void navigator.clipboard.writeText(pitch)} className={button}><Copy size={13} /> Copy</button></div>
      <p className="mt-4 whitespace-pre-wrap text-[15px] leading-8">{pitch}</p>
      <p className="mt-4 text-[11px] text-[var(--color-faint)]">{words} words · about {Math.round(words / 2.4)} seconds at a relaxed pace. Make it yours: say it in your own words, not word for word.</p>
    </Card>
    <Card className="flex flex-col items-center gap-4 p-6 text-center">
      <h3 className="text-sm font-semibold">Time yourself</h3>
      <ProgressRing value={Math.min(100, (elapsed / 90) * 100)} size={128} stroke={10} tone={elapsed > 95 ? 'warn' : elapsed >= 45 ? 'ok' : 'accent'}>
        <span><span className="block text-2xl font-semibold tnum">{Math.floor(elapsed / 60)}:{String(Math.floor(elapsed % 60)).padStart(2, '0')}</span><span className="block text-[10px]" style={{ color: tone }}>{elapsed ? zone : 'Aim for 60 to 90s'}</span></span>
      </ProgressRing>
      <div className="flex gap-2">
        <button type="button" onClick={() => setRunning((value) => !value)} className={primary}>{running ? <><Pause size={14} /> Stop</> : <><Play size={14} /> {elapsed ? 'Resume' : 'Start'}</>}</button>
        <button type="button" onClick={() => { setRunning(false); setElapsed(0) }} disabled={!elapsed} className={button}><RotateCcw size={13} /> Reset</button>
      </div>
      <p className="text-[11px] leading-relaxed text-[var(--color-faint)]">Say it out loud, start the timer, and stop when you finish.</p>
    </Card>
  </div>
}

function AskThem({ pack }: { pack: NonNullable<InterviewState['pack']> }) {
  return <Card className="overflow-hidden">
    <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-3"><div><h3 className="text-sm font-semibold">Questions to ask them</h3><p className="text-xs text-[var(--color-muted)]">Pick two or three. Asking good ones is part of the interview.</p></div><button type="button" onClick={() => void navigator.clipboard.writeText(pack.askThem.map((question) => `- ${question}`).join('\n'))} className={button}><Copy size={13} /> Copy all</button></div>
    <ol className="divide-y divide-[var(--color-border)]">{pack.askThem.map((question, index) => <li key={index} className="anim-rise flex gap-3 px-5 py-3 text-sm leading-relaxed" style={{ ['--delay' as string]: `${index * 50}ms` }}><span className="text-xs text-[var(--color-faint)] tnum">{index + 1}</span>{question}</li>)}</ol>
  </Card>
}

function RoundsPanel({ rounds, onSave }: { rounds: InterviewRound[]; onSave: (rounds: InterviewRound[]) => void }) {
  const [draft, setDraft] = useState<{ date: string; time: string; kind: string; with: string; notes: string }>({ date: today(), time: '', kind: ROUND_KINDS[0], with: '', notes: '' })
  const [adding, setAdding] = useState(false)
  const now = today()
  return <Card className="overflow-hidden">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border)] px-5 py-3">
      <div><h3 className="text-sm font-semibold">Interview rounds</h3><p className="text-xs text-[var(--color-muted)]">Log each conversation: when, with whom, and what came up.</p></div>
      {!adding ? <button type="button" onClick={() => setAdding(true)} className={primary}><CalendarDays size={13} /> Add a round</button> : null}
    </div>
    {adding ? <form className="anim-rise grid gap-3 border-b border-[var(--color-border)] bg-[var(--color-bg)] p-5 sm:grid-cols-4" onSubmit={(event) => {
      event.preventDefault()
      onSave([...rounds, { id: `r-${Date.now().toString(36)}`, date: draft.time ? `${draft.date}T${draft.time}` : draft.date, kind: draft.kind, with: draft.with.trim(), notes: draft.notes.trim() }])
      setAdding(false); setDraft({ date: today(), time: '', kind: ROUND_KINDS[0], with: '', notes: '' })
    }}>
      <label className="space-y-1 text-xs"><span className="text-[var(--color-muted)]">Date</span><input required type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} className={input} /></label>
      <label className="space-y-1 text-xs"><span className="text-[var(--color-muted)]">Time <span className="text-[var(--color-faint)]">(optional)</span></span><input type="time" value={draft.time} onChange={(event) => setDraft({ ...draft, time: event.target.value })} className={input} /></label>
      <label className="space-y-1 text-xs"><span className="text-[var(--color-muted)]">Type</span><select value={draft.kind} onChange={(event) => setDraft({ ...draft, kind: event.target.value })} className={input}>{ROUND_KINDS.map((kind) => <option key={kind}>{kind}</option>)}</select></label>
      <label className="space-y-1 text-xs"><span className="text-[var(--color-muted)]">With</span><input value={draft.with} onChange={(event) => setDraft({ ...draft, with: event.target.value })} placeholder="Name, role" className={input} /></label>
      <label className="space-y-1 text-xs sm:col-span-4"><span className="text-[var(--color-muted)]">Notes</span><textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} rows={3} placeholder="What they asked, what went well, what to follow up on…" className={input} /></label>
      <div className="flex gap-2 sm:col-span-4"><button className={primary}>Save round</button><button type="button" onClick={() => setAdding(false)} className={button}>Cancel</button></div>
    </form> : null}
    {rounds.length ? <ol className="relative space-y-1 p-5">
      <span className="absolute bottom-8 left-[2.05rem] top-8 w-px bg-[var(--color-border)]" aria-hidden="true" />
      {rounds.map((round) => {
        const upcoming = round.date.slice(0, 10) >= now
        return <li key={round.id} className="anim-rise relative flex gap-4 rounded-lg p-2 hover:bg-[var(--color-surface-2)]">
          <span className={cn('relative z-10 mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border-2 border-[var(--color-surface)]', upcoming ? 'anim-pulse bg-[var(--color-warn)] text-[var(--color-bg)]' : 'bg-[var(--color-ok)] text-white')}>{upcoming ? <CalendarDays size={12} /> : <Check size={12} strokeWidth={3} />}</span>
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 text-sm font-medium">{round.kind}{round.with ? <span className="font-normal text-[var(--color-muted)]">with {round.with}</span> : null}{upcoming ? <Badge tone="warn">{roundCountdown(round).replace(`${round.kind} `, '')}</Badge> : null}</p>
            <p className="text-[11px] text-[var(--color-faint)]">{new Date(`${round.date.slice(0, 10)}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}{round.date.length > 10 ? ` · ${round.date.slice(11, 16)}` : ''}</p>
            {round.notes ? <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-[var(--color-muted)]">{round.notes}</p> : null}
          </div>
          <button type="button" onClick={() => { if (window.confirm(`Remove the ${round.kind} round?`)) onSave(rounds.filter((entry) => entry.id !== round.id)) }} aria-label={`Remove the ${round.kind} round`} className="self-start rounded p-1 text-[var(--color-faint)] hover:text-[var(--color-bad)]"><Trash2 size={13} /></button>
        </li>
      })}
    </ol> : !adding ? <p className="px-5 py-6 text-center text-xs text-[var(--color-faint)]">No rounds yet. When they schedule one, add it here and you’ll see a countdown.</p> : null}
  </Card>
}
