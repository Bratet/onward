---
name: Onward
description: A local case file for each job application, kept in warm ink and cinnabar on paper sheets.
colors:
  cinnabar: "oklch(0.74 0.135 50)"
  cinnabar-wash: "oklch(0.3 0.055 48)"
  moss: "oklch(0.77 0.12 138)"
  moss-wash: "oklch(0.3 0.05 138)"
  straw: "oklch(0.85 0.115 92)"
  straw-wash: "oklch(0.32 0.05 92)"
  crimson: "oklch(0.67 0.17 16)"
  crimson-wash: "oklch(0.29 0.07 16)"
  walnut-ground: "oklch(0.165 0.01 65)"
  sheet: "oklch(0.225 0.013 68)"
  sheet-shade: "oklch(0.26 0.014 70)"
  rule: "oklch(0.305 0.014 70)"
  rule-strong: "oklch(0.4 0.018 72)"
  paper-text: "oklch(0.93 0.014 82)"
  muted-text: "oklch(0.74 0.018 78)"
  faint-text: "oklch(0.6 0.018 75)"
  on-solid: "oklch(0.17 0.015 65)"
typography:
  display:
    fontFamily: "'Literata Variable', 'Iowan Old Style', Georgia, serif"
    fontSize: "28px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.015em"
    fontFeature: "lnum, tnum"
  numeral:
    fontFamily: "'Literata Variable', 'Iowan Old Style', Georgia, serif"
    fontSize: "26px"
    fontWeight: 600
    lineHeight: 1
    fontFeature: "lnum, tnum"
  headline:
    fontFamily: "'Literata Variable', 'Iowan Old Style', Georgia, serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.005em"
  title:
    fontFamily: "'Literata Variable', 'Iowan Old Style', Georgia, serif"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.005em"
  body-strong:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "15px"
    fontWeight: 500
    lineHeight: 1.375
  body:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.625
  label:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.33
rounded:
  bar: "2px"
  md: "5px"
  lg: "7px"
  xl: "9px"
spacing:
  hairline: "3px"
  xs: "6px"
  sm: "12px"
  md: "16px"
  lg: "20px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.cinnabar}"
    textColor: "{colors.on-solid}"
    rounded: "{rounded.lg}"
    padding: "0 14px"
    height: "36px"
  button-secondary:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.paper-text}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "32px"
  button-secondary-hover:
    backgroundColor: "{colors.sheet-shade}"
  button-ask:
    textColor: "{colors.cinnabar}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "28px"
  button-ask-hover:
    backgroundColor: "{colors.cinnabar-wash}"
  sheet:
    backgroundColor: "{colors.sheet}"
    rounded: "{rounded.xl}"
    padding: "16px 20px"
  folder-tab:
    textColor: "{colors.muted-text}"
    rounded: "{rounded.lg}"
    padding: "10px 14px 12px"
  folder-tab-selected:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.paper-text}"
    rounded: "{rounded.lg}"
    padding: "10px 14px 13px"
  badge-neutral:
    backgroundColor: "{colors.sheet-shade}"
    textColor: "{colors.muted-text}"
    rounded: "{rounded.md}"
    padding: "2px 6px"
    typography: "{typography.label}"
  badge-ok:
    backgroundColor: "{colors.moss-wash}"
    textColor: "{colors.moss}"
    rounded: "{rounded.md}"
    padding: "2px 6px"
  badge-warn:
    backgroundColor: "{colors.straw-wash}"
    textColor: "{colors.straw}"
    rounded: "{rounded.md}"
    padding: "2px 6px"
  badge-bad:
    backgroundColor: "{colors.crimson-wash}"
    textColor: "{colors.crimson}"
    rounded: "{rounded.md}"
    padding: "2px 6px"
  nav-link-active:
    backgroundColor: "{colors.cinnabar-wash}"
    textColor: "{colors.paper-text}"
    rounded: "{rounded.lg}"
    padding: "8px 10px"
  phase-step-active:
    backgroundColor: "{colors.cinnabar-wash}"
    textColor: "{colors.paper-text}"
    height: "30px"
    padding: "0 10px"
