# AI Video Studio

User instructions and the current brief take priority. This is a local, chat-driven creative workspace. The website organizes work and review decisions; it does not edit a dropped file or send a request to an AI automatically.

## Start and resume

Read PROJECT_CONTEXT.md, README.md, docs/WORKFLOW.md and docs/DESIGN-SYSTEM.md. For existing work, read projects/<slug>/STATUS.md, approval-state.json when present, brief.md, current storyboard/design and latest review notes. Read SETUP.md for installation and docs/TOOLING.md before media commands. Never rely on a previous chat, open browser, old port or filename as approval evidence.

## Work with the creator

- Raw takes: compare performance, gestures and delivery; assemble complete thoughts with tight natural joins. Silence detection only proposes regions. Deliver a watchable spoken cut and script before visual storyboarding.
- Already approved speech: preserve words/timing unless asked to recut.
- Show actual proposed storyboard frames, copy, source choices and motion/sound intent before detailed production when requested. Questions and no-change requests are conceptual only.
- Add captions, genuine product B-roll, purposeful motion/zooms/transitions and sound effects. Music follows the brief. Do not invent UI and present it as a real demonstration.
- Verify product names, numbers, caption timing after cuts, headroom and safe areas. Listen/inspect actual source and exports when supported; state perception limits instead of claiming a complete review.
- The user reviews the cut, direction and final. Stage approval is not final approval. Reopening preserves the accepted files and creates a new change round.

## Files and tools

- Source files in projects/<slug>/raw are immutable. Copy imports. Keep proxies, source-to-output maps, selects, captions, rights/source ledgers, code and versioned exports. Never overwrite a deliverable silently.
- Use python3 scripts/studio.py new <slug> to scaffold and register an intake project. Use that project's .venv Python for Pillow/media helpers. The site itself only needs Python's standard library.
- Use the project-local pinned HyperFrames CLI through scripts/hf.py. Read its official docs and installed capabilities before changing production architecture. Each composition has a finite duration, one paused seekable timeline and local production assets.
- Do not assume private globally installed skills/plugins, paid libraries or accounts. Shared docs and the sample are sufficient for the baseline. Optional capabilities need the user's own account/rights. Do not weaken approval/security settings or install global integrations as part of setup.
- Detect HDR before SDR output; preserve a deliberate color workflow. Synthetic smoke media proves technical behavior only, never take selection or creative quality.

## Studio and reference upkeep

Read docs/HANDOFF.md and style-library/PROJECT-NAVIGATION.md. After saving production decisions, register current files/checkpoints and source-note hashes. Registration does not approve anything. Never refresh stale fingerprints without reading changed notes.

A pasted library URL resolves #style, #technique/example or #project/artifact/frame against this workspace's registries; inspect the actual referenced media and notes. Localhost links do not upload or share files with another computer. The + selects only in this browser; Copy reference copies a library link; Review & copy combines optional notes. Preserve the exact chosen example. General receiving instructions belong here, not in long copied boilerplate.

Maintain one representative entry for a first full review (review_pending), and update the preferred version after explicit positive user feedback. Preserve an accepted baseline while a new experiment is pending. Add creator references explicitly supplied as inspiration; deduplicate original URLs, retain creator attribution and honest evidence limits. Outside footage/audio is reference-only unless separately authorized and licensed.

## Handoff and publishing

Save STATUS, review notes, exact build commands, accepted/newest versions and limitations. Explicit approvals saved by the website are authoritative for that exact checkpoint. Do not approve real projects as a UI test. Test mutations only in temporary fixtures.

Never publish, push to a remote, message anyone or share private media without user authorization. Owner projects, catalogs, approval journals, credentials and references are ignored and excluded from release exports. See SECURITY.md and docs/RELEASE.md before packaging. No background monitoring is implied.

## References saved from the UI

Add reference saves a public source URL and optional title/creator/reference_note into the local catalog. No source is fetched or analyzed by that action. New links have analysis_status=not_analyzed and a clearly generic link poster. Analyze in chat copies a request; it does not invoke an agent. When receiving it, resolve the exact existing ID, read reference_note, inspect actual source media where accessible and enrich that same record. Preserve the source identity, user note and collection; deduplicate before adding anything. Record evidence and limitations. Set analysis_status to partial/analyzed only for work actually inspected; inaccessible links stay pending. For a genuine local preview, assign a new versioned source-backed poster, paths/duration and source evidence, then recheck linked technique snapshots. Never infer sound/fonts/timing from an unviewed link or create a fake playable preview. External media rights remain project-specific. UI editing changes only basic details and preserves existing analysis; saved note/revision checks prevent stale edits overwriting a later analysis.

## Available capabilities

Read docs/CAPABILITIES.md and the setup report. Check the actual tools in the current chat before assuming browser, image-generation or account access. Guide an explicitly authorized official prerequisite installation; do not silently install global tools. The render browser is separate from source browsing. If a site needs login, let the user sign in in the connected browser; if access fails, request a usable source/file and retain honest pending analysis. Basic clicks/pops/whooshes can be synthesized with local code/FFmpeg; audition them and record provenance. Use optional services only when available and authorized, and ask before paid usage. No setup script can grant personal account access.
