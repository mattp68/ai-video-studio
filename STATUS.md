# AI Video Studio — 0.1.0-beta.5

Prepared: 2026-11-01. Safer updates on top of the beta.4 Public Launch build. GitHub's actual tag/release is authoritative for publication; local preparation alone is not a published release.

## Changes in beta.5

- Registry validation now fails when a registered library file exists but the local server would refuse to serve it (outside projects/<slug> or references/<slug>, hidden, or an unsupported type). Updates run this before restarting, so an upgrade cannot silently stop videos from playing.
- New read-only scripts/check_install.py compares installed application files with a published release manifest and lists identical, modified and missing files, so "am I up to date?" no longer depends on the version label.
- docs/UPDATING.md and the Updates page request ask the assistant to run both checks and confirm existing projects and the reference library still open and play before restarting. Owner media is never moved to fit a release layout.

The editing, review and library interface is unchanged apart from the Updates page request wording. There is no dependency, renderer or data-format change. Beta.4's setup fixes and everything in beta.3 remain.

## Preservation and verification

The public package contains reviewed source, docs, templates and empty examples only. Existing projects, original/exported media, catalogs/techniques, settings, feedback, scripts, approvals and local source changes must survive upgrades. No data migration is required from beta.4.

Fresh source-only setup, unit/UI tests, dependency audits, synthetic assembly/render and populated beta.4 Git/ZIP upgrade/rollback are release checks. Actual results and limits are in docs/VALIDATION.md. Independent teammate upgrades, fresh Codex/Claude Code sessions and other-platform media workflows remain beta pilot work; use docs/PILOT.md. The original beta has no Updates UI; docs/UPDATING.md includes a direct prompt.

For future application work read docs/RELEASE.md. For installed upgrades read docs/UPDATING.md. This source release never approves, updates or publishes a creative project, grants account access or sends messages to anyone.
