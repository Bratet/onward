# Product

<!-- impeccable:product-schema 1 -->

## Platform
web

## Users
Any job seeker who clones Onward and runs it on their own computer, against their own workspace and their own authenticated AI CLIs. Each installation has exactly one user managing their own search.

## Product Purpose
Track applications, analyze job postings, and help the user prepare each application from resumes they maintain themselves. Success is a search where every application's posting, documents, status and next step live in one place the user controls.

## Positioning
The application keeps the tracker, source resumes, tailored documents, and AI run records together in a local workspace the user owns, with AI that works through the user's own CLIs rather than a hosted service.

## Operating Context
The user reviews opportunities, creates an application from a posting or without one, checks the AI analysis, reviews or tailors a resume, prepares a cover letter or outreach message, follows up, prepares for interviews, and tracks the outcome. A daily or weekly application goal and a board of saved job-search URLs support the routine.

## Capabilities and Constraints
- Workflows shipped today: application tracker; posting analysis and fit; resume review and tailoring with a live RenderCV preview; master resume editing (multiple languages and general variants); cover letters; email and LinkedIn outreach; follow-ups; interview prep; an application goal and activity dashboard; a saved-search plan board; an editor for the AI skills that drive these workflows; AI run history.
- The app runs on localhost with Next.js and is not deployable to a hosted environment. It spawns `rendercv`, `claude`, and `codex` CLIs.
- All user data lives under `workspace/`, which is the user's data, not part of the repository. The application tracker and index are operational data; source resumes are maintained separately from reproducible application folders.
- A command-line interface calls the same logic as the app.
- Appearance supports system, light, and dark themes.

## Evidence on Hand
The current routes, UI, and local workspace structure are the source of product behavior. `examples/workspace/` is a sample for a fictional candidate. No marketing claims, users, or external service promises are established; never put a real person's details in product UI, copy, or examples.

## Product Principles
- Make the next application step clear.
- The user is the author: AI reviews and suggests, "no change needed" is a normal outcome, and generating a document happens only when the user asks.
- Keep AI choices understandable and visible.
- Preserve local data and source documents.
