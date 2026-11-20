# Changelog

## Unreleased

- HyperFrames, the local renderer, moves from 0.9.16 to 0.9.71, with its hono and @hono/node-server dependencies. This clears two moderate npm advisories in the editor's local server. The studio's sample renders pixel-identical. A realistic test edit kept the same frame count, duration and audio-to-picture sync, with only encoding-level differences on fine footage detail.
- Renders of 4K footage need much less temporary disk, because each video is extracted at about the size it is shown.
- Scripts such as GSAP and scene files must be inside the composition's folder. Images, video, audio, fonts and CSS can still come from elsewhere. A render that would miss an outside script stops with an error instead of producing a broken video. See docs/TOOLING.md.
- A mix that goes over -1 dBFS true peak is limited only as far as needed, so its peaks can be up to about 2 dB louder than before. Quieter mixes are unchanged.
- The HyperFrames editor gets its upstream fixes and features. Its Share and cloud export buttons upload to HeyGen and are not part of the studio's local workflow.

### Upgrading from beta.16

Follow docs/UPDATING.md. A media installation runs full setup once, which downloads the new render browser (about 200 MB). No owner data is rewritten. Before re-rendering an older composition, check that its scripts and scenes are inside its folder.

## 0.1.0-beta.16 — Install creator packs — 2026-11-19

- Install a creator pack with one chat request. `python3 scripts/pack.py install <file>` checks the pack file (or the folder your browser unzipped), adds its videos, techniques and exact examples to your library under the pack's own IDs, and adds a collection with the pack's name. Your projects, personal collections, notes and approvals stay as they are.
- Install a newer version the same way: unchanged items keep their links, and anything the new version drops is cleaned up. `python3 scripts/pack.py remove <pack-id>` uninstalls a pack; installing the file again restores it.
- Pack authors can build a deterministic pack file from one of their own collections with `python3 scripts/pack.py build`. It refuses other creators' videos and warns about music and unverified licensing. See docs/PACKS.md.

### Upgrading from beta.15

Follow docs/UPDATING.md in your existing installation. Apply the reviewed source while preserving saved work, settings and local customizations. No owner-data rewrite, deletion, empty-seed replacement or renderer upgrade is needed. Nothing is installed until you ask your editing chat to install a pack file; see docs/PACKS.md.

## 0.1.0-beta.15 — Techniques for whichever version you approve — 2026-11-19

- Techniques are no longer missed when you approve a video in the Studio. Your editing chat now prepares techniques for every version it delivers for review, not only the one it expects to be final, in step-by-step projects and in single requests that edit a supplied video. Later versions reuse examples where the video is unchanged.
- The approval panel says plainly when no techniques are prepared for a version. A finished video with no techniques in your library shows **Find its techniques**, which opens the catch-up request for that video.

### Upgrading from beta.14

Follow docs/UPDATING.md in your existing installation. Apply the reviewed source while preserving saved work, settings and local customizations. No owner-data rewrite, deletion, empty-seed replacement or renderer upgrade is needed. Finished videos that already have no techniques show Find its techniques after the update; nothing is analyzed automatically.

## 0.1.0-beta.14 — Use far less disk space for imports and versions — 2026-11-19

- Use much less disk space on Macs and Linux disks that support copy-on-write clones. Imports, new version folders and Open in HyperFrames working copies now clone files instead of duplicating them; other disks keep making ordinary copies.
- Start the next version with `python3 scripts/studio.py new-version projects/<slug>/<version>`. It leaves out regenerable caches and reports how much was shared.
- Keep regenerable frame dumps, mattes and temporary renders in a version's `.scratch/` folder, which HyperFrames history, new versions and editor copies skip.
- `scripts/hf.py render` warns when less than 10 GB is free. docs/TOOLING.md explains disk use and HyperFrames' own `clean --dry-run`.

### Upgrading from beta.13

Follow docs/UPDATING.md in your existing installation. Apply the reviewed source while preserving saved work, settings and local customizations. No owner-data rewrite, deletion, empty-seed replacement or renderer upgrade is needed. Existing project folders are left as they are; the savings apply to imports, versions and editor copies made after updating.