---

# Design System: Onward

## Overview

**Creative North Star: "The Case File"**

Onward is a file the candidate keeps on each role: sheets of paper laid on a desk, read and annotated, not a dashboard of tiles. The ground is warm walnut ink at night and warm stone paper by day. Content sits on raised sheets with small paper corners and a soft shadow. A serif sets headings and the numbers that matter. Everything you work with (labels, rows, buttons, evidence) is in the system sans. Dark is the daily scene. Light and system themes carry the same roles with their own values (see the sidecar) and must hold up just as well.

Colour means something here. Cinnabar, a warm orange-red, marks actions and the current place. Three earth tones mark standing: moss is backed, straw is related or to confirm, crimson is a gap. Nothing else in the interface is coloured, so a coloured word is always a judgement.

Motion is quiet and comes once. A sheet settles onto the desk with a short rise out of a slight blur. A ledger bar inks in from the left. Folder tabs rise to join their sheet. Every animation collapses to an instant change under reduced motion.

**Key Characteristics:**
- Warm neutral ground and sheets. Hue sits around 65-85 in OKLCH and chroma stays at or below 0.02.
- One action colour (cinnabar) plus three standing tones, each with a solid and a wash.
- Literata for h1, h2 and display numerals. System sans for everything else.
- Small paper corners (5/7/9px) and a single sheet shadow.
- Folder tabs as the signature: the selected tab and its sheet are one piece.

## Colors

A warm, low-chroma paper-and-ink palette. Cinnabar is the action colour, and three earth tones carry meaning.

### Primary
- **Cinnabar** (cinnabar): buttons, the current step, the focus ring, the caret, selected-tab underlines, Ask actions, and the brand mark. Its hue (about 45-50) sits between crimson and straw. In light mode it deepens to a burnt cinnabar.
- **Cinnabar Wash** (cinnabar-wash): the active nav link, the active phase step, hover on Ask buttons, the working/status band, and text selection.

### Secondary (standing)
- **Moss** (moss) / **Moss Wash** (moss-wash): backed by the resume, keywords already used, done steps, a Strong verdict.
- **Straw** (straw) / **Straw Wash** (straw-wash): related experience, eligibility to confirm, a stale comparison, a Medium verdict, warnings.
- **Crimson** (crimson) / **Crimson Wash** (crimson-wash): gaps, unmet conditions, errors, a Weak verdict, destructive actions.

### Neutral
- **Walnut Ground** (walnut-ground): the page and the sticky nav bar.
- **Sheet** (sheet): every raised surface, and the selected folder tab.
- **Sheet Shade** (sheet-shade): segmented-control troughs, neutral badges, hover fills, skeletons.
- **Rule** (rule) / **Strong Rule** (rule-strong): hairline borders and dividers. The strong rule is for secondary-button strokes, the evidence rule and unfilled step rings.
- **Paper Text** (paper-text), **Muted** (muted-text), **Faint** (faint-text): the three text levels. Faint is for separators, hints and empty values only.
- **On Solid** (on-solid): text and marks on any solid cinnabar or tone fill. It is dark walnut in dark mode and near-white paper in light mode.

### Named Rules
**The Meaning Rule.** Moss, straw and crimson are only ever used for standing, never for decoration or variety. Every coloured element must also have a text label or icon that says the same thing, because colour never stands alone.

**The On-Solid Rule.** Text on a solid fill uses on-solid. It is never white and never the ground colour. On-solid is the token that flips correctly between themes.

**The Hue Distance Rule.** The action colour must stay clearly apart in hue from the status colours: cinnabar at about 45-50, crimson at about 16, straw at about 90. Never choose a plain red or yellow as the accent, because it would read as a status.

**The Chart Variable Rule.** Chart fills use the theme-aware viz variables: `--color-viz-1` for single series and `--color-viz-ord-1` to `--color-viz-ord-5` for ordinal data. They are never hex. Each theme has a single-hue cinnabar ramp, checked with the dataviz validator against that theme's own sheet (values in the sidecar).

## Typography

