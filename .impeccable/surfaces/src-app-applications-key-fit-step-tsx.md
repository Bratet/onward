---
version: 1
slug: "src-app-applications-key-fit-step-tsx"
primary_target: "src/app/applications/[key]/fit-step.tsx"
related_targets: ["src/app/applications/[key]/workspace.tsx","src/app/globals.css"]
---

# Fit step (application workspace, step 1)

Scope: the Fit step at /applications/[key]?step=fit, plus the folder-tab and Ask styles it shares in globals.css. Mode: Operate.
Audience and task: one job seeker deciding whether a posting is worth pursuing and what to tell the AI about gaps. Reads the verdict, works the requirement folders one standing at a time, checks the keyword index in its own folder, and asks the Fit AI on the right (a bottom sheet below lg).
Constraints: DESIGN.md ("The Case File") is the source of truth; the user chose it over the earlier violet "bright modern cards" brief on 2026-10-27, which this brief replaces. Dark is the daily scene; light must hold. Order (since 2026-10-29, the user's choice): verdict sheet; then the folder strip (Gaps, Eligibility, Related, Backed, Keywords) with the Requirements / Job description switch at its right end; the requirements sheet under it; sticky Fit AI right.

## Direction contract

THESIS: A case file read at a desk: the verdict first, then one folder per standing with ruled rows inside, and the posting's words as the last folder. It refuses chips, stat tiles, cards per row and pills.
OWN-WORLD: DESIGN.md as written: walnut ground, paper sheets with the sheet shadow, cinnabar for actions only, moss / straw / crimson only for standing and always with a word or icon, Literata for h2 and numerals, system sans for working text, 5/7/9px corners.
STORY: The candidate reads "Partial fit, 5 of 25 must-haves backed" with its ledger, opens the crimson Gaps folder right under it, reads each row's evidence behind its rule (what is missing apart, under "Not shown"), presses Ask on the one they can speak to, and opens the Keywords folder to see the 27 words not in the resume.
FIRST VIEWPORT: Verdict sheet (display type in its standing colour, muted must-have sentence, 6px ledger with 2px corners); folder tabs (label over serif count) standing on the requirements sheet, the view switch beside them; the first requirement rows.
FORM: Folder tabs are the signature: unselected tabs sit 5px lower on a half-mixed fill with the standing edge at half strength; the open tab takes the sheet fill and covers the sheet's top rule. Rows: must-have dot / nice-to-have ring, 15px title, evidence behind a 1px strong rule, Ask at the right resting as its icon with a mouse and opening to its words on hover or focus. Keywords folder: a 9.5rem term column and dot-separated index lines. Motion: settle 420ms with a 6px rise out of a 2px blur, rows staggered 45ms and capped at eight, ledger inks once at 600ms; reduced motion collapses all of it.
FINISH: verified in both themes at 1440 and 390; make check and make test pass.
