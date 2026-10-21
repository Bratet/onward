# Two phases: Applying and Interviewing

Status: agreed 2026-10-20. Slice 1 is built.

## Thesis

A job search has two phases, and they need different tools.

- **Applying** is your move: from the posting until the company answers. You prepare the application, send it, wait and follow up.
- **Interviewing** is their process: from the company's first reply until a decision. Screening calls, tests, interviews, the offer.

The line between them is **the company selecting you**, not sending. Waiting and following up still belong to Applying, because nobody has picked you yet. Names are from the candidate's side: "I'm applying to X", "I'm interviewing with Y".

Closed is not a third phase. It is how either phase ends.

## The model

`applications.md` keeps its statuses; only their mapping to phases is new (`src/lib/applicationPhase.ts`).

| Phase | Statuses | Where it stands |
|---|---|---|
| Applying | Preparing | Preparing |
| | Applied | Sent, waiting |
| | Discarded, SKIP | Closed: did not apply |
| | Rejected, no interviews logged | Closed: rejected on the application |
| Interviewing | Responded, Interview | Interviews |
| | Offer | Offer |
| | Rejected, interviews logged | Closed: rejected after interviews |

## What each phase holds

**Applying**
- Prepare: posting, fit analysis, resume, cover letter, form answers, a referral message
- Send: one clear "I sent it" step that records the date and freezes the documents
- Wait: day count and follow-ups
- Ends: selected (moves to Interviewing), or closed as skipped, no reply or rejected

**Interviewing**
- The company's rounds, prep for each round, the people met, replies and thank-you notes, the offer and negotiation
- What was sent stays visible, read-only
- Ends: offer accepted or declined, rejected after interviews, withdrew

## On screen

- Header: a two-part phase bar, `Applying ── Interviewing`, on every application, with the current step inside each phase and one primary action that moves forward: "Mark as sent" while preparing, "They replied" while waiting.
- Applications list: phase first: All · Interviewing · Applying · Closed, then a follow-up filter.
- Each phase gets its own tabs, with no tool shared across the line.
- Opening the Applying tools on a selected application says so: changes there don't change what they received.

## Applying page brief (shaped 2026-10-21, after a critique scored it 25/40)

- **Job:** one person preparing one application at their desk. Success is sending it with the right documents, without having to wonder what's left.
- **Two steps instead of three:** **Workspace** (analysis, resume and AI together) and **Send**. The fit analysis and the resume preview share the left pane as two tabs. The AI chat is on the right, with Clarify (analysis; never edits the resume), Tailor (resume) and YAML tabs. Both chat histories are kept as they are.
- **One progress indicator:** the header's phase strip. The Applying segment holds the two steps as clickable tabs: Workspace is checked once the resume is finalized, and Send stays locked until then. Interviewing shows "Once they reply". The status badge, the standing line and the hint paragraphs go away.
- **One filled button per screen:**
  - Workspace: "Finalize resume" while there are changes, then "Continue to Send".
  - Send: "I sent it".
  - The header no longer has a send button while preparing.
- **Send step:**
  1. "Prepare what they ask for": compact rows for the cover letter, email and LinkedIn message, each showing its state.
  2. "Send it": a checklist (resume finalized and up to date, the letter if the posting asks for one, where to apply, any pending AI edit) shown inline instead of a browser confirm dialog. A single Open PDF with a ⋯ menu, an optional note, and "I sent it".
  - The seven-status form leaves Applying.
- **Polish:**
  - Labels at least 12px and no fading of a whole box.
  - A static "Next" in place of the endless glow.
  - Analysis text capped at about 70 characters per line.
  - "AI" spelled consistently.
- **Out of scope:** the Interviewing page's tabs (slice 2), and the chat component's internals.

## Slices

1. Model, header phase bar and crossing action, list filter by phase, copy. **Built.**
1b. The Applying page brief above: Prepare and Send steps inside the phase strip, the merged workspace, the Send checklist, one filled button per screen, contrast fixes. **Built 2026-10-21.**
1c. After a second critique (27/40), also built 2026-10-21:
   - Send leads in one centred column, with email and LinkedIn below it as optional.
   - The cover letter appears only in the checklist.
   - While preparing, the header's status menu is replaced by ⋯ with Set aside / Skip, and the confirm dialog is gone.
   - Both panes use one keyboard-friendly tab component (`PaneTabs`).
   - YAML is "Edit source" on the resume preview.
   - The main button heads the left pane.
   - Warn text and the active nav link meet 4.5:1 contrast.
1d. After a third critique (30/40), also built 2026-10-21. The user confirmed the shaped plan that day.
   - The after-sending page and the cover letter use `PaneTabs` too.
   - The chat records how a tailoring proposal was settled ("Accepted 7 of 9 changes").
   - "Applied" shows as "Sent" everywhere (`statusLabel`); `applications.md` keeps "Applied".
1e. Plan confirmed by the user on 2026-10-21, before any code; built the same day, one command at a time. It covers the open items from the 31/40 critique:
   - **Distill:** the after-sending page states "Sent" once, in the strip. The banner leads with the follow-up. The companion's status heading, the single-step chip and the "Since you applied" tile go. The status select after sending becomes ⋯ with They replied, Rejected, Withdraw and Undo sent.
   - **Clarify:** the timeline says "Marked as sent" and "Now Sent". SKIP shows as "Skipped" and Discarded as "Set aside". Older tailoring replies say "Settled before outcomes were recorded".
   - **Layout:** the cover letter step matches the resume workspace (preview and Finalize on the left, AI on the right). The disabled Finalize explains itself, and an empty letter says "No draft yet".
   - **Harden:** Set aside and Skip get an Undo banner, and the ⋯ menus close with Escape.
   - **Polish:** badges are 12px, and the cover letter's quick prompt, placeholder and helper text meet 4.5:1 at 12px.
2. Tabs per phase: the sent-and-waiting page becomes Applying (Follow up · What you sent · head-start prep); the Interviewing page leads with prep and messages. Outreach splits into a referral ask (Applying) and replies (Interviewing).
3. Visual identity per phase (badge and accent), and the Send step with its checklist.

Rounds as first-class steps overlap with the stopped companion work (`application-journey.md`) and are out of scope unless asked.