## 0.1.0-beta.13 — Collections and a cleaner Reference Library — 2026-11-08

- Save exact technique examples, references, slides and moments in collections, independently of your current edit picks and notes. Installed packs show their exact examples; this release includes no paid pack, storefront or promotion.
- Use searchable multi-select filters for creators, categories, techniques and collections. Combine filters across formats, remove individual chips and clear filters without losing your search, sort or editing selections.
- Browse sooner with a compact Reference Library heading, optional instructions and a small dismissible technique review reminder.
- Find remaining techniques in older saved videos and eligible finished projects through an explicit chat request. Final approval can publish prepared examples for the exact chosen version; it does not start analysis.

### Upgrading from beta.12

Follow docs/UPDATING.md in your existing installation. Apply the reviewed source while preserving saved work, settings, browser state and local customizations. No owner-data rewrite, empty-seed replacement or renderer upgrade is needed.

## 0.1.0-beta.12 — Borrow techniques across your reference library — 2026-11-08

- Save a reference with just its link, then copy its analysis request into your editing chat. Analysis captures verified reusable techniques in one chronological list, grouped into reusable families, with creator attribution, the original source link and honest access limits.
- Preview exact excerpts and collect techniques, timestamped moments, whole references and carousel slides in one shared selection across Videos, Techniques and Carousels. Copy the selection and its direction together for chat; individual examples and full references also have direct copy actions.
- Keep one editable direction per exact technique or carousel pick for the current editing request. Saving direction selects its example. Clear starts a fresh request, with Undo, while retaining earlier note records and histories. Existing multiple notes and unfinished drafts remain recoverable.
- Align example rows, collapsed borrowing controls, selection counts, stable toolbars and subtle input focus styling across the library. Carousel slides stay pinned while browsing; full-video navigation returns to the chosen excerpt.

### Upgrading from beta.11

Follow docs/UPDATING.md in the existing studio. Apply reviewed application source only and retain projects, media, catalogs, techniques, removed markers, notes and histories, scripts, feedback, approvals, settings, browser drafts/selections and local source customizations. Empty starter seeds are for first installation only. No owner-data rewrite, renderer upgrade or dependency-pin change is required. Exact slide picks and editing-request note scopes need compatible source after rollback; keep the newer owner and browser records intact.

## 0.1.0-beta.11 — Safer existing-studio updates — 2026-11-05

- Before media setup installs anything, inspect the pinned renderer’s running preview inventory and stop safely if this installation owns an active preview or the inventory cannot be verified. Other installations are left running. Fresh installs and studio-only mode need no preview check.
- Explain the existing-install update path, recoverable composition-source checkpoints, active-editor handling and disposable verification in the shared update guide. Do not automatically restart a preview on an accepted original composition. HyperFrames 0.9.16, its security override and other dependency pins remain unchanged.

## 0.1.0-beta.10 — Renderer notice correction — 2026-11-05

- Make the HyperFrames dependency notice version-free after the renderer upgrade; its Apache-2.0 license is unchanged. Retains the tested 0.9.16 renderer, Undici 7.30.2 security override, Node requirement and CI reliability changes from beta.9. No application logic, dependency pin or owner-data change.

## 0.1.0-beta.9 — Renderer upgrade and CI reliability — 2026-11-05

- Upgrade the pinned local HyperFrames renderer from 0.8.144 to 0.9.16, with a scoped Undici 7.30.2 override for the upstream HTTP dependency security fixes. GSAP and Python dependency pins stay unchanged.
- Full media setup requires Node 22.12.0 or newer and rejects older versions before installation. Studio-only setup still needs no Node or renderer packages.
- CI runs once per PR update, retains main/release-tag checks and manual dispatch, cancels superseded PR runs and uses the supported macOS Intel pool. The full Linux/macOS Python matrix, audits and release gate remain. Apple Silicon setup/render validation stays a separate release pilot.
- Existing projects, media, saved reviews, editing working copies, libraries, scripts and writing memory are retained. Saved videos are not re-rendered by an application update.

