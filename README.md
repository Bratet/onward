<img src="src/app/icon.svg" alt="" width="64" height="64">

# Onward

Your job application companion. A local web app for running the job-application pipeline: paste a posting, let an
LLM read it, seed a tailored CV YAML, edit it against a live rendercv preview, and
track every application through to an offer.

It is **localhost-only by design**. It spawns CLIs (`rendercv`, `claude`, `codex`)
and reads and writes your local files, so every route handler runs on Node and none of
it is deployable to a serverless host.

---

## What it does

| Page | What it's for |
|---|---|
| `/` Dashboard | daily and weekly activity, status and score charts, response rate, and an optional application goal |
| `/applications` | the tracker — sortable table over `workspace/state/applications.md`, with a 4-dot indicator for which documents each folder actually has |
| `/applications/[key]` | canonical application workspace: overview and fit, persistent resume draft/preview, source files, runs, and assistant |
| `/profile` | edit the English or French master and general resumes — the source material for every tailored CV — and add, rename or delete resume profiles |
| `/plan` | Apply plan — a board of saved job-search URLs to return to |
| `/applications/[key]?tab=next` | Apply & follow up: update status and notes, draft and render a cover letter, or prepare an email or LinkedIn message |
| `/settings` | theme, engine choices, and live model lists |
| `/applications/[key]/editor` | compatibility redirect to the Resume tab in the canonical workspace |
| Header **New application** | analyzes a posting, checks for existing applications, then creates a `Preparing` workspace |

---

## Requirements