**Display Font:** Literata Variable (self-hosted, optical sizing), with Iowan Old Style and Georgia as fallbacks
**Body Font:** the system UI sans (ui-sans-serif, system-ui, -apple-system, Segoe UI)
**Mono:** ui-monospace, SF Mono, Menlo, Consolas, used for code and kbd only

**Character:** a bookish serif for the few things worth reading as a heading or a count, beside a neutral working sans that keeps dense rows easy to scan.

### Hierarchy
- **Display** (600, 28px, line-height 1, -0.015em, lining tabular numerals): the verdict ("Strong fit"), set in its standing colour.
- **Numeral** (600, 26px, line-height 1, tabular): counts on folder tabs. Muted when unselected, in the tab's tone when selected.
- **Headline** (600, 18px, tight): the page h1, such as the company name in the application header.
- **Title** (600, 17px): the h2 on a sheet ("Posting keywords").
- **Body Strong** (500, 15px, snug): requirement titles in a list row.
- **Body** (400, 13-14px, relaxed 1.625): evidence, keyword lists, explanations.
- **Label** (500, 12px): definition terms, sheet hints, button text, badges. Sentence case.

### Named Rules
**The Two Voices Rule.** The serif is for h1, h2 and display numerals only. Working text (rows, labels, buttons, tables) stays in the sans. Every numeral that has to line up across rows uses tabular figures.

## Layout

Pages sit in a centred column up to 1600px wide, with 16px gutters (24px from the sm breakpoint). Sheets stack with a 20px rhythm. Inside a sheet, content is padded 20px horizontally and 16px vertically, and a sheet's top band (title plus hint) is divided from its body by a hairline rule. Lists inside sheets are divided by hairline rules, not separated into boxes. The application workspace uses two panes that fill the viewport under the header (at least 420px tall, and from 1024px wide `100vh - 17rem`). Each pane scrolls on its own, and the AI panel stays sticky on the right. Definition lists use a fixed 7.5rem term column from sm upward.

Lists of short words, such as keywords, are set as a running line separated by a centred faint dot, like an index. A line never starts or ends on a separator.

## Elevation & Depth

The system is a hybrid: tonal ground plus exactly one raised material. Sheets carry the sheet shadow (an inner top highlight, a 1-2px contact shadow and a long soft falloff). That shadow is lighter and warm-tinted in light mode. Depth beyond the sheet comes from tone (sheet-shade troughs, wash fills), never from stacking more shadows. The selected segment inside a trough borrows the sheet shadow so that it reads as a sheet lifted into place.

### Shadow Vocabulary
- **Sheet** (`--shadow-sheet`; values per theme in the sidecar): every card, the phase strip, the selected segment.
- **Button contact** (`0 1px 2px oklch(0 0 0 / 0.15)`): primary buttons only.

### Named Rules
**The One Sheet Rule.** A surface is either on the ground or a sheet. There are no intermediate elevations and no hard offset shadows.

## Shapes

Corners are small so that sheets read as paper and not as bubbles. They are 5px for controls and badges, 7px for buttons, folder tabs and nav links, and 9px for sheets and strips. Ledger strokes use a 2px corner. Circles are used only for step markers, must-have dots and the spinner. Borders are always 1px hairlines in the rule colours. The single exception is the evidence rule, a 1px strong-rule line at the left of quoted resume evidence.

## Components

### Buttons
- **Primary:** a solid cinnabar fill with on-solid text, 600 weight, 7px corners, 36-40px tall and 14-16px horizontal padding, plus the button contact shadow. Hover raises brightness by about 10%. When disabled it drops to sheet-shade with faint text. Keep one per view.
- **Secondary:** a sheet fill with a strong-rule stroke, 5px corners, 32px tall and 12px label text. Hover shades to sheet-shade.
- **Ask:** a transparent fill with a cinnabar stroke at 35% and cinnabar text, 28px tall. Hover deepens the stroke and adds the cinnabar wash, and the icon tilts slightly. Pressing it nudges it down 1px.
- **Focus:** always a 2px cinnabar outline offset by 2px.

