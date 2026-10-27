'use client'

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { ChevronRight, ClipboardList, Copy, FileText, Linkedin, ListPlus, Mail, MessageSquareText, Plus, Trash2, X } from 'lucide-react'
import type { Application } from '@/lib/applications'
import type { CoverLetter } from '@/lib/coverLetter'
import type { PostingContact } from '@/lib/postingContact'
import type { FinalizedState } from '@/components/FinalizeStatus'
import type { OutreachDrafts } from '@/lib/outreach'
import { isAnswered, newFormAnswer, overLimit, splitQuestions, type AnswerTurn, type FormAnswer } from '@/lib/formAnswers'
import { ErrorNotice } from '@/components/ErrorNotice'
import { LearnFromChat } from '@/components/LearnFromChat'
import { AiBlocked, AiComposer, AiEmpty, AiPanelHeader, AiPrompts, AiReview, aiReply, aiUserBubble } from '@/components/AiPanel'
import { Spinner } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'
import { useFillHeight } from '@/components/useFillHeight'
import { CoverLetterTask } from './cover-letter-task'

export type DocumentKind = 'cover-letter' | 'answers' | 'email' | 'linkedin'
export const DOCUMENT_KINDS: readonly DocumentKind[] = ['cover-letter', 'answers', 'email', 'linkedin']

type Tone = 'ok' | 'warn' | 'neutral'
const TONE: Record<Tone, string> = {
  ok: 'bg-[var(--color-ok-soft)] text-[var(--color-ok)]',
  warn: 'bg-[var(--color-warn-soft)] text-[var(--color-warn)]',
  neutral: 'bg-[var(--color-surface-2)] text-[var(--color-muted)]',
}

const ring = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]'
const primaryButton = `inline-flex min-h-9 cursor-pointer items-center justify-center gap-2 rounded-lg bg-[var(--color-accent)] px-3.5 text-sm font-semibold text-[var(--color-on-solid)] shadow-[0_1px_2px_oklch(0_0_0/0.15)] transition-[filter] hover:brightness-110 ${ring} disabled:cursor-not-allowed disabled:bg-[var(--color-surface-2)] disabled:text-[var(--color-faint)] disabled:shadow-none`
const secondaryButton = `inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 text-xs font-medium transition-colors hover:bg-[var(--color-surface-2)] ${ring} disabled:cursor-not-allowed disabled:opacity-40`
const linkButton = `inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded text-xs font-medium text-[var(--color-accent)] underline-offset-4 hover:underline ${ring} disabled:cursor-not-allowed disabled:text-[var(--color-faint)] disabled:no-underline`
const field = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm leading-relaxed outline-none placeholder:text-[var(--color-muted)] focus:border-[var(--color-accent)] disabled:opacity-60'
const panelFrame = 'sheet flex min-h-0 flex-col overflow-hidden lg:sticky lg:top-20'
/** A chat fills the pane's fixed height; a short form only needs its own. */
const panel = `workspace-pane ${panelFrame}`

/**
 * Step 3: everything the application may need besides the resume. Each
 * document opens below the picker with its own AI on the right; all of
 * them are optional and none of them blocks sending.
 */