Follow docs/UPDATING.md from the published release and preserve local customizations.

## 0.1.0-beta.8 — Library registration and approval — 2026-11-05

- Assistant/CLI reference registration automatically records a creation date for new undated entries and preserves existing dates on replacement. Older undated entries stay unknown; their dates are not fabricated during upgrades or approval.
- Registering a project and its own video reference in either order stores the exact link. The reference and project link save together with conflict guards and recoverable writes.
- Final approval reconnects one missing link when project ID, current version and media path match exactly. It retains the existing library entry, original added date, analysis and media. Ambiguous, removed, archived, foreign, wrong-version/path and hash-mismatched candidates remain blocked.
- Newest added continues to mean original added date. Approval does not move an existing entry by changing its date. No dependency, renderer or owner-data migration.

Follow docs/UPDATING.md in your existing installation. Preserve all owner data and local customizations.

## 0.1.0-beta.7 — Script writing — 2026-11-05

- Start videos with Help me write a script or Edit my footage. The focused writing form accepts an idea, draft or video reference, with shared writing guidance and private writing memory.
- Optional Script section with a readable growing editor, exact saved versions, retained drafts and Refine in chat. Integrated opening choices show the current selection, highlight changed words and offer Undo while preserving saved versions. Edit script exposes Save changes/Cancel, and Save & copy feedback saves manual edits before copying the exact revision request. A visible feedback area with an optional reference copies an exact local revision request; original context stays under Your idea & references.
- Approve the current script before recording. Hook options stay available, and the approved view provides a copyable handoff for raw footage and the spoken cut.
- Writing memory retains supported lessons with actual wording, feedback and source context. Readable notes offer Correct in chat and Forget with Undo. New chats recall relevant examples, while each fresh installation starts empty.
- Simplified footage starter: one brief, optional recorded script, unified library/link inspiration cards and an exact read-only See message preview beside Copy request. Existing browser drafts and exact references are retained.
- A compact shared scriptwriting reference provides flexible principles and an optional storytelling framework. Writing and refinement continue in the editing chat.
- Copied starters have exact request IDs so the matching saved script can be opened without losing an in-progress form.
- No embedded AI service, analytics integration, dependency or renderer changes.

### Upgrading from beta.6

Use Updates in your existing studio and follow docs/UPDATING.md. Apply reviewed source only; preserve projects, media, catalogs/techniques, scripts and their histories, briefs, hooks, feedback, settings, writing memory and local customizations. Scripting records are optional and created only by explicit saves. Earlier footage-first projects continue normally.


## 0.1.0-beta.6 — 2026-11-01

- A newly registered project now appears first on the Projects home instead of last. Replacing an existing project keeps its place, and reference registrations are unchanged.

### Upgrading from beta.5

Follow docs/UPDATING.md. This release changes scripts/register.py and its docs and tests only; there is no interface, dependency, renderer or data change. Your existing project order is kept as it is: only projects registered after updating go to the top. Prepared for the November 2 public launch.

## 0.1.0-beta.5 — 2026-11-01

- Registry validation now fails when a registered library file exists but the local server would refuse to serve it (outside projects/<slug> or references/<slug>, hidden, or an unsupported type). Updates run this before restarting, so an upgrade cannot silently stop someone's videos from playing.
- New read-only `scripts/check_install.py` compares installed application files with a published release manifest and lists identical, modified (local customizations or older copies) and missing files, so "am I up to date?" no longer depends on the version label.
- docs/UPDATING.md and the Updates page request now require confirming that existing projects and the reference library still open and play before restarting.

### Upgrading from beta.4

Follow docs/UPDATING.md. There is no dependency, renderer or data change. If `python3 style-library/library.py validate` now reports a registered file that would not be served, that item already could not play in the studio: reconcile its registration or the installation rather than moving media. Prepared for the November 2 public launch.

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