### Badges
Small 5px-corner labels (12px, 500) in a wash fill with the matching solid text, borderless except for neutral. Badges are used for a single status, never as a row of keyword chips.

### Cards / Containers (the Sheet)
- **Corner Style:** 9px.
- **Background:** sheet.
- **Shadow Strategy:** the sheet shadow (see Elevation & Depth).
- **Border:** a 1px rule.
- **Internal Padding:** 16px by 20px. Header bands are 10-14px tall and divided by a rule.

### Folder Tabs (signature)
Index tabs stand on top of the sheet they open. Unselected tabs sit 5px lower, on a half-mixed sheet/ground fill with muted text, and their 3px top edge shows the standing tone at half opacity. On hover a tab rises 3px. The selected tab rises fully, takes the sheet fill, shows its top edge at full tone, and covers the sheet's top border so that tab and sheet are one piece. Each tab carries an icon and short label (12px, coloured by standing) over a serif numeral count. Tabs move over 320ms on the soft ease-out, and arrow keys move between them.

### Verdict and Ledger
The verdict is set as display type in its standing colour, beside a muted sentence that gives the must-have count. Under it is a 6px ledger bar: one stroke per standing, sized by count and separated by 3px gaps. The strokes ink in from the left once, staggered 140ms apart.

### Requirement Rows
These are rows inside the folder sheet, divided by rules. Each has a 15px title, a must-have marker (a filled text-colour dot for must, a hollow faint ring for nice-to-have), evidence behind a 1px strong-rule line, and an Ask button on the right. Hover tints the row with sheet-shade at 45%. Rows settle in staggered 45ms apart, and the stagger is capped after eight rows.

### Navigation
A sticky top bar on the walnut ground with a hairline bottom rule. Links are 13px/500 with an icon, muted at rest. Hover shows a sheet fill. The active link sits on the cinnabar wash with full text. The brand mark is a solid cinnabar square with on-solid lettering.

### Phase Strip and Pane Tabs
The phase strip is a sheet-styled band that holds the two phases joined by a 1px link. Steps inside it are 30px items, and the current step sits on the cinnabar wash. Pane tabs switch what a single pane shows, using a 2px cinnabar underline on the selected tab.

### Company Monogram
A flat OKLCH fill (lightness 0.42, chroma 0.05) whose hue comes from a fixed set chosen by hashing the name. The initials are set in the serif in a fixed light paper ink. It is never a gradient.

### Motion
- **Ease:** soft ease-out `cubic-bezier(0.22, 1, 0.36, 1)` for everything in this world.
- **Settle:** 420ms, rising 6px out of a 2px blur, for sheets and rows as they appear.
- **Ink:** 600ms, scaling from the left, once, for ledger strokes.
- Animations fill backwards only, so nothing stays layered once they finish. Under `prefers-reduced-motion`, every animation and transition here collapses to an instant change.

## Do's and Don'ts

### Do:
- **Do** set short word lists as a running index line separated by faint dots.
- **Do** put text on any solid fill in on-solid.
- **Do** fill charts with `--color-viz-1` and `--color-viz-ord-1` to `--color-viz-ord-5`.
- **Do** pair every standing colour with a word or icon that says the same thing.
- **Do** use the sheet (9px, 1px rule, sheet shadow) as the only raised container.
- **Do** reserve the serif for h1, h2 and display numerals, and keep numerals that align across rows tabular.
- **Do** stagger entrances 45ms apart, capped, and animate an ink fill only once.

### Don't:
- **Don't** box each keyword as a chip or pill ("chip soup").
- **Don't** summarise a page with a row of stat tiles. The verdict sentence and its ledger do that job.
- **Don't** put small uppercase tracked eyebrow labels above headings.
- **Don't** use gradient fills on avatars or anywhere else.
- **Don't** use a coloured left border thicker than 1px. Standing goes on the tab's top edge or in the text.
- **Don't** use white text, or the ground colour, on a solid fill.
- **Don't** add colours outside cinnabar and the three standing tones for decoration.
- **Don't** pick a plain red or yellow accent, or move cinnabar's hue toward crimson or straw.
- **Don't** fill charts with hex values. Use the viz variables.
