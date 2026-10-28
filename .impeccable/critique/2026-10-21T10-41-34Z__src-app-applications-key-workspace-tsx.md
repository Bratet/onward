---
target: application page, Applying phase
total_score: 30
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:src/app/applications/[key]/workspace.tsx"
target_fingerprint: "sha256:cb1ecaa5a3e35276cc976090dfb81b80dcba67c8b9dc7db55ab98bd69d917f16"
target_path: src/app/applications/[key]/workspace.tsx
timestamp: 2026-10-21T10-41-34Z
slug: src-app-applications-key-workspace-tsx
---
Method: dual-agent (A: design review · B: detector + browser)

# Critique 3: application page, Applying phase

Heuristics: 1:3 2:3 3:3 4:2 5:4 6:3 7:3 8:3 9:3 10:3 = 30/40 (Good). Trend 25 -> 27 -> 30.
Detector: CLI clean. Overlay fit 3 / preview 5 / send 1 / samba 4 (was 6/6/3/6). Gone: nav link, Next pill, placeholder, warn badge contrast. Left: avatar 3.6:1 (aria-hidden, large text - low), Badge 11px (primitives.tsx:38), record.tsx 11px meta, chat bubble ~93ch, nested details in chat.

Previous issues: Send hierarchy resolved; status bypass resolved; tab styles partly (sent page + cover letter still own tabs); main action partly (in tab row, visible on Fit); small text/stale chat partly.

Priority issues:
- [P1] Tab styles still differ on sent page (post-workspace.tsx:118) and cover letter (cover-letter-task.tsx:220). Fix: move to PaneTabs with badge support. polish.
- [P1] Chat proposal outcome ambiguous: "accept or reject" + "has been reviewed". Fix: record accepted N of M / rejected and show it. clarify.
- [P2] Sent vs Applied vocabulary (next-steps-panel.tsx footer vs select). clarify.
- [P2] Main button in the tab row acts on a resume not visible on Fit. Fix: into resume card header, or name the object. layout.
- [P2] Sent page repeats status three times; Badge 11px floor. distill, typeset.
Minor: Set aside/Skip no undo; details menus lack Escape/menu semantics; "once the YAML renders" empty-state copy; "Role" capitalised in sample prompt; Prepare done+here share a visual.
