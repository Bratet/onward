'use client'

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { ClipboardList, Copy, FileText, Linkedin, ListPlus, Mail, MessageSquareText, Plus, Trash2, X } from 'lucide-react'
import type { Application } from '@/lib/applications'
import type { CoverLetter } from '@/lib/coverLetter'
import type { PostingContact } from '@/lib/postingContact'
import type { FinalizedState } from '@/components/FinalizeStatus'
import type { OutreachDrafts } from '@/lib/outreach'
import { isAnswered, newFormAnswer, overLimit, splitQuestions, type AnswerTurn, type FormAnswer } from '@/lib/formAnswers'
import { ErrorNotice } from '@/components/ErrorNotice'
import { LearnFromChat } from '@/components/LearnFromChat'
import { AiBlocked, AiComposer, AiEmpty, AiPanelHeader, AiPrompts, AiReview, AiSheet, AiSheetTrigger, aiReply, aiUserBubble } from '@/components/AiPanel'
import { Spinner } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'
import { useFillHeight } from '@/components/useFillHeight'
import { CoverLetterTask } from './cover-letter-task'

export type DocumentKind = 'cover-letter' | 'answers' | 'email' | 'linkedin'
export const DOCUMENT_KINDS: readonly DocumentKind[] = ['cover-letter', 'answers', 'email', 'linkedin']

/** A document's standing on its tab: moss when it is done, straw when the posting asks for it and it is not. */
type Standing = 'ok' | 'warn' | undefined

