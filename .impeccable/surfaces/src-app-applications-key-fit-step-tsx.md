---
version: 1
slug: "src-app-applications-key-fit-step-tsx"
primary_target: "src/app/applications/[key]/fit-step.tsx"
related_targets: ["src/app/applications/[key]/workspace.tsx","src/app/globals.css"]
---

# Fit step (application workspace, step 1)

Scope: the Fit step at /applications/[key]?step=fit, plus the folder-tab and Ask styles it shares in globals.css. Mode: Operate.
Audience and task: one job seeker deciding whether a posting is worth pursuing and what to tell the AI about gaps. Reads the verdict, scans the keyword index, then works the requirement list one standing at a time; asks the Fit AI on the right.
Constraints: DESIGN.md ("The Case File") is the source of truth; the user chose it over the earlier violet "bright modern cards" brief on 2026-10-27, which this brief replaces. Dark is the daily scene; light must hold. Order: verdict sheet (with the Requirements / Job description switch), keyword index sheet, folder tabs on the requirements sheet; sticky Fit AI right.

## Direction contract

THESIS: A case file read at a desk: the verdict first, the posting's words as an index, then one folder per standing with ruled rows inside. It refuses chips, stat tiles, cards per row and pills.
OWN-WORLD: DESIGN.md as written: walnut ground, paper sheets with the sheet shadow, cinnabar for actions only, moss / straw / crimson only for standing and always with a word or icon, Literata for h2 and numerals, system sans for working text, 5/7/9px corners.
STORY: The candidate reads "Partial fit, 5 of 25 must-haves backed" with its ledger, glances at the 27 words not in the resume, opens the crimson Gaps folder, reads each row's evidence behind its rule, and presses Ask on the one they can speak to.
FIRST VIEWPORT: Verdict sheet (display type in its standing colour, muted must-have sentence, 6px ledger with 2px corners); keyword sheet with a 7.5rem term column and dot-separated index lines; folder tabs (label over serif count) standing on the requirements sheet.
FORM: Folder tabs are the signature: unselected tabs sit 5px lower on a half-mixed fill with the standing edge at half strength; the open tab takes the sheet fill and covers the sheet's top rule. Rows: must-have dot / nice-to-have ring, 15px title, evidence behind a 1px strong rule, outline Ask button on the right. Motion: settle 420ms with a 6px rise out of a 2px blur, rows staggered 45ms and capped at eight, ledger inks once at 600ms; reduced motion collapses all of it.
FINISH: verified in both themes at 1440 and 390; make check and make test pass.
