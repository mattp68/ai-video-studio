# Changelog

## 0.1.0-beta.4 — 2026-11-01

- SETUP.md points new installations to the current release; it previously named beta.2, which could steer a fresh setup to an older build than the install prompt requested.
- Current-version labels in STATUS.md, BRIEF.md and PROJECT_CONTEXT.md are corrected, and the release check now verifies them along with SETUP.md so they cannot fall behind again.
- studio.config.json no longer names a paid sound library as the default: generated or suitable free sounds come first and a personal library stays optional, matching docs/SOUND-DESIGN.md.

### Upgrading from beta.3

Follow docs/UPDATING.md. This release changes documentation, the studio.config.json sound-default wording and the maintainer release check only; there is no application code, dependency, renderer or data change. If you customized studio.config.json, keep your version. Prepared for the November 2 public launch.

## 0.1.0-beta.3 — Public Launch — 2026-10-31

- Edit saved project feedback inline, or delete with Undo and persistent recovery in All saved notes. Prior wording and applied history remain attached to the original version.
- Show applied feedback on earlier cuts, storyboards and edits, with links to the resulting version when registered. Order notes by newest save; chat copies include only open notes and detect subsequent edits.
- Keep the scene strip directly below its preview, with saved feedback in a separate scrollable list. Retain note reading positions and reveal the selected scene when returning from the overview.
- Browse storyboard scenes without jumping to the page header or resetting the scene strip/overview. Keep scene drafts and keyboard focus.
- Replace the heavy feedback field outline with a subtle olive focus border and glow, including forced-color keyboard support.

### Upgrading from beta.2

Follow docs/UPDATING.md in your existing installation. Apply the reviewed source release and retain your projects, videos, references, techniques, scripts, settings and feedback. There is no destructive migration; feedback history/deletion fields are added only when used. Back up first and retain local source customizations. Older interfaces do not understand deleted-note markers, so follow the rollback guidance before using an older version’s feedback-copy controls.

This is the public launch beta for Monday, November 2. The Mac-first validation scope remains; no dependency or renderer upgrade is included.

## 0.1.0-beta.2 — 2026-10-28

- Start projects from one modal with retained drafts, optional recorded scripts and videos/technique inspiration. Preview and selection cards share project-only notes and timestamps. X/Escape return one level at a time.
- Refined library source toggles, search/filter/sort controls, bottom-aligned card credits and reversible removal with Undo/Restore. New references lead with an explicit analysis request; public covers load quietly and refresh thumbnails.
- Cohesive reference/technique notes with exact examples, optional timestamps, saved notes and compact Copy for chat. Project review feedback retains exact versions and immutable selections.
- Stage/version navigation, larger storyboard inspection, optional versioned project scripts and corrected final promotion while preserving earlier sources and techniques.
- Optional isolated HyperFrames working copies and version-specific Sound summaries. Generated/free sound defaults; personal sound libraries remain optional. Renderer pins are unchanged. Optional transcription filelock/setuptools pins are patched for current security advisories.
- Consistent green branding, shared footer/header Updates entry and installed version. Copied update requests include the official repository, beta releases, backup and owner-data preservation.
- Documented branch/PR/check/merge/release workflow, release consistency checks and populated upgrade/rollback validation. Fresh installs start empty; existing collections, media and decisions are preserved.

### Upgrading

Follow docs/UPDATING.md in the existing installation. Back up first; apply reviewed source files only and retain local customizations. No owner-data schema migration is required from beta.1. This remains a beta: independent-user upgrades and fresh-assistant/other-platform media workflows need pilot feedback.

## 0.1.0-beta.1 — public pilot

MIT code license, concrete repository/setup prompt, prerequisite guidance, read-only capability reporting, optional browser/transcription/image/sound guidance and regression checks for setup readiness. Personal registries/media remain excluded. Fresh assistant/team and other-platform results remain pilot work.


## 0.1.0-rc.3 — analysis as the next step

Prominent analysis prompt immediately after saving and on pending-reference reopening, Not analyzed badges, Keep browsing, secondary utilities in More options and updated help. Clicking Analyze remains a copy/paste handoff and never completes analysis. Existing library data and source identity are preserved.

## 0.1.0-rc.2 — reference intake

Add reference form, optional title/creator/note, honest saved-link cards, duplicate handling, basic detail editing and Analyze in chat copied requests. Explicit local save guards and stale-edit checks preserve existing analysis and project decisions. No automatic source fetch or AI connection.

## 0.1.0-rc.1 — local candidate

Extracted the reusable studio shell and media helpers into an independent starter; empty personal registries, local licensed fonts, shared assistant instructions, setup/preflight, synthetic smoke workflow, hardened loopback/file routes, review persistence tests and explicit release export. Public release and fresh-user pilot pending.
