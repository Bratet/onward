---
version: 1
slug: "src-app-applications-key-cover-letter-task-tsx"
primary_target: "src/app/applications/[key]/cover-letter-task.tsx"
related_targets: ["src/app/applications/[key]/documents-step.tsx","src/app/applications/[key]/workspace.tsx","src/lib/coverLetterEditor.ts","src/components/AiPanel.tsx"]
---

# Cover letter workspace

Scope: Documents → Cover letter in an application. Mode: Operate.
Task: draft from the finalized resume, revise with AI or by hand, review, and finalize the PDF. Preserve existing letters, chat history, autosave conflicts, file actions, and both themes.
Constraints: DESIGN.md ("The Case File") is the source of truth since 2026-10-27; this brief replaces the earlier violet "extend the Resume implementation" brief. The AI pane is built from the shared parts in src/components/AiPanel.tsx, the same ones the Fit, Resume, form answers, email and LinkedIn AIs use.

## Direction contract

THESIS: Writing a cover letter feels like editing the Resume: one document sheet and one AI sheet, with a clear draft-to-PDF state and one primary action (Finalize letter).
OWN-WORLD: DESIGN.md as written: walnut ground, paper sheets, cinnabar only for actions and the current place, moss / straw / crimson only for standing, Literata for sheet titles, system sans for working text, 5/7/9px corners.
STORY: The candidate clicks Draft cover letter in the AI pane, sees the letter in the left preview, keeps or undoes the AI draft in the review card under the reply, then finalizes the saved letter. Optional instructions typed before clicking are included; no request is prefilled.
FIRST VIEWPORT: Aligned document and AI sheets, 1.25:1 at desktop and stacked at mobile. Preview / Edit text in the document header; word count and Finalize letter in its footer. The AI sheet: shared header (title, what it uses, New chat, Chat settings), left-aligned empty state with an outlined Draft cover letter start button, and an empty shared composer with an arrow send control. Drafting stays disabled until the resume is finalized; existing letters open with refinement prompts that fill the composer instead. Recipient details behind a disclosure.
FORM: Shared AI panel parts; review is a sheet-shade card with Keep draft / Undo as secondary buttons; a pending review reads in straw ("to confirm"), never cinnabar.
FINISH: verified in both themes at 1440 and 390; make check and make test pass.