export function DocumentsStep(props: {
  app: Application
  active?: boolean
  contact: PostingContact
  resumeReady: boolean
  onGoToResume: () => void
  doc: DocumentKind
  onDoc: (doc: DocumentKind) => void
  initialLetter: CoverLetter
  storedLetter: CoverLetter | null
  letterFinalized: FinalizedState['letter']
  letterPdf: boolean
  onLetterSaved: (letter: CoverLetter) => void
  onLetterFinalized: (pdfName: string) => void
  drafts: OutreachDrafts
  savedDrafts: OutreachDrafts
  onDraft: (kind: 'email' | 'linkedin', text: string) => void
  onDraftSaved: (kind: 'email' | 'linkedin', text: string) => void
  answers: FormAnswer[]
  /** The answers come from an older application-answers.md and are not saved here yet. */
  answersImported: boolean
  onAnswers: (answers: FormAnswer[]) => void
}) {
  const { app, contact, doc, onDoc, letterPdf, initialLetter, drafts, savedDrafts, answers } = props
  const answered = answers.filter(isAnswered).length
  const status = (kind: DocumentKind): { label: string; tone: Tone } => {
    if (kind === 'cover-letter') return letterPdf ? { label: 'Final', tone: 'ok' } : initialLetter.content.trim() ? { label: 'Draft', tone: 'neutral' } : contact.coverLetter ? { label: 'Asked for', tone: 'warn' } : { label: 'Optional', tone: 'neutral' }
    if (kind === 'answers') return answers.length ? { label: `${answered} of ${answers.length} answered`, tone: answered === answers.length ? 'ok' : 'neutral' } : { label: 'Not started', tone: 'neutral' }
    const draft = drafts[kind] ?? ''
    return draft !== (savedDrafts[kind] ?? '') ? { label: 'Unsaved', tone: 'warn' } : draft ? { label: 'Draft saved', tone: 'ok' } : { label: 'Not started', tone: 'neutral' }
  }
  const items: { kind: DocumentKind; title: string; hint: string; icon: ReactNode }[] = [
    { kind: 'cover-letter', title: 'Cover letter', hint: contact.coverLetter ? 'The posting asks for one' : 'Only if they ask for one', icon: <FileText size={17} /> },
    { kind: 'answers', title: 'Form questions', hint: 'Questions on the application form', icon: <ClipboardList size={17} /> },
    { kind: 'email', title: 'Application email', hint: contact.email ? `To ${contact.name ?? contact.email}` : 'For applying by email', icon: <Mail size={17} /> },
    { kind: 'linkedin', title: 'LinkedIn message', hint: 'A note to the recruiter', icon: <Linkedin size={17} /> },
  ]

  // Arrow keys move between the documents, as in any tab list.
  const onPickerKey = (event: KeyboardEvent) => {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0
    if (!step) return
    event.preventDefault()
    const next = items[(items.findIndex((item) => item.kind === doc) + step + items.length) % items.length].kind
    onDoc(next)
    document.getElementById(`doc-tab-${next}`)?.focus()
  }

  return <div className="space-y-4">
    {/* Two by two on a phone, with only the name and its state, so the open document starts near the top. */}
    <div role="tablist" aria-label="Documents" onKeyDown={onPickerKey} className="grid grid-cols-2 gap-2 xl:grid-cols-4">
      {items.map((item) => {
        const selected = item.kind === doc
        const state = status(item.kind)
        return <button key={item.kind} type="button" role="tab" id={`doc-tab-${item.kind}`} aria-selected={selected} aria-controls={`doc-${item.kind}`} tabIndex={selected ? 0 : -1} onClick={() => onDoc(item.kind)} className={cn(
          'group flex cursor-pointer flex-col items-start gap-1 rounded-xl border px-3 py-2.5 text-left transition-colors sm:flex-row sm:items-center sm:gap-3 sm:px-3.5 sm:py-3', ring,
          selected ? 'border-[var(--color-accent)] bg-[var(--color-surface)] shadow-[var(--shadow-sheet)]' : 'border-[var(--color-border)] bg-[color-mix(in_oklab,var(--color-surface)_50%,var(--color-bg))] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface)]',
        )}>
          <span aria-hidden="true" className={cn('hidden size-9 shrink-0 place-items-center rounded-lg bg-[var(--color-surface-2)] sm:grid', selected ? 'text-[var(--color-text)]' : 'text-[var(--color-muted)]')}>{item.icon}</span>
          <span className="w-full min-w-0 sm:flex-1">
            <span className="block truncate text-sm font-semibold">{item.title}</span>
            <span className="hidden truncate text-xs text-[var(--color-muted)] sm:block">{item.hint}</span>
          </span>
          <span className={cn('shrink-0 rounded-[var(--radius-md)] px-1.5 py-0.5 text-xs font-medium', TONE[state.tone])}>{state.label}</span>
        </button>
      })}
    </div>

    <div id="doc-cover-letter" role="tabpanel" aria-labelledby="doc-tab-cover-letter" hidden={doc !== 'cover-letter'}>
      <CoverLetterTask key={app.key} app={app} active={props.active !== false && doc === 'cover-letter'} initialLetter={initialLetter} savedLetter={props.storedLetter} finalizedAtLoad={props.letterFinalized} onLetterSaved={props.onLetterSaved} onLetterFinalized={props.onLetterFinalized} resumeReady={props.resumeReady} onGoToResume={props.onGoToResume} />
    </div>
    <div id="doc-answers" role="tabpanel" aria-labelledby="doc-tab-answers" hidden={doc !== 'answers'}>
      <FormAnswersTask appKey={app.key} answers={answers} imported={props.answersImported} onAnswers={props.onAnswers} />
    </div>
    {(['email', 'linkedin'] as const).map((kind) => <div key={kind} id={`doc-${kind}`} role="tabpanel" aria-labelledby={`doc-tab-${kind}`} hidden={doc !== kind}>
      <MessageTask kind={kind} appKey={app.key} contact={contact} resumeReady={props.resumeReady} onGoToResume={props.onGoToResume} draft={drafts[kind] ?? ''} saved={savedDrafts[kind] ?? ''} onDraft={(text) => props.onDraft(kind, text)} onSaved={(text) => props.onDraftSaved(kind, text)} />
    </div>)}
  </div>
}