- **Node 20+** (developed on v23)
- **rendercv v2.8+** on `PATH` (or importable as `python3 -m rendercv`)
- At least one LLM CLI, logged in:
  - `claude` — [Claude Code](https://claude.com/claude-code), `claude login`
  - `codex` — `codex login`

The app's AI features use CLI sign-in through your **subscription**, not an API key. The app never
reads `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`; if a CLI is logged out, the engine
pill in the header says so instead of failing mid-request.

> `claude -p` reports `total_cost_usd` with `costBasis: "list"`. Under a
> subscription that is a list-price *equivalent*, not money billed — the app does
> not display it as spend, and neither should anything built on top of it.

## Running it

```bash
make engines     # check claude / codex / rendercv are installed and logged in
make setup       # install deps, create workspace/ from the example data, link application folders
make dev         # http://localhost:3000
```

`make setup` runs the reconcile step that links folders under `workspace/applications/`
to their tracker rows by name. Anything it can't match confidently is left alone and
surfaces in the UI as "link folder →" with a dropdown of unclaimed folders. It
never guesses.

## Your data lives in `workspace/`

The code and your data are kept apart. Everything personal (resumes,
applications, the tracker, your skills and settings) lives in `workspace/`,
which this repository ignores. The first `make setup` or `make dev` copies
`examples/workspace/` there so the app starts with sample data.

```
onward/                 this repository: the app
├── examples/workspace/ sample data for a fictional candidate, also used by the tests
└── workspace/          your data, ignored by git
    ├── config/         candidate.json, optional signature.png
    ├── resumes/        masters/ and own/ general resumes
    ├── applications/   one folder per application
    └── state/          tracker, skills, chats, runs, settings
```

To keep history of your data or use it on several machines, make `workspace/` its
own **private** git repository (`git init` inside it, or clone your data repo
there). Code updates then come from pulling this repo, and nothing you write can
end up in a public commit. To keep the data somewhere else entirely, set
`ONWARD_WORKSPACE` to its path.

## Desktop app

Onward also ships as an installable app for macOS, Windows and Linux. It is the
same app: Electron wraps a bundled copy of the server and runs it with its own
Node, so there is nothing else to install apart from the CLIs below.

- **Download** the installer for your system from the
  [latest release](https://github.com/Bratet/onward/releases/latest): `.dmg` for
  macOS (Apple silicon `arm64` or Intel `x64`), `.exe` for Windows, `.AppImage` or
  `.deb` for Linux. The `.dmg` window shows Onward beside Applications with an
  arrow between them, and says how to get past macOS's first-open warning. Its
  picture is `desktop/resources/dmg/background.html`, rendered to
  `background.tiff` by `npm run dmg-background` in `desktop/` (macOS, Chrome).
- **Claude Code and Codex** are still the ones on your computer, signed in with
  your subscription. If the app finds neither, it says so on launch and links to
  both installers. RenderCV is needed for PDFs, and the app warns when it is missing.
- **First launch** (`desktop/onboarding/`) asks one question: start fresh, or open
  an Onward folder you already have, such as a clone of your private data repo.
  Starting fresh takes your name (filled in from your computer account where it can
  be) and a folder (`Documents/Onward` by default). The AI tools are checked in the
  background, and their install steps appear only when one is missing. The setup
  window stays on "Getting Onward ready" until the app's own window opens.
- **Getting started** (`/welcome`, also in the web app) is where a new folder's
  resumes come from: drop in your current resume as a PDF or paste its text, and
  your AI tool sorts it, word for word, into your master and general resumes. The
  page explains the difference. Until a resume exists, the app opens there.
- **The tour** (`/?tour=1`) follows: seven stops through the top bar, each lighting
  up a page and saying what it is for, ending on New application. It can be taken
  again from Settings → Getting around or Help → Take the Tour.
- **Settings → App & updates** shows the version, checks for, downloads and
  installs updates, turns automatic updates on or off, and opens or changes the
  workspace folder.
- **Updates:** every push to `main` builds the installers and publishes them as a
  GitHub release (`.github/workflows/desktop.yml`). With automatic updates on, the
  app checks on launch and every four hours, downloads in the background, and
  offers a restart.

The builds are not signed with an Apple or Microsoft certificate yet, so both
systems ask once. On macOS, open Onward, close the "could not verify" message,
then go to System Settings → Privacy & Security and choose Open Anyway. On
Windows, choose More info → Run anyway on the SmartScreen message. The Windows
program is `onward-app.exe`, not `Onward.exe`: Discord recognises games by their
exe name, and `Onward.exe` is a VR game's, so Discord drew its game overlay on the
app. Without a
certificate a Mac app can't replace itself, so on macOS the update prompt links
to the new download instead.

To work on it: `make desktop` builds the bundled server and opens it in the
desktop shell, and `make desktop-dist` builds this OS's installers into
`desktop/dist/`. The build refuses to bundle anything from `workspace/`, since
releases are public.

## Make it yours

This is a personal-use tool: it's built around one candidate's identity and
master resumes, not a multi-tenant product. To use it for yourself:

1. Edit `workspace/config/candidate.json` and set `fullName`
   to your own name. This drives generated filenames (`cv-<you>.yaml`,
   `<Your_Name>_CV.pdf`, `<Your_Name>_cover_letter.pdf`). Optionally add `confidentialTerms` — names that should
   never appear on a generated resume or cover letter (e.g. a past employer's
   confidential clients); server-side resume and cover letter rendering blocks them.
2. Replace the **master** resume(s) at
   `workspace/resumes/masters/master-resume-english.yaml` and/or `-french.yaml`
   with your own: the complete, comprehensive evidence source (see `templates/tailored-design.yaml`
   for the required design block).
3. Replace the **general** resume(s) with yours as `workspace/resumes/own/general-en/cv-<you>.yaml`
   and/or `general-fr/` (matching the slug from step 1): a shorter, balanced CV that
   seeds every new tailored application. Edit it on **Profile**. Tailoring then
   imports stronger evidence from the master where it helps a specific posting.
   On **Profile**, **Add profile** copies the general resume (or another profile) into
   a new one aimed at one kind of role, such as Backend Engineer, stored as
   `own/<profile>-en/` and `own/<profile>-fr/` with names and role types in
   `own/profiles.json`. A profile can be suggested for job-analysis role types; new
   applications for those postings start from it. **Profile settings** renames it,
   changes its role types, or deletes it, moving its folders to
   `workspace/state/.trash/resume-profiles/`.
   Every save on **Profile** that changes a resume first keeps the version it replaces
   under `workspace/state/resume-revisions/` (the newest 20 per file); **Revert to saved**
   drops unsaved edits, and saving with no changes only refreshes the PDF.
4. Clear the sample rows from `workspace/state/applications.md`; `workspace/applications/`
   fills up as you create applications through the app.
5. Optionally place a handwritten signature at `workspace/config/signature.png` for cover
   letters. Without it, letters render unsigned.

## Make targets

`make` on its own prints the list.

| Target | What it does |
|---|---|
| `make dev` | dev server |
| `make build` / `make start` | production build and serve, still localhost-only |
| `make stop` | free the port when a server is left running |
| `make check` | typecheck |
| `make test` | tracker round-trip, application flows, tailoring, cover letters, goals, and extension tests, always against `examples/workspace/` |
| `make reconcile` | rebuild `workspace/state/app-index.json` from folder names |
| `make engines` | report whether `claude`, `codex`, and `rendercv` are available |
| `make extension` | build the optional LinkedIn visa badge Chrome extension |
| `make clean` / `make nuke` | drop `.next/` / also drop `node_modules/` |

Server targets take `PORT=` (`make dev PORT=4000`). The npm scripts underneath are
unchanged if you'd rather call them directly.

Run `make test` before shipping anything that touches `src/lib/tracker.ts`. That
file is the only writer of an irreplaceable, git-tracked file.

> Don't run `make build` while `make dev` is live — the build replaces `.next/`
> under the dev server and every page starts 404ing until you restart it.

---

## How it's put together

### Data (`src/lib/`)

There is no database. `workspace/state/applications.md` **is** the database — the same markdown
table that was hand-edited before, still hand-editable now.

- `paths.ts` — every path in the repo, resolved once. Nothing else builds a path.
- `tracker.ts` — parses and serializes the 9-column table. Writes are atomic
  (temp file + `rename`), touch only the row that changed, and reject any cell
  containing `|`, which would silently corrupt the table.
- `appIndex.ts` — the tracker has no slug column, so `workspace/state/app-index.json` maps
  row id → folder name. `reconcile()` matches on slug+date, then date+prefix, then
  date alone, and reports which tier each match came from.
- `applications.ts` — joins tracker rows to what is actually on disk. Every
  document is optional: most legacy folders are incomplete, and the UI renders
  that rather than erroring.
- `workspaces.ts` — atomically persists versioned drafts, pending proposals,
  first-applied timestamps, and hash-aware profile-fit jobs with optimistic revisions.
- `weeks.ts` — Monday-anchored bucketing, empty weeks filled in, the current week
  marked partial so a Tuesday isn't read as a collapse in output.

### Validation (`src/lib/validate.ts`)

The hard rules, enforced on every render:

- no names from `workspace/config/candidate.json`'s `confidentialTerms` (e.g. a past
  employer's confidential client names)
- no `location` key anywhere in the CV
- no `[bracketed placeholders]`
- no em dashes
- the design block must match `templates/tailored-design.yaml` exactly, except
  `page.size`
- one page, with first-page fill reported for information only

Each failure carries a dotted path — `cv.sections.Experience[0].highlights[2]` —
and `yamlPath.ts` resolves that back to a character offset, so clicking a failure in
the editor moves the cursor to the line that caused it.

### Rendering (`src/lib/render.ts`, `pdf.ts`)

`rendercv` is spawned into a fresh temp dir per request, so concurrent renders can't
collide and there is nothing to clean up. It needs two env vars, both set by the
wrapper: `PYTHONPATH=<repo>/patches` for the nested-bullet fix, and
`PYTHONIOENCODING=utf-8`.

Page count and first-page fill come from `pdfjs-dist`; fill is the fraction of the
page above the lowest text baseline. A warm render is ~750ms, which is what makes
the live preview usable at a 500ms debounce with in-flight renders aborted.

### Engine (`src/lib/engine/`)

One interface, two adapters, switched from the header pill and persisted to
`workspace/state/settings.json`.

```ts
interface Engine {
  id: 'claude' | 'codex'
  status(): Promise<{ ok: boolean; version?: string; reason?: string }>
  runStructured<T>(o: { prompt: string; schema: object; signal?: AbortSignal }): Promise<T>
}
```

Both run **read-only**. The model reads the posting and returns structured JSON; the
app does all the writing. Two things the adapters exist to handle:

- **Native streaming and conversations.** Codex uses app-server threads; Claude
  uses resumable `stream-json` sessions. Tailoring keeps one of those native
  conversations alive across every measured page-fit revision.

- **one schema, two validators.** OpenAI structured outputs rejects any schema whose
  `required` omits a key in `properties`, so every field is required and the
  genuinely optional ones are nullable instead. Claude accepts that shape too.

`/api/jd` streams NDJSON, because a 20-60s call behind a silent spinner reads as a
crash.

---

## Tailoring flow

The header **New application** dialog analyzes the posting, separates must requirements from nice-to-haves, and
ranks each group using signals in the posting: core duties, repetition, placement,
and explicit screening criteria. It seeds a per-application resume YAML from the
language-matched **general resume**, with the locked tailored design and JD paper size.

Every **Tailor** click reads the current general resume, full master, and candidate
guidance. The general resume supplies the editorial baseline; the master supplies
additional factual evidence. The CLI considers both before deciding what to keep,
reword, reorder, replace, add, or remove for the ranked requirements. A missing
fact remains a gap.

Operations are reviewable edits, including source-referenced imports of master
highlights, entries, skills text, and missing sections. Imports cannot move a
project under a different role, and source fingerprints prevent replay against
changed evidence. Existing sections can be reordered. The model cannot write
arbitrary objects or change the locked design.

The app validates and renders each plan in a staging buffer, with at most four
attempts to repair rejected edits or overflow. A valid one-page proposal ends the
loop: fill percentage is diagnostic, not a score to maximize. A no-change proposal
is valid. Each repair uses the same general and master snapshots. No application
file changes until acceptance, which re-renders the exact reviewed buffer. Page
count alone does not verify visual readability.

The model-facing instructions live in the filesystem skill registry under
`workspace/state/skills/<id>/SKILL.md`. Open **Skills** in the navigation (or **Edit skill**
beside **Tailor**) to edit, validate, duplicate, version, and restore them. The
`analyze-job` skill receives the posting; `tailor-cv` receives the current analysis,
general CV, master evidence, candidate guidance, and renderer feedback. The base
inputs use required `{{…}}` placeholders. Frontmatter selects a trusted runner and
its fixed capabilities. The structured output schemas and factual/structural
guards remain code-enforced even when instructions change.

Both **Analyze** and **Tailor** let you select any registered skill with the
compatible runner. Every execution is recorded under `workspace/state/runs/<run-id>/` with
the exact skill version, engine, application key, input manifest, progress events,
and a compact result or error summary. Open **Runs** globally, **AI runs** on an
application, or **Inspect run** beside an active feature to view that decision
trace. Full source documents are not copied into run history.

Each application page also has a persistent **Application coach**. It uses any
registered `advisory-chat` skill, reads a bounded snapshot of that application's
tracker row, posting, CV, and tailoring notes, and keeps the conversation in
`workspace/state/chats/<application-key>.json`. Answers expose the evidence they used,
suggested next actions, the exact skill version, and a link to the execution run.
The coach can propose a reusable skill rule. **Review change** shows the exact
Markdown diff and skill-version transition without writing anything. **Apply** is
a separate confirmation: it rejects a stale preview, archives the current skill,
creates the next version, and permanently marks that chat proposal as applied.
The model never receives direct file-write access.

The master resumes are the source of truth. Add or correct experience on **Profile**,
then tailor again; the tailoring pass does not invent accomplishments, change real
position titles, or modify either source resume. Added evidence must come from the master.

On **Profile**, **Review resume** reviews the selected English or French general
or master resume, including unsaved edits, using the editor-chat AI settings and
the versioned `review-resume` skill. Findings include strengths, prioritized issues,
supported wording suggestions, and questions needing your input. Reviews never
change or save the resume. Results stay in the current view, are marked outdated
after edits, and reset when switching sources. Runs retain skill provenance and
finding counts rather than the resume or full review. This is a text review;
rendered PDF layout and extraction are not assessed.

## Apply plan

**Apply plan** (`/plan`) is a small board of saved job-search URLs — a filtered
LinkedIn search, a company's careers page, whatever you return to routinely —
each tagged with an optional track and notes. It's just a bookmark board backed
by `workspace/state/saved-searches.json`; nothing here reads or scrapes those URLs.
A fresh clone includes one example software-engineer search. Edit or delete it
and add your own saved searches.


## Recent improvements

Fit assessments now include saved candidate guidance alongside master-resume evidence.
Confirmations made in the analysis chat can be saved to guidance for future applications.
When the inputs change, the refresh compares them with the previous assessment and keeps
unaffected rows; chat corrections can also be saved while a refresh is queued.

After accepting or finalizing a resume, **Apply & follow up** opens as the third step
of the application workspace. Choose a status update or an optional message task. AI
drafts use the finalized resume and job posting and are saved after generation; manual
edits show an unsaved indicator until saved. Existing next-steps links redirect to this
workspace step. Messages are never sent by the app.

The dashboard can track an optional daily, weekly, or monthly application goal.
Application creation warns about matching jobs before writing a duplicate. The
resume and cover letter editors show whether the saved PDF matches the current
draft, and errors include a retry action when available.

The cover letter editor uses the finalized resume for sender details, previews a
one-page Typst PDF, and saves its inputs beside the PDF so edits can be checked
against the finalized version. New letters follow the application's English or
French language. The `write-cover-letter` and `write-outreach`
skills are editable on the Skills page. The included versions contain generic
instructions; add your own voice and preferences to your local workspace.

Once an application is sent, its page switches to the process with the company: a
progress track where you add and update interview rounds, messages and status, and a record tab with the saved posting and its link. The dashboard lists what needs attention today and the tracker filters by phase.

Cover letters research the company automatically and finish with a `humanize-text`
pass that removes AI-writing patterns without changing facts; the reply always says
what that pass changed. Tailoring re-selects bullets from the master instead of
padding the general resume, can start from any resume profile you create on Profile, and
the new-application form can fetch a posting from its link. `npm run onward -- help`
lists the command-line interface for applications, stats, the goal and saved searches.

## Optional browser extension

`make extension` builds `extension/visa-badge/` for loading as an unpacked Chrome
extension. It labels LinkedIn postings for visa sponsorship and remote-location
eligibility. The extension uses an OpenRouter key you enter in its local options;
it sends the visible job text to OpenRouter for classification. This is separate
from the app's Claude and Codex CLI sign-in. See the
[extension README](extension/visa-badge/README.md) for setup and privacy details.
