---
target: application page, Applying phase
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:src/app/applications/[key]/workspace.tsx"
target_fingerprint: "sha256:d25d59d4b88aee092c8b2ed3101f2006a027aaa9d80e6d7409b7792cf7d227a3"
target_path: src/app/applications/[key]/workspace.tsx
timestamp: 2026-10-21T10-19-31Z
slug: src-app-applications-key-workspace-tsx
---
Method: dual-agent (A: design review · B: detector + browser)

# Critique 2: application page, Applying phase (Prepare / Send)

Heuristics: 1 Status 3 · 2 Real world 3 · 3 Control 3 · 4 Consistency 2 · 5 Error prevention 3 · 6 Recognition 3 · 7 Efficiency 2 · 8 Minimalist 2 · 9 Recovery 3 · 10 Help 3 = 27/40 (Acceptable, up from 25).

Detector: CLI clean. Overlay 6/6/3 on fit/preview/send (was 15/11/7), Samba 6. Gone: header.tsx:67/69 contrast, overview line-length. Remaining: nav link 4.3:1, Next pill 4.3:1 (header.tsx), placeholder 3.2:1 (next-steps-panel.tsx:235), Applied badge 3.7:1 (warn tokens), 11px meta text (badges, record.tsx). Preview renders (blob img) in the detector's tab.

Priority issues:
- [P1] Send hierarchy inverted: optional list is the wide column, Send it a narrow side card; cover letter appears twice. Fix: checklist + I sent it as the main column, optional email/LinkedIn folded below, drop duplicate letter row. layout.
- [P1] Header status select (8 options) and window.confirm survive during Applying (header.tsx, workspace.tsx patchStatus): unguarded path to Applied. Fix: hide select while preparing, small menu with Discard/Skip only, delete confirm. distill.
- [P2] Three tab styles on one screen (phase-step, seg-nav, chat tablist); chat tablist lacks arrow keys/aria-controls. Fix: one tab component for both panes. polish.
- [P2] Main action floats in a toolbar between strip and panes. Fix: move finalize state + button into the preview pane header or onto the strip's Send step. layout.
- [P3] Tailoring proposal 10-11px text; stale "review each change below" after resolution; locked Send step is a no-op button without aria-disabled. harden.

Minor: two filled buttons on sent page; PHASE_STEPS says Sent vs UI Send; 'Optional' x3; fixed 680px panes on mobile; YAML jargon; fill % unexplained.
