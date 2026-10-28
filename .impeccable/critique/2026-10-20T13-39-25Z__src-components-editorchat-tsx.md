---
target: chat component
total_score: 20
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 3
target_identity: "file:src/components/EditorChat.tsx"
target_fingerprint: "sha256:938ba3c701258e8385e39604298d56b2b0fed375fddc42a7586610758d99c5f6"
target_path: src/components/EditorChat.tsx
timestamp: 2026-10-20T13-39-25Z
slug: src-components-editorchat-tsx
closed: true
---
Method: dual-agent (A: design review · B: detector + browser overlay)

## Design Health Score: 20/40 (Acceptable)
| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 2 | Reply streams off-screen; no screen-reader announcement |
| 2 | Match System / Real World | 2 | "buffer updated", "no YAML changes", "Stream responses" |
| 3 | User Control and Freedom | 2 | New chat wipes history without confirm; composer locked while proposal pending |
| 4 | Consistency and Standards | 2 | Two tab bars with different names; placeholder in user's voice; wrong helper copy on resume chat |
| 5 | Error Prevention | 1 | Tailoring auto-starts; phrase routing; edits during a run get overwritten |
| 6 | Recognition Rather Than Recall | 3 | Decent hints; Edit & rerun hover-only |
| 7 | Flexibility and Efficiency | 2 | Focus lost after reply; no Esc/accept shortcuts; can't queue next message |
| 8 | Aesthetic and Minimalist Design | 1 | Three toolbars, per-reply badges, 10px text, token-fragment transcripts |
| 9 | Error Recovery | 3 | Good error notice; partial text discarded; HTML 500 shows as JSON parse error |
| 10 | Help and Documentation | 2 | Tiny mode-dependent footer hints |

## Design Specificity
Generic chat bubbles under ~200px of toolbars; product-specific proposal/review features bolted on. Nothing says "you are the author". Detector: CLI clean (0); overlay 7 in-chat findings (10px toolbar text x3, faint-grey contrast 3.5-3.8:1 x3, 10px footer), 11 page-level (accent red 3.8:1 contrast).

## Priority Issues
- [P0] New replies invisible: smooth scrollIntoView per chunk scrolls the window, chat stays at top (EditorChat.tsx:115-118). Fix: container scrollTop, stick-to-bottom only when near bottom, Jump-to-latest pill. /impeccable harden
- [P0] Tailoring starts unasked: autoStart on Resume tab (workspace.tsx:597, EditorChat.tsx:120-126) + phrase routing (chatSkills.ts:25). Fix: explicit Tailor action. /impeccable harden
- [P1] User edits lost during a run: setText overwrites, stale proposal.before (EditorChat.tsx:330-341). Fix: lock editor or diff against sent text. /impeccable harden
- [P1] Replies unreadable: raw markdown (:507), token-per-row transcript (workspace.tsx:325, :267), missing separator between segments, no break-words. /impeccable typeset + distill
- [P1] Keyboard/SR basics: textarea disabled -> focus lost (:594), IME Enter (:474,:587), no role=log/live region, hover-only Edit & rerun (:512), 10px text + faint contrast. /impeccable audit

## Persona red flags
Alex: focus loss, no shortcuts, can't type while running. Sam: no live region, invisible controls, colour+10px diff. Job seeker: auto-tailoring, unreadable diff, can't discuss a proposal before accepting.

## Minor
localStorage write per chunk; index keys; 120-line silent diff cutoff; career-ops- storage prefix; New chat no confirm; route finally can throw after abort.

## Bug inventory
B1-B16 as listed in chat report.
