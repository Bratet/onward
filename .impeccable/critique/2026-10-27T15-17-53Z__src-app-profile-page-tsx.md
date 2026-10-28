---
target: profile page /profile?src=general-en
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:src/app/profile/page.tsx"
target_fingerprint: "sha256:b8e5265890c60cc026c834dbdee3bde4845c34202cb7a154b552145ca8032979"
target_path: src/app/profile/page.tsx
timestamp: 2026-10-27T15-17-53Z
slug: src-app-profile-page-tsx
---
Method: dual-agent (A: CritiqueDesignReview · B: CritiqueDetectorEvidence)

## Design Health Score
| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | Save looks identical clean/dirty; Unsaved badge scrolls away |
| 2 | Match System / Real World | 3 | 1170ms readout, `general` badge, raw path in missing-file state |
| 3 | User Control and Freedom | 3 | No revert-to-saved; master overwritten with no backup |
| 4 | Consistency and Standards | 2 | Three tab idioms; code diverges from DESIGN.md |
| 5 | Error Prevention | 3 | Save always enabled, rewrites file+PDF unchanged |
| 6 | Recognition Rather Than Recall | 2 | Health only in colour dots/tooltips; shortcuts tooltip-only at lg |
| 7 | Flexibility and Efficiency | 3 | [INFERENCE] Alt shortcuts use event.key, likely broken on macOS |
| 8 | Aesthetic and Minimalist Design | 2 | Title x3, rainbow folders, count chips, empty chat half-screen |
| 9 | Error Recovery | 3 | Raw absolute path in missing-file state |
| 10 | Help and Documentation | 2 | No YAML schema/rule help; shortcut help tooltip-only |
| Total | | 26/40 | Acceptable |

## Design Specificity Verdict
Structure authored (folder tabs joining sheet, per-language dots, parity badge, consequence copy); paint generic violet SaaS. Code drift vs DESIGN.md: violet accent (globals.css:20), Schibsted Grotesk sans, no Literata, seven positional folder hues (globals.css:341-347) violating Meaning Rule, section-count chips (shell.tsx:226), Save text uses --color-bg not on-solid, two solid primaries.
Detector: CLI 9 advisory design-system-font-size (10/11px) in shell.tsx:224,364; profile-dialog.tsx:119,138; EditorPane.tsx:253,316,370; ErrorNotice.tsx:17,21. Browser 5: cream palette (false positive: intended light paper), undersized EN/FR labels x2, low-contrast "EN / FR in step" (light), tiny "AI edits the current buffer". Overlay headless only; light theme only.

## Priority Issues
- [P1] Folder-label icons invisible in dark (1.39:1); color-mix(in oklch) hue drift (globals.css:333-334). Fix: per-theme --label-bg/--label-fg or muted icon. /impeccable colorize
- [P1] Identity contradicts DESIGN.md (violet, Schibsted, no Literata, decorative hues collide with standing tones). Fix: choose source of truth; restore or rewrite DESIGN.md. /impeccable colorize, /impeccable typeset
- [P1] Master save: no safety net, no clean/dirty state. Fix: "Save Master EN" primary only when dirty, Revert to saved, keep last N versions. /impeccable harden
- [P2] Title repeated 3x, metadata pushes editor ~330px down, page double-scrolls. Fix: merge header bands, faint-dot index line, drop ms/general, size editor to remaining space. /impeccable distill, /impeccable layout
- [P2] Keyboard/a11y: no arrow keys in tablist/radiogroup, focus lost on Delete profile, new dialog focuses Close, colour-only dots. /impeccable audit, /impeccable harden

## Persona Red Flags
- Alex: Option+digit types glyphs [INFERENCE]; "Ctrl+S" on Mac; pane resets to Chat on every switch (key={src}).
- Sam: 1.39:1 dark icons; colour-only dots; focus loss in dialog; inconsistent focus rings.
- Riley: parity "in step" while EN 2pp / FR 3pp; Save with no changes rewrites; 390px folder strip overflows with no cue.

## Minor Observations
capitalize mangles pane tab labels; "Rename or delete" omits roles; fill bar on Master; native window.confirm; light mode stronger than dark.

## Questions to Consider
Positional folder colour worth keeping? Land on editor instead of empty chat? Master edits more deliberate (versions, diff, commit)?
