---
target: application page, Applying phase
total_score: 29
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
target_identity: "file:src/app/applications/[key]/workspace.tsx"
target_fingerprint: "sha256:011598284c9879dbab6e2a662d78ebcc4724c32632c24e9cad2edff8dae6d645"
target_path: src/app/applications/[key]/workspace.tsx
timestamp: 2026-10-21T11-14-20Z
slug: src-app-applications-key-workspace-tsx
---
Method: dual-agent (A: design review · B: detector + browser)

# Critique 5: application page, Applying phase incl. sent-and-waiting (after slice 1e)

Heuristics: 1:3 2:3 3:2 4:3 5:3 6:3 7:3 8:3 9:3 10:3 = 29/40 (Good-low). Trend 25 -> 27 -> 30 -> 31 -> 29. The drop is one new P0 (header menu painted under content), fixed right after this run: .anim-rise/.anim-fade fill-mode both -> backwards (globals.css) and header relative z-30; hit test confirms all menu items clickable on both pages.
Detector: CLI clean (regex-only for tsx). Overlay fit 3 / preview 3 / send 1 / cover letter 1 / samba 1 (was 3/4/2/6/4). Left: avatar 3.6-3.8:1 (decorative), chat bubble ~93ch (ChatMarkdown/EditorChat), nested run-log details in chat.

Previous issues: Sent repetition resolved; wording resolved (one "you applied" left); cover letter layout/empty/disabled reason resolved; small text and contrast resolved; menus Escape resolved; outcome fallback resolved; Badge 12px resolved; Set aside/Skip undo partly (blocked by P0, now fixed).

Priority issues:
- [P0, fixed after run] Header menu under content.
- [P1] After-sending banner: "Follow up in N days" title vs only "Start interview prep" button; "you applied". clarify.
- [P1] Three ways to say They replied (button, menu, What happened). distill.
- [P2] After-sending overview still a dashboard; Interview rounds tile and Jump back in grid (slice 2). distill.
- [P3] Wording drift: chat "Send" vs Send step, "status menu" vs ⋯, CV vs resume, "Tracker row #79", Withdraw stored as Rejected. clarify.
