---
target: application workspace
total_score: 28
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:src/app/applications/[key]/workspace.tsx"
target_fingerprint: "sha256:9a402d0b70380dfed710710c0cd95293a5e5e2c2c7d7ac03df53a4f8fd95fca6"
target_path: src/app/applications/[key]/workspace.tsx
timestamp: 2026-10-27T18-05-26Z
slug: src-app-applications-key-workspace-tsx
---
Method: dual-agent (A: CritiqueWorkspaceDesign2 · B: CritiqueWorkspaceDetector2)

Target: src/app/applications/[key]/workspace.tsx and step components, plus AiPanel.tsx and EditorChat.tsx. Live on a Preparing application (Strong fit) and a Skipped one (Partial fit), dark and light, 1440 and 390, read-only.

## Design Health Score
| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Skipped app shows only a small neutral badge; nothing says closed / work kept |
| 2 | Match System / Real World | 3 | AI evidence uses internal terms ("the master", "confirmed guidance") and third person |
| 3 | User Control and Freedom | 3 | Mobile Fit sheet Esc only works with focus inside |
| 4 | Consistency and Standards | 2 | Four tab styles; sheet h2 15/16/17px; 5px vs 7px secondary corners |
| 5 | Error Prevention | 3 | Cover letter composer pre-filled even when no letter asked (cover-letter-task.tsx:101) |
| 6 | Recognition Rather Than Recall | 3 | Resume tailoring silently uses Fit conversation |
| 7 | Flexibility and Efficiency | 2 | No step keys; Continue to Resume primary when Resume done |
| 8 | Aesthetic and Minimalist Design | 3 | Repeated no-evidence placeholder on 8 of 12 gaps |
| 9 | Error Recovery | 3 | Plain errors with Retry/Reload |
| 10 | Help and Documentation | 3 | Step purposes tooltip-only |
| **Total** | | **28/40** | **Good (low end)** |

## Design Specificity Verdict
Authored on Fit (verdict + ledger, index lines, folder tabs, evidence rule); fades after: Documents card grid, boxed form questions, bare email/LinkedIn textarea, Send not a sheet. Detector: exit 0, 1 advisory (PdfPreview.tsx:117 10px). Overlay: flat-type-hierarchy (resume, cover letter, send), nested-cards (cover letter), stragglers, cream-palette (FP). Measured: 0 contrast failures, no 390 overflow, no console errors; 28px targets (Ask, Posting, AI runs, floating Fit AI); AI composer textareas show no focus indicator (focus-within frame style not applying). No user-visible overlay.

## Priority Issues
1. [P1] Floating mobile "Fit AI" button shows at 1440 and is 28px at 390: unlayered .ask-button beats lg:hidden/h-10. Fix: move .ask-button (and check .folder-tab) into @layer components. /impeccable polish
2. [P1] Composer textareas have no visible focus; mobile Fit sheet lacks role=dialog/aria-modal, focus move/trap, scroll lock, document-level Esc. /impeccable harden
3. [P1] Documents and Send off the case-file language: card-grid picker, boxed questions, bare email/LinkedIn textarea (AI sheet 54px shorter), Send not .sheet, h2 15/16/17. Fix: folder-tab picker, sheets, ruled question rows, 17px titles. /impeccable polish
4. [P2] Evidence copy noisy, system voice, third person (fit-step.tsx:284-294). Fix: collapse placeholder evidence, split caveats, fix skill prompt voice. /impeccable clarify
5. [P2] Continue points to a done step; Resume AI hides Fit-chat context; cover-letter starter pre-filled when not asked. /impeccable clarify

## Persona Red Flags
- Sam: sheet not a dialog; composer no focus ring; step purposes tooltip-only.
- Casey: 28px Fit AI and Ask targets; Documents AI below a 70dvh empty preview.
- Alex: 12 identical Ask buttons; no step keys; Continue to a done step; one-shot email/LinkedIn AI.

## Minor Observations
Keyword count wraps alone; rounded-full status/number circles; "Nothing is sent." ambiguous; "consult your masters" jargon; cinnabar keyword marks in posting view; Fit done once report exists; "Once they invite you" on skipped roles; PdfPreview 10px.

## Questions to Consider
1. Why do folder tabs stop at Fit?
2. Does every gap need its own Ask button?
3. Should a skipped application open on a short case note with Reopen?
