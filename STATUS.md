# AI Video Studio — 0.1.0-beta.4

Prepared: 2026-11-01. A small documentation and configuration release on top of the beta.3 Public Launch. GitHub's actual tag/release is authoritative for publication; local preparation alone is not a published release.

## Changes in beta.4

- SETUP.md now points new installations to this release. It previously named beta.2, which could steer a fresh setup to an older build than the install prompt requested.
- STATUS.md, BRIEF.md and PROJECT_CONTEXT.md name the current release.
- studio.config.json no longer names a paid sound library as the default. Generated or suitable free sounds are the starting point and a personal library stays optional, matching docs/SOUND-DESIGN.md.
- The release check now also verifies the version named in SETUP.md, STATUS.md, BRIEF.md and PROJECT_CONTEXT.md, so these labels cannot fall behind again.

There is no application code, dependency, renderer or data-format change. Everything in beta.3 remains: editable and deletable saved feedback with Undo/Restore and history, newest-first notes, steady storyboard scene browsing and softer focus styling, plus the beta.2 project starter, library, review, script, editor-copy and sound features.

## Preservation and verification

The public package contains reviewed source, docs, templates and empty examples only. Existing projects, original/exported media, catalogs/techniques, settings, feedback, scripts, approvals and local source changes must survive upgrades. No data migration is required from beta.3; if you customized studio.config.json, keep your version.

Fresh source-only setup, unit/UI tests, dependency audits, synthetic assembly/render and populated beta.3 Git/ZIP upgrade/rollback are release checks. Actual results and limits are in docs/VALIDATION.md. Independent teammate upgrades, fresh Codex/Claude Code sessions and other-platform media workflows remain beta pilot work; use docs/PILOT.md. The original beta has no Updates UI; docs/UPDATING.md includes a direct prompt.

For future application work read docs/RELEASE.md. For installed upgrades read docs/UPDATING.md. This source release never approves, updates or publishes a creative project, grants account access or sends messages to anyone.
