---
target: application page, Applying phase
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:src/app/applications/[key]/workspace.tsx"
target_fingerprint: "sha256:b8d6a399ea900fe96640b6a9a927cb704a869b76e0fbf234f143c90fd1fa901b"
target_path: src/app/applications/[key]/workspace.tsx
timestamp: 2026-10-20T17-41-56Z
slug: src-app-applications-key-workspace-tsx
---
Method: dual-agent (A: design review · B: detector + browser)

# Critique: application page, Applying phase (steps 1-3)

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 2 | Seven progress/status signals that disagree; Applying bar half-full on day one; chevrons track the viewed tab, not work |
| 2 | Match System / Real World | 3 | Sending has three names: Mark as sent / Mark as applied / Applied |
| 3 | User Control and Freedom | 3 | One click on Mark as sent in step 1 skips the flow |
| 4 | Consistency and Standards | 2 | Chevron wizard vs segmented tabs; PDF trio on two steps; "A.I Companion" |
| 5 | Error Prevention | 2 | Mark as sent brightest on every step; only guard is window.confirm |
| 6 | Recognition Rather Than Recall | 3 | Hints say "continue ... above" |
| 7 | Flexibility and Efficiency | 2 | Two levels per message; gaps not visible while tailoring |
| 8 | Aesthetic and Minimalist Design | 2 | ~470px chrome before work; instruction repeated 3x on step 1 |
| 9 | Error Recovery | 3 | Good notices, conflict reload, retry |
| 10 | Help and Documentation | 3 | Plenty of hints, arguably too many |
| Total | | 25/40 | Acceptable |

Design specificity: half authored. Phase model and copy are Onward's; visual layer is generic SaaS (soft-blue boxes, icon tiles, stock chevron wizard, 2x2 cards, gradient bar).
Detector: CLI clean (0). Browser overlay 15/11/7 on steps 1/2/3; six low-contrast every view, worst in new phase bar (header.tsx:67 2.3:1, header.tsx:69 3.7:1); nav link and step number 4.3:1; 7 line-length 94-106ch on step 1 AI prose. False positives: avatar initials, nested-cards (chat bubble, run log).

Priority issues:
- [P1] Step 3 order and button placement (next-steps-panel.tsx:99-205): Mark as applied first and "Suggested next"; PDF trio outweighs the decision; stray back link; oversized cards. Fix: Prepare what they ask for rows, then Send it block with checklist, one Open PDF + menu, one "I sent it" primary; remove 7-status radio from Applying. layout, distill.
- [P1] Seven progress/status signals in header (header.tsx:62-90, workspace.tsx:530-540). Fix: one-line phase strip; chevrons become Prepare sub-steps with real completion; drop duplicate badge or move status to overflow. distill.
- [P1] Header Mark as sent fights step flow; prose-driven advance (workspace.tsx:515-518). Fix: hide/secondary until finalized; Continue buttons at step end; one filled button per screen. clarify.
- [P2] Chrome eats first screen; step 2 chat at y~580. Fix: 2-row header, sticky steps, delete duplicate chat description (workspace.tsx:581), ~70ch measure on AI prose. layout.
- [P2] Small faint text fails contrast; opacity-60 Interviewing box; infinite glow (globals.css:191). Fix: 12px+ muted labels, no box opacity, static Next tag. polish.

Personas: Alex - two clicks per message, no step shortcuts, PDF trio twice. Sam - 2.3:1 circles, aria-current on viewed tab, 32px controls, window.confirm. Jordan - bright Mark as sent on step 1, half-full bar labelled Sent, Suggested next: Mark as applied before any letter, Reveal in Finder jargon.

Minor: 0-count attention card dominates; Discuss with AI scrolls to visible chat; StatusTask preselects Applied; "sent" six times after sending; "A.I Companion".

Questions: Does the preparing page need the phase bar if chevrons become Prepare sub-steps? Should "I sent it" exist only at the end of step 3? Are steps 1 and 2 one workspace?