const ring = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]'
const primaryButton = `inline-flex min-h-9 max-sm:min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg bg-[var(--color-accent)] px-3.5 text-sm font-semibold text-[var(--color-on-solid)] shadow-[0_1px_2px_oklch(0_0_0/0.15)] transition-[filter] hover:brightness-110 ${ring} disabled:cursor-not-allowed disabled:bg-[var(--color-surface-2)] disabled:text-[var(--color-faint)] disabled:shadow-none`
const secondaryButton = `inline-flex h-8 max-sm:min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 text-xs font-medium transition-colors hover:bg-[var(--color-surface-2)] ${ring} disabled:cursor-not-allowed disabled:opacity-40`
const linkButton = `inline-flex min-h-8 max-sm:min-h-11 cursor-pointer items-center gap-1.5 rounded text-xs font-medium text-[var(--color-accent)] underline-offset-4 hover:underline ${ring} disabled:cursor-not-allowed disabled:text-[var(--color-faint)] disabled:no-underline`
const field = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm leading-relaxed outline-none placeholder:text-[var(--color-muted)] focus:border-[var(--color-accent)] disabled:opacity-60'
/** An AI pane: a sheet that runs from under the tabs to the bottom of the window, sticking under the top bar. */
const panel = 'sheet workspace-pane flex min-h-0 flex-col overflow-hidden'

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
  // Every document is optional, so an untouched one says so; only a letter the posting asks for says more.
  const status = (kind: DocumentKind): { label: string; standing: Standing } => {
    if (kind === 'cover-letter') return letterPdf ? { label: 'Final', standing: 'ok' } : initialLetter.content.trim() ? { label: 'Draft', standing: undefined } : contact.coverLetter ? { label: 'Asked for', standing: 'warn' } : { label: 'Optional', standing: undefined }
    if (kind === 'answers') return answers.length ? { label: `${answered} of ${answers.length} answered`, standing: answered === answers.length ? 'ok' : undefined } : { label: 'Optional', standing: undefined }
    const draft = drafts[kind] ?? ''
    return draft !== (savedDrafts[kind] ?? '') ? { label: 'Saving…', standing: undefined } : draft ? { label: 'Draft saved', standing: 'ok' } : { label: 'Optional', standing: undefined }
  }
  // Short names on a phone, so all four folders fit across without scrolling.
  const items: { kind: DocumentKind; title: string; short: string; hint: string; icon: ReactNode }[] = [
    { kind: 'cover-letter', title: 'Cover letter', short: 'Letter', hint: contact.coverLetter ? 'The posting asks for one' : 'Only if they ask for one', icon: <FileText size={13} aria-hidden="true" /> },
    { kind: 'answers', title: 'Form questions', short: 'Form', hint: 'Questions on the application form', icon: <ClipboardList size={13} aria-hidden="true" /> },
    { kind: 'email', title: 'Application email', short: 'Email', hint: contact.email ? `To ${contact.name ?? contact.email}` : 'For applying by email', icon: <Mail size={13} aria-hidden="true" /> },
    { kind: 'linkedin', title: 'LinkedIn message', short: 'LinkedIn', hint: 'A note to the recruiter', icon: <Linkedin size={13} aria-hidden="true" /> },
  ]

  // Arrow keys move between the documents, as in any tab list.
  const onPickerKey = (event: KeyboardEvent) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    const edge = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : null
    if (!step && edge === null) return
    event.preventDefault()
    const next = items[edge ?? (items.findIndex((item) => item.kind === doc) + step + items.length) % items.length].kind
    onDoc(next)
    document.getElementById(`doc-tab-${next}`)?.focus()
  }

  // The folders sit over the document column only, so the open tab and the document's sheet are one piece;
  // the AI beside it starts level with the sheet.
  return <div>
    <div className="grid gap-x-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
      <div role="tablist" aria-label="Documents" onKeyDown={onPickerKey} className="folder-strip min-w-0">
        {items.map((item) => {
          const selected = item.kind === doc
          const state = status(item.kind)
          return <button key={item.kind} type="button" role="tab" id={`doc-tab-${item.kind}`} aria-selected={selected} aria-controls={`doc-${item.kind}`} tabIndex={selected ? 0 : -1}
            title={item.hint} data-standing={state.standing} onClick={() => onDoc(item.kind)} className="folder-tab folder-tab-doc">
            <span className="folder-tab-name">{item.icon}<span className="sm:hidden">{item.short}</span><span className="max-sm:hidden">{item.title}</span></span>
            <span className="folder-tab-state">{state.label}</span>
          </button>
        })}
      </div>
    </div>

    <div id="doc-cover-letter" role="tabpanel" aria-labelledby="doc-tab-cover-letter" hidden={doc !== 'cover-letter'}>
      <CoverLetterTask key={app.key} app={app} active={props.active !== false && doc === 'cover-letter'} asked={!!contact.coverLetter} initialLetter={initialLetter} savedLetter={props.storedLetter} finalizedAtLoad={props.letterFinalized} onLetterSaved={props.onLetterSaved} onLetterFinalized={props.onLetterFinalized} resumeReady={props.resumeReady} onGoToResume={props.onGoToResume} />
    </div>
    <div id="doc-answers" role="tabpanel" aria-labelledby="doc-tab-answers" hidden={doc !== 'answers'}>
      <FormAnswersTask appKey={app.key} active={props.active !== false && doc === 'answers'} answers={answers} imported={props.answersImported} onAnswers={props.onAnswers} />
    </div>
    {(['email', 'linkedin'] as const).map((kind) => <div key={kind} id={`doc-${kind}`} role="tabpanel" aria-labelledby={`doc-tab-${kind}`} hidden={doc !== kind}>
      <MessageTask kind={kind} appKey={app.key} active={props.active !== false && doc === kind} contact={contact} resumeReady={props.resumeReady} onGoToResume={props.onGoToResume} draft={drafts[kind] ?? ''} saved={savedDrafts[kind] ?? ''} onDraft={(text) => props.onDraft(kind, text)} onSaved={(text) => props.onDraftSaved(kind, text)} />
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
function FormAnswersTask({ appKey, active, answers, imported, onAnswers }: { appKey: string; active: boolean; answers: FormAnswer[]; imported: boolean; onAnswers: (answers: FormAnswer[]) => void }) {
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
  const [sheet, setSheet] = useState(false)
  const composer = useRef<HTMLTextAreaElement>(null)
  useFillHeight(aiPanel, active, 80)
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

  const addActions = <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-[var(--color-border)] px-5 py-2.5">
    <button type="button" onClick={() => addQuestions([''])} className={linkButton}><Plus size={13} aria-hidden="true" />Add a question</button>
    <button type="button" onClick={() => setPasting(true)} className={linkButton}><ListPlus size={13} aria-hidden="true" />Paste several questions</button>
  </div>

  return <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
    {/* One sheet: the form's questions as ruled rows, under its folder tab. */}
    <section aria-labelledby="form-title" className="sheet min-w-0 overflow-hidden">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[var(--color-border)] px-5 py-3.5">
        <div className="min-w-0 flex-1">
          <h2 id="form-title" className="text-[17px]">Form questions</h2>
          <p role="status" className="mt-0.5 text-xs text-[var(--color-muted)]">
            {answers.length ? <><span className={cn('tnum', answered === answers.length && 'font-semibold text-[var(--color-ok)]')}>{answered} of {answers.length}</span> answered · </> : null}
            {saveState === 'saving' ? 'Saving…' : saveState === 'error' ? <span className="text-[var(--color-bad)]">Not saved</span> : saveState === 'imported' ? 'From your application-answers.md, saved here on your first edit' : answers.length ? 'Saved' : 'Optional. Keep the form’s questions and your answers with the application.'}
            {copied ? <span className="text-[var(--color-ok)]"> · {copied} copied</span> : null}
          </p>
        </div>
        {answered ? <button type="button" onClick={() => void copy(answers.filter(isAnswered).map((entry) => `${entry.question}\n${entry.answer}`).join('\n\n'), 'All answers')} className={secondaryButton}><Copy size={13} aria-hidden="true" />Copy all</button> : null}
      </header>
      {error ? <ErrorNotice error={error} className="border-b border-[var(--color-border)]" onDismiss={() => setError(null)} /> : null}

      {answers.length ? <ol className="divide-y divide-[var(--color-border)]">
        {answers.map((entry, index) => <QuestionRow
          key={entry.id}
          index={index}
          entry={entry}
          focused={entry.id === focus}
          busy={thinking}
          onFocus={() => setFocus(entry.id)}
          onChange={(patch) => update(entry.id, patch)}
          onRemove={() => { onAnswers(answers.filter((item) => item.id !== entry.id)); if (focus === entry.id) setFocus(null) }}
          onCopy={() => void copy(entry.answer, 'Answer')}
          onDraft={() => {
            setFocus(entry.id)
            // On a narrow screen the AI's progress and its Keep / Undo live in the sheet, so it opens with the request.
            if (!window.matchMedia('(min-width: 1024px)').matches) setSheet(true)
            void send(entry.answer.trim() ? 'Improve this answer.' : 'Draft this answer.', entry.id)
          }}
        />)}
      </ol> : null}

      {pasting ? <div className={cn('px-5 py-4', answers.length > 0 && 'border-t border-[var(--color-border)]')}>
        {/* With no questions yet the sheet's title already says what this is; the label stays for screen readers. */}
        <label htmlFor="form-paste" className={answers.length ? 'block text-sm font-semibold' : 'sr-only'}>{answers.length ? 'Paste more questions' : 'Paste the form’s questions'}</label>
        <p className={cn('text-xs text-[var(--color-muted)]', answers.length > 0 && 'mt-0.5')}>Paste the questions one per line. Numbering, bullets and “required” marks are removed.</p>
        <textarea id="form-paste" value={paste} onChange={(event) => setPaste(event.target.value)} rows={5} placeholder={'For example:\nWhy do you want to join us?\nWhat is your notice period?'} className={cn(field, 'mt-3')} />
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <button type="button" disabled={!splitQuestions(paste).length} onClick={() => addQuestions(splitQuestions(paste))} className={primaryButton}>
            Add {splitQuestions(paste).length || ''} question{splitQuestions(paste).length === 1 ? '' : 's'}
          </button>
          <button type="button" onClick={() => addQuestions([''])} className={linkButton}>Add one empty question instead</button>
          {answers.length ? <button type="button" onClick={() => { setPaste(''); setPasting(false) }} className={cn(linkButton, 'ml-auto text-[var(--color-muted)]')}>Cancel</button> : null}
        </div>
      </div> : addActions}
    </section>

    <AiSheet label="Form questions AI" open={sheet} onOpenChange={setSheet} active={active}>
      <aside ref={aiPanel} aria-label="Form questions AI" className={panel}>
        <AiPanelHeader title="Form questions AI" hint="Drafts answers in your voice from your resume and what you’ve confirmed. It asks when it needs a fact it doesn’t have." />
        {turns.length >= 2 ? <LearnFromChat skillId="write-form-answers" turns={turns} disabled={thinking} /> : null}
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {turns.length ? turns.map((turn, index) => <div key={index} className={turn.role === 'user' ? aiUserBubble : aiReply}>
            <p className="whitespace-pre-wrap">{turn.content}</p>
          </div>) : <AiEmpty title={answers.length ? 'Pick a question, or ask about the whole form' : 'Add the form’s questions first'} hint="Answers stay short and plain, the way you would say them. Every change can be undone." />}
          {thinking ? <div className="flex items-center gap-2 text-xs text-[var(--color-muted)]"><Spinner /> Writing… usually under a minute</div> : null}
          {undo && !thinking ? <AiReview title="Answers updated" hint="The changed answers are in the form. Keep them, or undo to restore the previous answers.">
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
          label="Message the Form questions AI"
          placeholder={answers.length ? 'Say what to change, or give a fact the AI needs…' : 'Add the form’s questions first.'}
          hint="The AI edits the answers here; nothing goes to the employer."
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
    </AiSheet>
    <AiSheetTrigger label="Form questions AI" onOpen={() => setSheet(true)} />
  </div>
}

/** One question on the form sheet: a serif number, the question, its answer, and what to do with it. */
function QuestionRow({ index, entry, focused, busy, onFocus, onChange, onRemove, onCopy, onDraft }: {
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
  const answeredHere = isAnswered(entry)
  // The question the AI is working on is the current place: its number takes the action colour.
  return <li onFocusCapture={onFocus} className={cn('px-5 py-4 transition-colors duration-200', focused && 'bg-[color-mix(in_oklab,var(--color-surface-2)_45%,transparent)]')}>
    <div className="flex items-start gap-3">
      <span aria-hidden="true" className={cn('font-display w-5 shrink-0 pt-px text-right text-[15px] leading-snug', focused ? 'text-[var(--color-accent)]' : answeredHere ? 'text-[var(--color-ok)]' : 'text-[var(--color-faint)]')}>{index + 1}</span>
      <textarea value={entry.question} onChange={(event) => onChange({ question: event.target.value })} rows={1} placeholder="Type the question" aria-label={`Question ${index + 1}`} className="field-sizing-content min-h-7 w-full resize-none rounded bg-transparent py-0.5 text-[15px] font-medium leading-snug outline-none placeholder:font-normal placeholder:text-[var(--color-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]" />
      <button type="button" onClick={onRemove} aria-label={`Remove question ${index + 1}`} title="Remove the question" className="grid size-8 max-sm:size-11 shrink-0 cursor-pointer place-items-center rounded-md text-[var(--color-faint)] transition-colors hover:bg-[var(--color-bad-soft)] hover:text-[var(--color-bad)]"><Trash2 size={14} aria-hidden="true" /></button>
    </div>
    <div className="pl-8 pt-2">
      <textarea value={entry.answer} onChange={(event) => onChange({ answer: event.target.value })} disabled={busy && focused} rows={3} placeholder="Your answer, or ask the AI to draft it" aria-label={`Answer to question ${index + 1}`} className={cn(field, 'field-sizing-content min-h-20', over && 'border-[var(--color-bad)]')} />
      {noting ? <input value={entry.note} onChange={(event) => onChange({ note: event.target.value })} placeholder="A note for yourself, never sent" aria-label={`Note on question ${index + 1}`} className="mt-2 w-full rounded-md bg-[var(--color-surface-2)] px-3 py-1.5 text-xs text-[var(--color-muted)] outline-none placeholder:text-[var(--color-muted)] focus:ring-1 focus:ring-[var(--color-accent)]" /> : null}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
        <button type="button" disabled={busy || !entry.question.trim()} onClick={onDraft} className={linkButton}><MessageSquareText size={13} aria-hidden="true" />{entry.answer.trim() ? 'Improve with AI' : 'Draft with AI'}</button>
        {entry.answer.trim() ? <button type="button" onClick={onCopy} className={cn(linkButton, 'text-[var(--color-muted)] hover:text-[var(--color-accent)]')}><Copy size={13} aria-hidden="true" />Copy</button> : null}
        {!noting ? <button type="button" onClick={() => setNoting(true)} className={cn(linkButton, 'text-[var(--color-muted)] hover:text-[var(--color-accent)]')}>Add a note</button> : null}
        <label className="ml-auto flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
          <span className={cn('tnum', over && 'font-semibold text-[var(--color-bad)]')}>{entry.answer.length}{entry.limit ? ` / ${entry.limit}` : ''} characters</span>
          <span className="sr-only">Character limit</span>
          <input type="number" min={1} max={20000} value={entry.limit ?? ''} onChange={(event) => onChange({ limit: event.target.value ? Math.max(1, Math.min(20000, Math.round(Number(event.target.value)))) : null })} placeholder="Limit" title="The form's character limit, if it has one" className="h-8 w-16 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 text-xs outline-none placeholder:text-[var(--color-muted)] focus:border-[var(--color-accent)]" />
        </label>
      </div>
    </div>
  </li>
}

// ── Email and LinkedIn ────────────────────────────────────────────────────────

const MESSAGE: Record<'email' | 'linkedin', { title: string; placeholder: string }> = {
  email: { title: 'Application email', placeholder: 'Where you found the role, the recipient, language, first contact or a reply…' },
  linkedin: { title: 'LinkedIn message', placeholder: 'Who you are writing to, where you found the role, connection request or InMail…' },
}

/** The message on the left, edited directly and saved as you type; the AI that drafts it on the right. */
function MessageTask({ kind, appKey, active, contact, resumeReady, onGoToResume, draft, saved, onDraft, onSaved }: {
  kind: 'email' | 'linkedin'
  appKey: string
  active: boolean
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
  // The message's sheet and its AI run the same height, from under the tabs to the bottom of the window.
  const documentPanel = useRef<HTMLElement>(null)
  const aiPanel = useRef<HTMLElement>(null)
  const [sheet, setSheet] = useState(false)
  useFillHeight(documentPanel, active, 80)
  useFillHeight(aiPanel, active, 80)
  const words = draft.trim() ? draft.trim().split(/\s+/).length : 0

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

  return <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
    {/* The message is the paper itself: a header, the text, and a footer with what to do with it. */}
    <section ref={documentPanel} aria-label={meta.title} className="sheet workspace-pane flex min-h-0 min-w-0 flex-col overflow-hidden transition-[border-color,box-shadow] duration-200 has-[textarea:focus-visible]:border-[var(--color-accent)] has-[textarea:focus-visible]:shadow-[0_0_0_1px_var(--color-accent)] lg:sticky lg:top-20">
      <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-[var(--color-border)] px-5 py-3.5">
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px]">{meta.title}</h2>
          <p role="status" className={cn('mt-0.5 text-xs', saveState === 'error' ? 'text-[var(--color-bad)]' : 'text-[var(--color-muted)]')}>{saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Not saved' : draft ? 'Saved' : 'Not started'}</p>
        </div>
        {saveState === 'error' ? <button type="button" onClick={() => void persist(draft)} className={secondaryButton}>Retry saving</button> : null}
      </header>
      {error ? <ErrorNotice error={error} className="shrink-0 border-b border-[var(--color-border)]" onDismiss={() => setError(null)} /> : null}
      {kind === 'email' && contact.email ? <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--color-border)] px-5 py-2 text-xs">
        <span className="text-[var(--color-muted)]">To</span>
        <span className="font-medium">{contact.name ? `${contact.name} <${contact.email}>` : contact.email}</span>
        <span className="text-[var(--color-muted)]">from the posting</span>
        <button type="button" className={cn(secondaryButton, 'ml-auto')} onClick={() => void navigator.clipboard.writeText(contact.email!).then(() => setNotice('Address copied.'))}>Copy address</button>
        <a className={secondaryButton} href={`mailto:${contact.email}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`}>Open in mail app</a>
      </div> : null}
      <textarea disabled={generating} maxLength={30000} value={draft} onChange={(event) => { onDraft(event.target.value); setNotice('') }} placeholder="Write your message here, or have the AI draft it." aria-label={meta.title}
        className="min-h-64 w-full flex-1 resize-none bg-transparent px-5 py-4 text-sm leading-7 outline-none placeholder:text-[var(--color-muted)] focus-visible:outline-none disabled:opacity-60" />
      {aiDraft && saved && saved !== aiDraft.text ? <div className="shrink-0 border-t border-[var(--color-border)]">
        <LearnFromChat skillId="write-outreach" disabled={generating} turns={[
          { role: 'user', content: aiDraft.request },
          { role: 'assistant', content: aiDraft.text },
          { role: 'user', content: `I edited your draft before using it. My final version:\n\n${saved}` },
        ]} />
      </div> : null}
      <footer className="flex shrink-0 flex-wrap items-center gap-3 border-t border-[var(--color-border)] px-5 py-3">
        <span className="tnum text-xs text-[var(--color-muted)]">{words} word{words === 1 ? '' : 's'}</span>
        {notice ? <span role="status" className="text-xs text-[var(--color-ok)]">{notice}</span> : null}
        <button type="button" disabled={generating || !draft} className={cn(secondaryButton, 'ml-auto')} onClick={() => void copy()}><Copy size={13} aria-hidden="true" />Copy</button>
      </footer>
    </section>

    <AiSheet label={`${meta.title} AI`} open={sheet} onOpenChange={setSheet} active={active}>
      <aside ref={aiPanel} aria-label={`${meta.title} AI`} className={panel}>
        <AiPanelHeader title={`${meta.title} AI`} hint="Writes the whole message from your finalized resume, your cover letter and the posting. You send it yourself." />
        {resumeReady ? <>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {replaced !== null && !generating ? <AiReview title="New draft in your message" hint="Keep it, or undo to put back what you had before.">
              <button type="button" onClick={() => setReplaced(null)} className={secondaryButton}>Keep</button>
              <button type="button" onClick={() => { onDraft(replaced); setReplaced(null); setAiDraft(null) }} className={secondaryButton}>Undo</button>
            </AiReview> : <AiEmpty title={draft ? 'Want a different version?' : 'Ready when you are'} hint="Add anything it should know below, such as the recipient, where you found the role, the language, or whether this is a first contact or a reply. All of it is optional." />}
          </div>
          <AiComposer
            intent="brief"
            value={instructions}
            onChange={setInstructions}
            onSubmit={() => void generate()}
            onStop={() => abortRef.current?.abort()}
            busy={generating}
            label={`Instructions for the ${meta.title} AI`}
            sendLabel={draft ? 'Write a new draft' : 'Draft it'}
            placeholder={meta.placeholder}
            rows={3}
            hint={generating ? 'Writing… up to a minute. Esc stops it.' : draft ? 'Replaces your message. You can undo it.' : 'Enter also drafts it.'}
          />
        </> : <AiBlocked title="Finalize your resume first" hint="The AI writes from the resume you send, so it needs that version." action={<button type="button" onClick={onGoToResume} className={secondaryButton}>Go to the Resume step</button>} />}
      </aside>
    </AiSheet>
    <AiSheetTrigger label={`${meta.title} AI`} onOpen={() => setSheet(true)} />
  </div>
}
