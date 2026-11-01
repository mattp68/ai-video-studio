# AI Video Studio — 0.1.0-beta.6

Prepared: 2026-11-01. A small fix on top of the beta.5 Public Launch build. GitHub's actual tag/release is authoritative for publication; local preparation alone is not a published release.

## Changes in beta.6

- A newly registered project now appears first on the Projects home. scripts/register.py previously appended new projects to the end of projects.json, which the home lists in saved order, so new work showed up last. Replacing an existing project with --replace keeps its current position, and reference registrations are unchanged.
- style-library/PROJECT-NAVIGATION.md documents the newest-first order, and a disposable-fixture test covers new, replaced and refused registrations.

Existing projects.json files are not reordered; only projects registered after updating go to the top. There is no interface, dependency, renderer or data-format change. Beta.5's safer-update checks, beta.4's setup fixes and everything in beta.3 remain.

## Preservation and verification

The public package contains reviewed source, docs, templates and empty examples only. Existing projects, original/exported media, catalogs/techniques, settings, feedback, scripts, approvals and local source changes must survive upgrades. No data migration is required from beta.5.

Fresh source-only setup, unit/UI tests, dependency audits, synthetic assembly/render and populated beta.5 Git/ZIP upgrade/rollback are release checks. Actual results and limits are in docs/VALIDATION.md. Independent teammate upgrades, fresh Codex/Claude Code sessions and other-platform media workflows remain beta pilot work; use docs/PILOT.md. The original beta has no Updates UI; docs/UPDATING.md includes a direct prompt.

For future application work read docs/RELEASE.md. For installed upgrades read docs/UPDATING.md. This source release never approves, updates or publishes a creative project, grants account access or sends messages to anyone.