async function request<T = Record<string, unknown>>(url: string, method: string, body: object, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error ?? 'Could not save. Please try again.')
  return data as T
}

// ── Form questions ────────────────────────────────────────────────────────────

function chatKey(appKey: string) {
  return `onward-form-answers-chat:${appKey}`
}

/**
 * The application form, rebuilt here: one card per question with its answer,
 * saved as you type. The AI on the right drafts or revises answers, for the
 * question you are on or for the whole form; each change can be undone.
 */
function FormAnswersTask({ appKey, answers, imported, onAnswers }: { appKey: string; answers: FormAnswer[]; imported: boolean; onAnswers: (answers: FormAnswer[]) => void }) {
  const base = `/api/applications/${encodeURIComponent(appKey)}/form-answers`
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error' | 'imported'>(imported ? 'imported' : 'saved')
  const savedJson = useRef(JSON.stringify(answers))
  const [paste, setPaste] = useState('')
  const [pasting, setPasting] = useState(!answers.length)
  const [focus, setFocus] = useState<string | null>(null)
  const [turns, setTurns] = useState<AnswerTurn[]>([])
  const [message, setMessage] = useState('')
  const [thinking, setThinking] = useState(false)
  const [undo, setUndo] = useState<FormAnswer[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const aiPanel = useRef<HTMLElement>(null)
  const composer = useRef<HTMLTextAreaElement>(null)
  useFillHeight(aiPanel)
  const focused = answers.find((entry) => entry.id === focus) ?? null
  const answered = answers.filter(isAnswered).length

  useEffect(() => {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(chatKey(appKey)) ?? '[]')
      if (Array.isArray(parsed)) setTurns(parsed.filter((turn) => (turn?.role === 'user' || turn?.role === 'assistant') && typeof turn.content === 'string'))
    } catch { /* the chat starts empty */ }
  }, [appKey])
  useEffect(() => () => abortRef.current?.abort(), [])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }) }, [turns, thinking])

  // Autosave once typing pauses, like the cover letter.
  useEffect(() => {
    const json = JSON.stringify(answers)
    if (json === savedJson.current) return
    setSaveState('saving')
    const timer = window.setTimeout(async () => {
      try {
        await request(base, 'PUT', { questions: answers })
        savedJson.current = json
        setSaveState('saved')
      } catch (reason) { setSaveState('error'); setError((reason as Error).message) }
    }, 700)
    return () => window.clearTimeout(timer)
  }, [answers, base])

  function storeTurns(next: AnswerTurn[]) {
    setTurns(next)
    try { window.localStorage.setItem(chatKey(appKey), JSON.stringify(next.slice(-100))) } catch { /* the chat stays in memory */ }
  }

  function update(id: string, patch: Partial<FormAnswer>) {
    onAnswers(answers.map((entry) => entry.id === id ? { ...entry, ...patch } : entry))
  }

  function addQuestions(questions: string[]) {
    const added = questions.map((question) => newFormAnswer(question))
    onAnswers([...answers, ...added])
    setPaste(''); setPasting(false)
    if (added.length) setFocus(added[0].id)
  }

  async function copy(text: string, what: string) {
    try { await navigator.clipboard.writeText(text); setCopied(what); window.setTimeout(() => setCopied(null), 1800) } catch { setError('The clipboard is not available in this browser.') }
  }

  async function send(text = message, target = focus) {
    const ask = text.trim()
    if (!ask || thinking || !answers.length) return
    const history = [...turns, { role: 'user' as const, content: ask }]
    storeTurns(history)
    setMessage(''); setThinking(true); setError(null); setUndo(null)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const data = await request<{ reply: string; answers: { id: string; answer: string }[] }>(base, 'POST', { questions: answers, message: ask, focus: target, conversation: turns.slice(-40) }, controller.signal)
      const changed = new Map(data.answers.map((entry) => [entry.id, entry.answer]))
      storeTurns([...history, { role: 'assistant', content: data.reply || (changed.size ? 'Updated the answers.' : 'No answer changed.') }])
      if (changed.size) {
        setUndo(answers)
        onAnswers(answers.map((entry) => changed.has(entry.id) ? { ...entry, answer: changed.get(entry.id)! } : entry))
      }
    } catch (reason) {
      if ((reason as Error).name !== 'AbortError') setError((reason as Error).message)
      storeTurns(turns)
      setMessage(ask)
    } finally { setThinking(false); abortRef.current = null }
  }

  const prompts = focused
    ? [focused.answer.trim() ? 'Make this answer shorter.' : 'Draft this answer.', 'Make it sound more like me.']
    : [answered < answers.length ? 'Draft every unanswered question.' : 'Check every answer against the limits.']

  return <div className="space-y-3">
    {error ? <ErrorNotice error={error} className="rounded-md" onDismiss={() => setError(null)} /> : null}
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
      <section aria-labelledby="form-title" className="min-w-0 space-y-3">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 id="form-title" className="text-base font-semibold tracking-tight">Form questions</h2>
          {answers.length ? <span className={cn('rounded-[var(--radius-md)] px-1.5 py-0.5 text-xs font-medium', answered === answers.length ? TONE.ok : TONE.neutral)}>{answered} of {answers.length} answered</span> : null}
          <span role="status" className="text-xs text-[var(--color-muted)]">{saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Not saved' : saveState === 'imported' ? 'From your application-answers.md, saved here on your first edit' : answers.length ? 'Saved' : ''}</span>
          {copied ? <span role="status" className="text-xs text-[var(--color-ok)]">{copied} copied</span> : null}
          {answered ? <button type="button" onClick={() => void copy(answers.filter(isAnswered).map((entry) => `${entry.question}\n${entry.answer}`).join('\n\n'), 'All answers')} className={cn(secondaryButton, 'ml-auto')}><Copy size={13} aria-hidden="true" />Copy all</button> : null}
        </header>

        {answers.length ? <ol className="space-y-2.5">
          {answers.map((entry, index) => <QuestionCard
            key={entry.id}
            index={index}
            entry={entry}
            focused={entry.id === focus}
            busy={thinking}
            onFocus={() => setFocus(entry.id)}
            onChange={(patch) => update(entry.id, patch)}
            onRemove={() => { onAnswers(answers.filter((item) => item.id !== entry.id)); if (focus === entry.id) setFocus(null) }}
            onCopy={() => void copy(entry.answer, 'Answer')}
            onDraft={() => { setFocus(entry.id); void send(entry.answer.trim() ? 'Improve this answer.' : 'Draft this answer.', entry.id) }}
          />)}
        </ol> : null}

        {pasting ? <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4">
          <label htmlFor="form-paste" className="block text-sm font-semibold">{answers.length ? 'Paste more questions' : 'Paste the form’s questions'}</label>
          <p className="mt-0.5 text-xs text-[var(--color-muted)]">One per line. Numbering, bullets and “required” marks are removed.</p>
          <textarea id="form-paste" value={paste} onChange={(event) => setPaste(event.target.value)} rows={5} placeholder={'Why do you want to join us?\nWhat is your notice period?\nSalary expectations'} className={cn(field, 'mt-3 bg-[var(--color-surface)]')} />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="button" disabled={!splitQuestions(paste).length} onClick={() => addQuestions(splitQuestions(paste))} className={primaryButton}>
              Add {splitQuestions(paste).length || ''} question{splitQuestions(paste).length === 1 ? '' : 's'}
            </button>
            <button type="button" onClick={() => addQuestions([''])} className={linkButton}>Add one empty question instead</button>
            {answers.length ? <button type="button" onClick={() => { setPaste(''); setPasting(false) }} className={cn(linkButton, 'ml-auto text-[var(--color-muted)]')}>Cancel</button> : null}
          </div>
        </div> : <div className="flex flex-wrap gap-2">
          <OptionRow icon={<Plus size={15} />} label="Add a question" onClick={() => addQuestions([''])} />
          <OptionRow icon={<ListPlus size={15} />} label="Paste several questions" onClick={() => setPasting(true)} />
        </div>}
      </section>

      <aside ref={aiPanel} aria-label="Form answers AI" className={panel}>
        <AiPanelHeader title="Form answers AI" hint="Drafts answers in your voice from your resume and guidance. It asks when it needs a fact it doesn't have." />
        {turns.length >= 2 ? <LearnFromChat skillId="write-form-answers" turns={turns} disabled={thinking} /> : null}
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {turns.length ? turns.map((turn, index) => <div key={index} className={turn.role === 'user' ? aiUserBubble : aiReply}>
            <p className="whitespace-pre-wrap">{turn.content}</p>
          </div>) : <AiEmpty title={answers.length ? 'Pick a question, or ask about the whole form' : 'Add the form’s questions first'} hint="Answers stay short and plain, the way you would say them. Every change can be undone." />}
          {thinking ? <div className="flex items-center gap-2 text-xs text-[var(--color-muted)]"><Spinner /> Writing… usually under a minute</div> : null}
          {undo && !thinking ? <AiReview title="Answers updated" hint="The changed answers are on the left. Keep them, or undo to restore the previous answers.">
            <button type="button" onClick={() => setUndo(null)} className={secondaryButton}>Keep</button>
            <button type="button" onClick={() => { onAnswers(undo); setUndo(null) }} className={secondaryButton}>Undo</button>
          </AiReview> : null}
          <div ref={endRef} />
        </div>
        <AiComposer
          value={message}
          onChange={setMessage}
          onSubmit={() => void send()}
          onStop={() => abortRef.current?.abort()}
          busy={thinking}
          blocked={!message.trim()}
          disabled={!answers.length}
          label="Message the form answers AI"
          placeholder={answers.length ? 'Say what to change, or give a fact the AI needs…' : 'Add questions on the left to start.'}
          hint="Nothing is sent."
          textareaRef={composer}
        >
          {focused ? <p className="flex items-center gap-2 text-xs">
            <span className="text-[var(--color-muted)]">Working on</span>
            <span className="min-w-0 flex-1 truncate font-medium">Q{answers.indexOf(focused) + 1}. {focused.question || 'Untitled question'}</span>
            <button type="button" onClick={() => setFocus(null)} aria-label="Work on the whole form" title="Work on the whole form" className="grid size-6 cursor-pointer place-items-center rounded-md text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"><X size={13} aria-hidden="true" /></button>
          </p> : answers.length ? <p className="text-xs text-[var(--color-muted)]">Working on the whole form</p> : null}
          {answers.length ? <AiPrompts prompts={prompts} disabled={thinking} onPick={(prompt) => { setMessage(prompt); composer.current?.focus() }} /> : null}
        </AiComposer>
      </aside>
    </div>
  </div>
}

