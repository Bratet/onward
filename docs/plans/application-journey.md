# The application journey, driven by an AI companion

Status: plan agreed 2026-10-20. Slices 1 and 3 are built, and slice 2 except the companion on unsent applications. On 2026-10-20 the user stopped the companion work: what is built stays, and nothing below marked planned will be built unless they ask again.

## Thesis

You talk to the companion; the companion edits the application; the application page is the shared record you both look at. You never fill a form to log progress: you paste an email or say what happened. Everything the AI does lands on the page as something typed and visible (a stage, a step, a date, a contact, a next action, a draft), never only in a chat log.

The bar for every AI touchpoint is high CAIR, confidence in AI results: value divided by the risk of an error and the effort of correcting it ([LangChain, "The hidden metric that determines AI product success"](https://www.langchain.com/blog/the-hidden-metric-that-determines-ai-product-success)). Most of that is design, not the model.

## The model

An application has:

- **Stage**, in journey order: Preparing → Applied → Interviewing → Offer → Closed. "Responded" goes away; the first call is interview step one.
- **Outcome** when closed: Hired, Declined the offer, Rejected, Withdrew, No reply, Did not apply.
- **Steps**: the company's actual process, each expected, booked, done, passed or not passed, with a date and who runs it.
- **Next action**: one concrete thing with an optional due date.
- **Contacts**: the people on the other side.
- **Timeline**: every applied update with its source text and a snapshot for undo. The companion reads it as context.

`applications.md` keeps its exact format: its status column holds the coarse stage (Applied, Interview, Offer, Rejected…). The journey lives in the application's workspace record. Code: `src/lib/journey.ts` (model, operations, prompt), `src/lib/journeyStore.ts` (propose, apply, undo).

## How the companion changes things

1. You write or paste what happened.
2. The companion answers with typed operations only: `set_stage`, `add_step`, `update_step`, `set_next_action`, `clear_next_action`, `add_contact`, `add_note`. The app validates each against the same code the CLI uses; anything invalid is dropped before you see it.
3. A proposal card lists each operation in plain words, with the words it came from and a basis: from your message, guessed, or needs you. If something essential is missing it asks one question instead of guessing. "Nothing to change" is a normal answer.
4. You untick what is wrong and apply the rest as one timeline entry.
5. The most recent update can always be undone; the tracker row goes back too, and is left alone where you edited it since.

The companion's instructions are the `track-application` skill, editable on the Skills page.

## CAIR principles applied

| Principle | In Onward |
|---|---|
| Ask only at irreversible points | Approval is required to send, submit, accept or decline an offer, or delete. Journey updates are reviewed now and can relax to "apply and tell me" later because they undo. |
| Every change can be undone | Each applied proposal is a timeline entry with Undo; drafts never overwrite a source resume or a sent message. |
| Mistakes stay contained | The AI only produces proposals and drafts. It has no way to send email or submit forms. |
| Show the reasoning | Each item quotes its source and says whether it was read, guessed or needs you, so you fix one line instead of discarding the whole answer. |
| Let the user choose autonomy | Planned: Settings → Companion, per kind of action: Ask me, Apply and tell me, Off. Default Ask me; sending is never automatic. |

| What the AI does | Value | Risk if wrong | Correction | Design |
|---|---|---|---|---|
| Read an update, change the journey | High | Low | One untick or Undo | Proposal card, undo (built) |
| Draft a reply or follow-up | High | High if sent | Edit text | Draft only; you send it |
| Interview prep for a round | High | Low | Regenerate | Attached to the step |
| Tailor the resume | High | Medium | Diff review | Review mode default |
| Fit analysis | Medium | Medium | Challenge in chat | Evidence on every gap |
| Close as rejected or no reply | Medium | Low | Undo | Ask first |

## Surfaces

- **Companion**: one, context-aware, replacing the per-tab chats. Docked on the application page; on the dashboard a "What happened?" box that finds the matching application from a pasted email and asks you to confirm. It shows what it read, and offers suggestions as chips you can ignore, never pop-ups.
- **Application page**: header with stage and a next-action strip; a rail of the real steps (expected ones look tentative); a step panel with that step's prep, notes, pass or not-passed shortcuts, and tools; tabs reduced to Journey, Documents, Contacts, Timeline. Before applying, the Preparing step's panel is today's workshop (analysis, resume, cover letter).
- **Applications list**: "Needs you" first (at most five, ordered by offer deadline, interview within three days, reply owed, follow-up due, ready to send), then the table grouped by stage in journey order with Closed and Did not apply collapsed. Columns: company and role, stage with current step, next action, last activity, fit, documents.
- **Tools** attach to a step or stage and appear only where they apply: email writer (reply, confirm, thank-you, follow-up, decline, feedback request), interview prep per round, company research, negotiation and offer comparison, a short note on what to learn after a rejection.

## Measuring

AI runs already record each companion call. Planned: record whether each proposal was applied, partly applied, discarded or undone, and show per feature which one gets corrected most, so the lowest-CAIR touchpoint is visible and fixed first.

## Slices

1. **Built**: journey model and operations, propose/apply/undo API, `track-application` skill, companion card on the Overview tab of sent applications, tests (`scripts/test-journey.ts`).
2. **Built**: editable proposal items (fix a date, a step or the next action in place; Apply waits until every kept item is valid); a journey-aware Overview: the hero leads with a booked step still ahead, else the next action (overdue ones flagged), and falls back to the status view (`journeyFocus` in `src/lib/journey.ts`); a "Steps done" stat; the header bar in journey stages (Preparing, Applied, Interviewing, Offer) with stage labels. **Planned**: the companion on applications not yet sent, which must go through the existing mark-as-applied flow so the resume is finalized.
3. **Built**: Applications list in journey order by default (stage, then next due date, then newest), stage labels with the outcome ("Closed · Rejected"), a Next column from the journey, and a "Needs you" queue (`src/lib/needsYou.ts`, tested in `scripts/test-needs-you.ts`). **Planned**: collapsed Closed and Did not apply groups.
4. Step panel with tools; interview rounds and journey steps become one list.
5. Global "What happened?" box with application matching; autonomy settings; correction metrics.
6. CLI parity: `apps log <id> "…"`, `apps journey <id>`.

## Constraints

- Local only; AI runs through the user's own Claude or Codex CLI.
- The user is the author: AI proposes, "no change needed" is normal, documents are generated only on request, nothing is sent automatically.
- Every field stays editable by hand when the AI is unavailable.
- Never put a real person's details in code, examples or this repo.
