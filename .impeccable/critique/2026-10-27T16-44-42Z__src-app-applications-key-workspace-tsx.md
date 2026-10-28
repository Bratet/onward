---
target: application workspace
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:src/app/applications/[key]/workspace.tsx"
target_fingerprint: "sha256:76d1ebe2fbad4053350ce3ca79756f3a9a9f501fc8e7c7edb6b07cb297e53a4c"
target_path: src/app/applications/[key]/workspace.tsx
timestamp: 2026-10-27T16-44-42Z
slug: src-app-applications-key-workspace-tsx
closed: true
---
Method: dual-agent (A: CritiqueWorkspaceDesign · B: CritiqueWorkspaceDetector)

Target: src/app/applications/[key]/workspace.tsx and its step components. Checked live on a Preparing and a Skipped application, dark and light, 1440 and 390, read-only.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Resume status line truncated at 1440 (workspace.tsx:747), detail only in title; Documents never ticks when optional docs are skipped |
| 2 | Match System / Real World | 3 | Plain copy; closed state has three names (Skipped / Closed · Did not apply / Skip this role); jargon "Fit AI", "confirmed Skills", "working copy" |
| 3 | User Control and Freedom | 3 | Per-change accept/reject, Keep/Undo, undo Sent; closed apps lose step navigation (header.tsx:94) |
| 4 | Consistency and Standards | 2 | Four AI interaction models; autosave vs manual Save draft; chat "Send" collides with Send step |
| 5 | Error Prevention | 3 | Finalize disabled with reason, conflicts caught; reason only in title (workspace.tsx:684) |
| 6 | Recognition Rather Than Recall | 3 | Inline evidence, packet links to fixes; step purposes only in tooltips (workspace.tsx:603-606) |
| 7 | Flexibility and Efficiency | 2 | No step-switch key, no arrow keys in doc picker, inert keywords |
| 8 | Aesthetic and Minimalist Design | 2 | 27 keyword chips, 2-3 solid cinnabar buttons per view, cards+pills+box+filled button per requirement |
| 9 | Error Recovery | 3 | Clear conflict copy; resume autosave failure has no Retry (workspace.tsx:670) |
| 10 | Help and Documentation | 2 | Good group hints; explanations hover-only |
| **Total** | | **26/40** | **Acceptable** |

## Design Specificity Verdict
Mixed. Authored frame (walnut ground, sheets, serif headings, phase strip as navigation, serif must-have count + ledger, Send packet). Interchangeable content: keyword chips (fit-step.tsx:96-110), stat-tile standing cards (globals.css:474-492), card-per-requirement with pills (fit-step.tsx:239-243), icon-tile doc picker, centred pill chat empty states. Root cause: .impeccable/surfaces fit-step brief pins the violet "bright modern cards" world; DESIGN.md (restored) forbids chips and stat tiles and makes folder tabs the signature.

Detector: exit 0, 6x design-system-font-size: fit-step.tsx:128 (56px verdict, 2x DESIGN display), :229 (30px), :244 (16px), documents-step.tsx:95/:346 (11px), PdfPreview.tsx:117 (10px). Overlay additionally: Send h2 18 > h1 17; dark placeholders 4.3:1; "Nothing is sent." 12px 4.33:1; "Add question(s)" 3.9:1 (disabled state unconfirmed); 11.2px header monogram; 16px-tall link targets. False positives: cream-palette, stragglers (posting text), flat-type-hierarchy except the Send inversion. Clean: no 390px overflow, focus visible everywhere, no console errors. Overlay ran in a closed headless tab; nothing visible in the user's browser.

## Overall Impression
Workflow design is strong (opens on the most useful step, honest Send packet, confetti peak). Visual layer split: Resume/Documents/Send follow the Case File; Fit is still in the violet card world. Biggest opportunity: Fit.

## What's Working
1. Send step (send-step.tsx:60-124): honest, non-blocking, each line links to its fix.
2. User stays author: one status line, per-change proposal with Accept N / Reject all, Keep/Undo.
3. Place-keeping: URL mirrors step and doc, Back works, steps stay mounted, smart entry step (workspace.tsx:121).

## Priority Issues
1. [P1] Fit follows a superseded design (chips, stat tiles, card per requirement, verdict pill, shaded evidence, filled Ask). Fix: decide DESIGN.md vs fit-step brief; if DESIGN.md: index line, folder tabs on one sheet, ruled rows with must-have dot, evidence rule, outline Ask, 28px display verdict; retire brief via doctor. Command: /impeccable polish (fit-step.tsx, .stand-tabs).
2. [P1] Cinnabar spent everywhere: Continue always solid (workspace.tsx:686) beside pane primaries; accent on selected segment (fit-step.tsx:189), picker icons (documents-step.tsx:90), Draft status (:66), reword type (workspace.tsx:840), form-paste wash (documents-step.tsx:263). ~18 options on Cover letter. Fix: demote Continue when the pane has a primary, sheet-lifted segment, neutral icons/status, icon chat send. Command: /impeccable quieter.
3. [P1] Four AI interaction models (EditorChat; cover-letter chat cover-letter-task.tsx:378-427; form-answers chat documents-step.tsx:284-310; one-shot email/LinkedIn form) plus mixed autosave/manual save. Fix: one AI-panel shell for all six surfaces; autosave messages. Command: /impeccable extract.
4. [P2] Closed applications lose navigation (header.tsx:94) while strip still offers Continue; three names; crimson for a user choice. Fix: show steps when closed, one label, neutral badge. Command: /impeccable clarify.
5. [P2] 390px: strip wraps leaving Send orphaned, role truncated, Fit AI ~3,100px below Ask, picker ~330px, 16px tap targets, 11px labels, 4.3:1 placeholders. Fix: compact stepper below sm, role on own line, AI bottom sheet, segmented/select picker, >=32px link actions, 12px labels, muted placeholders. Command: /impeccable adapt.

## Persona Red Flags
- Alex (power user): no step-switch key; picker lacks arrow keys (documents-step.tsx:84); Resume composer pre-filled "Tailor my resume for this role" every visit; inert keyword chips.
- Sam (accessibility): Requirements/Job description role=tab without aria-controls/tabpanel/arrows (fit-step.tsx:186,206-209); title-only reasons and truncated status; 16px targets. Positive: colour always paired with words; sr-only "(done)".
- Jordan (first-timer): jargon "Fit AI · Adds confirmed Skills…"; Documents looks unfinished when legitimately skipped; two big cinnabar buttons on Resume; Skipped / Did not apply / Set aside indistinct.

## Minor Observations
- Finalized resume chat still says "Press Enter to start tailoring" (workspace.tsx:647).
- "Write a new draft" replaces email text behind one muted line (documents-step.tsx:460).
- h1 17px (DESIGN 18); Send h2 > h1.
- Fully round page-count/fill badges (workspace.tsx:754-756); ledger strokes 8px round (DESIGN 6px/2px); row stagger 35ms (DESIGN 45ms).
- Resume AI hint truncated at 1440 (workspace.tsx:772).
- post-workspace.tsx:45 pushes legacy ?view=prepare&tab=workspace&pane=fit URLs.
- Not checked live: Fit running/error, live tailoring proposal, pending letter review (source only).

## Questions to Consider
1. Is Fit "everything they asked for" or "where you stand and the one gap worth fixing"?
2. Six AI panels, or one Case File assistant that knows which sheet is open?
3. Should the next step in the phase strip be the call to action instead of a separate cinnabar Continue?