function QuestionCard({ index, entry, focused, busy, onFocus, onChange, onRemove, onCopy, onDraft }: {
  index: number
  entry: FormAnswer
  focused: boolean
  busy: boolean
  onFocus: () => void
  onChange: (patch: Partial<FormAnswer>) => void
  onRemove: () => void
  onCopy: () => void
  onDraft: () => void
}) {
  const [noting, setNoting] = useState(!!entry.note)
  const over = overLimit(entry)
  return <li onFocusCapture={onFocus} className={cn('rounded-xl border bg-[var(--color-surface)] transition-colors', focused ? 'border-[var(--color-accent)]' : 'border-[var(--color-border)]')}>
    <div className="flex items-start gap-2 px-4 pt-3.5">
      <span aria-hidden="true" className={cn('mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold', isAnswered(entry) ? 'bg-[var(--color-ok-soft)] text-[var(--color-ok)]' : 'bg-[var(--color-surface-2)] text-[var(--color-muted)]')}>{index + 1}</span>
      <textarea value={entry.question} onChange={(event) => onChange({ question: event.target.value })} rows={1} placeholder="Type the question" aria-label={`Question ${index + 1}`} className="field-sizing-content min-h-7 w-full resize-none bg-transparent py-0.5 text-sm font-semibold leading-snug outline-none placeholder:font-normal placeholder:text-[var(--color-muted)]" />
      <button type="button" onClick={onRemove} aria-label={`Remove question ${index + 1}`} title="Remove the question" className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-md text-[var(--color-faint)] transition-colors hover:bg-[var(--color-bad-soft)] hover:text-[var(--color-bad)]"><Trash2 size={14} aria-hidden="true" /></button>
    </div>
    <div className="px-4 pb-3 pt-2">
      <textarea value={entry.answer} onChange={(event) => onChange({ answer: event.target.value })} disabled={busy && focused} rows={3} placeholder="Your answer, or ask the AI to draft it" aria-label={`Answer to question ${index + 1}`} className={cn(field, 'field-sizing-content min-h-20', over && 'border-[var(--color-bad)]')} />
      {noting ? <input value={entry.note} onChange={(event) => onChange({ note: event.target.value })} placeholder="A note for yourself, never sent" aria-label={`Note on question ${index + 1}`} className="mt-2 w-full rounded-md bg-[var(--color-surface-2)] px-3 py-1.5 text-xs text-[var(--color-muted)] outline-none placeholder:text-[var(--color-muted)] focus:ring-1 focus:ring-[var(--color-accent)]" /> : null}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <button type="button" disabled={busy || !entry.question.trim()} onClick={onDraft} className={linkButton}><MessageSquareText size={13} aria-hidden="true" />{entry.answer.trim() ? 'Improve with AI' : 'Draft with AI'}</button>
        {entry.answer.trim() ? <button type="button" onClick={onCopy} className={cn(linkButton, 'text-[var(--color-muted)] hover:text-[var(--color-accent)]')}><Copy size={13} aria-hidden="true" />Copy</button> : null}
        {!noting ? <button type="button" onClick={() => setNoting(true)} className={cn(linkButton, 'text-[var(--color-muted)] hover:text-[var(--color-accent)]')}>Add a note</button> : null}
        <label className="ml-auto flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
          <span className={cn('tnum', over && 'font-semibold text-[var(--color-bad)]')}>{entry.answer.length}{entry.limit ? ` / ${entry.limit}` : ''} characters</span>
          <span className="sr-only">Character limit</span>
          <input type="number" min={1} max={20000} value={entry.limit ?? ''} onChange={(event) => onChange({ limit: event.target.value ? Math.max(1, Math.min(20000, Math.round(Number(event.target.value)))) : null })} placeholder="Limit" title="The form's character limit, if it has one" className="h-7 w-16 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 text-xs outline-none placeholder:text-[var(--color-muted)] focus:border-[var(--color-accent)]" />
        </label>
      </div>
    </div>
  </li>
}

