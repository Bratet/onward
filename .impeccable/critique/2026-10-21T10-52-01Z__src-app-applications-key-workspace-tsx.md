---
target: application page, Applying phase
total_score: 31
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:src/app/applications/[key]/workspace.tsx"
target_fingerprint: "sha256:0987e5c2a3f43b7590e6313e32dd0657fdf141729a036d51dcf6ddfc1f7cc609"
target_path: src/app/applications/[key]/workspace.tsx
timestamp: 2026-10-21T10-52-01Z
slug: src-app-applications-key-workspace-tsx
---
Method: dual-agent (A: design review · B: detector + browser)

# Critique 4: application page, Applying phase (after slice 1d)

Heuristics: 1:3 2:3 3:3 4:3 5:4 6:3 7:3 8:3 9:3 10:3 = 31/40 (Good). Trend 25 -> 27 -> 30 -> 31.
Detector: CLI clean. Overlay fit 3 / preview 4 / send 2 (1 false positive: Chrome extension banner) / cover letter 6 / samba 4. Real: cover-letter quick prompt 4.3:1 (cover-letter-task.tsx:247), placeholder 4.4:1 (:249/258), helper 10px (:266); Badge 11px (primitives.tsx:38); record.tsx 11px meta; avatar 3.6-3.8:1.

Previous issues: tab styles resolved; tailoring outcome partly (new proposals only); Sent vs Applied partly (timeline badge, "Marked as applied", SKIP); main button deliberate; sent page status repetition not (about 6 times); Set aside/Skip undo not.

Priority issues:
- [P1] After-sending page repeats Sent ~6 times (record.tsx PostHome, JourneyCompanion, header select). distill.
- [P1] Applied/Sent incomplete: record.tsx timeline badge, applicationRecord "Marked as applied", SKIP/Discarded labels. clarify.
- [P2] Cover letter step mirrors the resume workspace; disabled Finalize without reason; "Draft saved" on empty letter; 10-11px text; contrast near-misses. layout.
- [P2] Set aside / Skip no undo (header.tsx). harden.
- [P3] Older tailoring turns' generic outcome; Badge 11px. polish.
