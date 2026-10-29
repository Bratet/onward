---
target: application workspace
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:src/app/applications/[key]/workspace.tsx"
target_fingerprint: "sha256:ea63924b759e93d69e6379cf2f8d71fa8588e1bc939c17e87333a85af94f5ade"
target_path: src/app/applications/[key]/workspace.tsx
timestamp: 2026-10-28T16-49-45Z
slug: src-app-applications-key-workspace-tsx
---
Method: dual-agent (A: CritiqueWorkspaceDesign3 · B: CritiqueWorkspaceDetector3)

Target: src/app/applications/[key]/workspace.tsx and step components, plus AiPanel.tsx, EditorChat.tsx, globals.css. Live on a Preparing application (Strong fit) and a Skipped one (Partial fit), dark and light, 1440 and 390, read-only.

## Design Health Score
| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Disabled Chat settings actions (opacity 0.4) don't say why |
| 2 | Match System / Real World | 3 | Stored fit evidence in third person; Fit composer labelled "Message CV editor agent" |
| 3 | User Control and Freedom | 3 | Keep/Undo, Reopen, Undo sent, New chat confirm; mobile sheet Esc/focus verified |
| 4 | Consistency and Standards | 2 | Six AI panels start work six ways; only Fit uses a mobile sheet |
| 5 | Error Prevention | 3 | Finalize locked during review; Send warns without blocking |
| 6 | Recognition Rather Than Recall | 3 | Email/LinkedIn draft action is an icon-only arrow; undo-send via "the ⋯ menu" |
| 7 | Flexibility and Efficiency | 2 | No step shortcuts; second Ask replaces composer text |
| 8 | Aesthetic and Minimalist Design | 3 | Keywords sheet above requirements; "Skipped" said three times |
| 9 | Error Recovery | 3 | Plain errors; Fit error shows raw fit.error |
| 10 | Help and Documentation | 2 | Step purposes tooltip-only |
| **Total** | | **27/40** | **Good (low end)** |

## Design Specificity Verdict
Authored on Fit and now on Documents (folder tabs, ruled rows). The AI pane (~40% width, mostly empty on Documents) is category-generic. Detector: source scan clean (exit 0); URL scans only cream-palette (FP, committed stone light theme), flat-type-hierarchy (14/17/18 scale, advisory), straggler (hint lines). Measured: no text <12px, no 390 overflow, no console errors; only the 28x28 back link under 32px; composer focus is a thin 1px ring; mobile Fit dialog modal with focus return verified; three textareas without aria-label. Overlay injected in the assessor's headless tab only.

## Priority Issues
1. [P1] Six AI panels start work differently: email/LinkedIn draft on empty send behind an icon-only arrow; cover letter empty state has no prompts; label drift ("CV editor agent", "companion"). Fix: AiComposer intent chat|brief with a labelled secondary "Draft it"; starter as prompt; "Message {panel title}". /impeccable clarify
2. [P1] Fit buries requirements: keywords sheet 250px above them; first row 748px (1440) / 1302px (390) down; view switch separated from its panel. Fix: switch above the requirements panel; keywords as a folder or below; collapse when nothing missing. /impeccable layout
3. [P2] Mobile AI inconsistent: Fit sheet (auto-focus raises keyboard) vs AI stacked 787-945px down elsewhere, copy says "on the left". Fix: shared sheet for all step AIs below lg; no auto-focus on coarse pointers; "below" copy. /impeccable adapt
4. [P2] 32px tap targets at 390 (34 controls; back link 28px). Fix: max-sm:min-h-11 on phase-step, ask-button, toolButton, aiHeaderButton, header links. /impeccable adapt
5. [P2] Evidence voice on stored reports: third person; negative lines under "What you can point to". Fix: route "No…/does not state" lines to a muted "Not shown" label; offer a fit re-run for old reports. /impeccable clarify

## Persona Red Flags
- Sam: 12 identical Ask names without the requirement; "Message CV editor agent"; tooltip-only step purposes; requirements are Tab stop 19, no skip link.
- Casey: Continue at the top out of thumb reach; verdict ~480px down; sheet auto-focus raises keyboard; 32px controls.
- Alex: no step shortcuts; second Ask replaces composer text; no batch ask; Ask hidden until hover.

## Minor Observations
Hidden Ask column reserves ~165px per row; "In your resume 14" wraps; sans tabular "11"; "Edit text" and "Write it myself" duplicate; Form questions double heading, placeholder reads as content, "Form questions" vs "Form answers AI"; "Optional" vs "Not started" tab words; "you send it yourself" twice; "Partial" not in DESIGN verdict vocabulary; Skipped badge reads as Interviewing: Skipped; outlined keyword boxes in the posting view.

## Questions to Consider
1. Is Keywords a sheet above the requirements, or a fourth folder?
2. Should Documents be a step, or only reachable from Send's checklist links?
3. Six assistants with six names, or one that knows which sheet is open?