function OptionRow({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={cn('group flex min-w-48 flex-1 cursor-pointer items-center gap-2.5 rounded-xl border border-dashed border-[var(--color-border-strong)] px-3.5 py-2.5 text-left text-sm transition-colors hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-soft)]', ring)}>
    <span aria-hidden="true" className="text-[var(--color-accent)]">{icon}</span>
    <span className="min-w-0 flex-1 font-medium text-[var(--color-accent)]">{label}</span>
    <ChevronRight size={15} aria-hidden="true" className="shrink-0 text-[var(--color-accent)] transition-transform group-hover:translate-x-0.5" />
  </button>
}

// ── Email and LinkedIn ────────────────────────────────────────────────────────

const MESSAGE: Record<'email' | 'linkedin', { title: string; placeholder: string }> = {
  email: { title: 'Application email', placeholder: 'Where you found the role, the recipient, language, first contact or a reply…' },
  linkedin: { title: 'LinkedIn message', placeholder: 'Who you are writing to, where you found the role, connection request or InMail…' },
}

/** The message on the left, edited directly and saved as you type; the AI that drafts it on the right. */
function MessageTask({ kind, appKey, contact, resumeReady, onGoToResume, draft, saved, onDraft, onSaved }: {
  kind: 'email' | 'linkedin'
  appKey: string
  contact: PostingContact
  resumeReady: boolean
  onGoToResume: () => void
  draft: string
  saved: string
  onDraft: (text: string) => void
  onSaved: (text: string) => void
}) {
  const base = `/api/applications/${encodeURIComponent(appKey)}/outreach`
  const meta = MESSAGE[kind]
  const [instructions, setInstructions] = useState('')
  // The last AI draft; once the candidate edits it, the difference is what the skill can learn from.
  const [aiDraft, setAiDraft] = useState<{ request: string; text: string } | null>(null)
  // The text the last AI draft replaced, so the candidate can put it back.
  const [replaced, setReplaced] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  // Only the latest save may report its outcome.
  const saveRun = useRef(0)
  const subject = draft.match(/^Subject:\s*(.+)$/im)?.[1].trim() || null

  async function persist(text: string) {
    const run = ++saveRun.current
    setSaveState('saving')
    try {
      await request(base, 'PUT', { kind, text })
      onSaved(text)
      if (run === saveRun.current) setSaveState('saved')
    } catch (reason) {
      if (run === saveRun.current) { setSaveState('error'); setError((reason as Error).message) }
    }
  }
  // The timer calls the latest persist, so a new onSaved from the parent does not restart it.
  const persistRef = useRef(persist)
  useEffect(() => { persistRef.current = persist })

  useEffect(() => () => abortRef.current?.abort(), [])

  // Autosave once typing pauses, like the form answers.
  useEffect(() => {
    // A newer state replaces whatever an earlier save would report.
    saveRun.current++
    if (draft === saved) { setSaveState('saved'); return }
    setSaveState('saving')
    const timer = window.setTimeout(() => void persistRef.current(draft), 700)
    return () => window.clearTimeout(timer)
  }, [draft, saved])

  async function copy() {
    setError(null)
    try { await navigator.clipboard.writeText(draft); setNotice('Copied to clipboard.') } catch { setError('The clipboard is not available in this browser.') }
  }

  async function generate() {
    if (generating) return
    const controller = new AbortController()
    abortRef.current = controller
    const previous = draft
    setGenerating(true); setError(null); setNotice('')
    try {
      const data = await request<{ text: string }>(base, 'POST', { kind, instructions }, controller.signal)
      onDraft(data.text)
      setReplaced(previous)
      setAiDraft({ request: instructions.trim() || `Draft the ${kind === 'email' ? 'application email' : 'LinkedIn message'}.`, text: data.text })
    } catch (reason) {
      if ((reason as Error).name !== 'AbortError') setError((reason as Error).message)
    } finally { setGenerating(false); abortRef.current = null }
  }

  return <div className="space-y-3">
    {error ? <ErrorNotice error={error} className="rounded-md" onDismiss={() => setError(null)} /> : null}
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
      <section aria-label={meta.title} className="min-w-0 space-y-3">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 className="text-base font-semibold tracking-tight">{meta.title}</h2>
          <span role="status" className="text-xs text-[var(--color-muted)]">{saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Not saved' : draft ? 'Saved' : ''}</span>
          {saveState === 'error' ? <button type="button" onClick={() => void persist(draft)} className={secondaryButton}>Retry saving</button> : null}
          {notice ? <span role="status" className="text-xs text-[var(--color-ok)]">{notice}</span> : null}
        </header>
        {kind === 'email' && contact.email ? <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-xs">
          <span className="text-[var(--color-muted)]">To</span>
          <span className="font-medium">{contact.name ? `${contact.name} <${contact.email}>` : contact.email}</span>
          <span className="text-[var(--color-faint)]">from the posting</span>
          <button type="button" className={cn(secondaryButton, 'ml-auto h-7')} onClick={() => void navigator.clipboard.writeText(contact.email!).then(() => setNotice('Address copied.'))}>Copy address</button>
          <a className={cn(secondaryButton, 'h-7')} href={`mailto:${contact.email}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`}>Open in mail app</a>
        </div> : null}
        <textarea disabled={generating} rows={16} maxLength={30000} className={cn(field, 'bg-[var(--color-surface)]')} value={draft} onChange={(event) => { onDraft(event.target.value); setNotice('') }} placeholder="Ask the AI for a draft on the right, or write your own here." aria-label={meta.title} />
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={generating || !draft} className={secondaryButton} onClick={() => void copy()}><Copy size={13} aria-hidden="true" />Copy</button>
        </div>
        {aiDraft && saved && saved !== aiDraft.text ? <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
          <LearnFromChat skillId="write-outreach" disabled={generating} turns={[
            { role: 'user', content: aiDraft.request },
            { role: 'assistant', content: aiDraft.text },
            { role: 'user', content: `I edited your draft before using it. My final version:\n\n${saved}` },
          ]} />
        </div> : null}
      </section>

      <aside aria-label={`${meta.title} AI`} className={panelFrame}>
        <AiPanelHeader title={`${meta.title} AI`} hint="Uses your finalized resume, your cover letter and the posting. It drafts the whole message; nothing is sent." />
        {resumeReady ? <>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {replaced !== null && !generating ? <AiReview title="New draft on the left" hint="Keep it, or undo to put back what you had before.">
              <button type="button" onClick={() => setReplaced(null)} className={secondaryButton}>Keep</button>
              <button type="button" onClick={() => { onDraft(replaced); setReplaced(null); setAiDraft(null) }} className={secondaryButton}>Undo</button>
            </AiReview> : <AiEmpty title="What should it know?" hint="Optional: the recipient, where you found the role, the language, first contact or a reply. The draft appears on the left." />}
          </div>
          <AiComposer
            value={instructions}
            onChange={setInstructions}
            onSubmit={() => void generate()}
            onStop={() => abortRef.current?.abort()}
            busy={generating}
            label="What should the AI know?"
            sendLabel={draft ? 'Write a new draft' : 'Draft it with AI'}
            placeholder={meta.placeholder}
            rows={4}
            hint={generating ? 'Writing… up to a minute. Esc stops.' : draft ? 'Enter writes a new draft; you can undo it.' : 'Enter drafts the whole message. Nothing is sent.'}
          />
        </> : <AiBlocked title="Finalize your resume first" hint="The AI writes from the resume you send, so it needs that version." action={<button type="button" onClick={onGoToResume} className={secondaryButton}>Go to the Resume step</button>} />}
      </aside>
    </div>
  </div>
}
