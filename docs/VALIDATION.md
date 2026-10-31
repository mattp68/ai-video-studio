# Current release validation — 0.1.0-beta.3 (2026-10-31)

- 125 Python tests and 51 dependency-free Node UI tests pass locally and in a separately extracted, source-only installation. JavaScript syntax, exact committed source, version/tag consistency and empty starter seed checks pass. The release keeps the renderer and dependency pins unchanged.
- Full fresh setup installed the hashed core and optional Apple Silicon transcription dependencies. pip check and MLX Whisper/Pillow/certifi imports passed. The initial project/reference/technique seeds were empty. Package and browser caches on this same machine were reused; this is not an independent-machine or fresh-assistant pilot.
- The fresh installation completed a synthetic 2.4-second audio/video assembly and a separate 5-second 1080×1920 HyperFrames render. Source media was unchanged, durations/streams passed, and an actual decoded render frame was visually inspected. This does not test human take selection, word accuracy or audible creative quality.
- Populated beta.2 → beta.3 Git and ZIP upgrade rehearsals each preserved hashes for 21 owner files: raw/exported/reference media, projects, a source-pinned technique and evidence, settings, original/versioned scripts, approvals, exact feedback links, borrowing notes, editor copies/sessions and local configuration. Existing links and the technique remained readable. A local README customization was detected and reconciled rather than overwritten.
- New feedback edit/delete/restore actions were exercised only in disposable fixtures, preserving note identity, prior wording and copied content revisions. Source rollback retained the newer correction history and owner data created after upgrading. Older interfaces do not understand deletion markers; docs/UPDATING.md explains the limitation before using old feedback-copy controls.
- The approved browser review covered saved-note corrections/history, stale-window protection and a 33-scene storyboard with long feedback. The scene strip stays under the preview, notes retain their reading position and later selections reveal horizontally. Static 390px/820px layout fixtures were inspected; no physical-device validation is claimed.
- Source export remains an explicit 113-file allowlist with empty examples. Owner projects, catalogs, techniques, previews, feedback, media, credentials, journals and runtime evidence are excluded. Production owner records and media fingerprints are checked separately from test fixtures. Required CI covers Linux/macOS Python 3.11/3.13, Node UI/syntax/source export checks and current npm/core/speech audits.

This is the public launch beta. Broader real-media workflows, fresh assistant sessions and other-platform compatibility remain pilot coverage; full media checks here target Apple Silicon macOS. See docs/PILOT.md. The historical records below retain their original scope and do not supersede this release validation.

---

# Previous release validation — 0.1.0-beta.2 (2026-10-28)

- 118 Python unit tests and 42 Node UI tests pass locally and in a clean source-only installation. New release regressions reject version/lock/install-tag drift and populated starter seeds. Setup regressions preserve populated owner records, raw/exported media, reference notes, feedback/links, scripts, approvals, local source and .env while creating only missing registries.
- An exact 113-source-file preflight export passed scanning and was installed in a fresh directory on this Apple Silicon Mac with the hashed optional speech packages. First-use projects/references/techniques were empty. Full synthetic smoke produced a 2.4s audio/video assembly with its generated original unchanged and a separate 5s1080×1920 HyperFrames render. The encoded sample frame was inspected. pip check and speech/Pillow/certifi imports passed. Package/browser caches on the same machine were reused; this is not an independent-machine pilot or real speech/listening assessment.
- Current npm and core Python audits reported no known advisories. The optional speech scan found four advisories in filelock4.0.12/setuptools84.0.0; those are patched to filelock4.2.1/setuptools84.1.0 using PyPI distribution hashes. The patched speech audit reported no known advisories, and the fresh environment installed/imported correctly. Renderer/GSAP pins are unchanged. These scoped audits are not a complete security certification.
- Populated beta.1 → beta.2 rehearsals passed for an actual Git checkout and an extracted ZIP copy. Each retained SHA256 hashes for21 owner files covering project/index/catalog data, synthetic raw/review/reference media, an exact source-pinned technique and evidence, poster, settings, supplied/saved scripts, approvals, feedback/immutable links, borrowing notes, editor copy/session and .env. The old registries validated before/after; new readers resolved exact saved feedback/script links, earlier borrowing notes and the exact technique example.
- A modified owner README was detected and explicitly reconciled in both rehearsals rather than discarded. Rollback restored affected application source while keeping the customization and a new owner note created after upgrading. Both original registries validated again. This tests the documented assistant procedure; it is not an automatic installer or a fresh human assistant session.
- Release source is selected explicitly and checked against the committed Git tree. Owner projects/catalogs/media/previews/notes, credentials, environments and machine-local test evidence are excluded. Empty starter examples are checked separately from preserved installed data. Actual private/starter owner files are fingerprinted independently of disposable test fixtures.
- GitHub checks cover Python3.11/3.13 on Linux/macOS, all Node UI tests, JS syntax, source-tree/version/export checks and npm/core/speech dependency audits. Workflow actions are pinned by commit. Passing core checks is not a full media workflow claim for those platforms. The final release notes identify the exact successful CI commit.

Still beta: a teammate's real upgrade prompt, fresh Codex/Claude Code sessions, real transcription/take-selection/listening and other-platform full-media workflows need the independent pilot in docs/PILOT.md. The beta.1 installation has no Updates page, so docs/UPDATING.md supplies a direct prompt for that first upgrade. No owner creative project was changed, rendered, approved or published by release QA.

The historical records below retain their original scope; they do not supersede the current release/version above.

---

# Validation — 2026-10-21 local candidate

Verified on Apple Silicon macOS with Python 3.13, Node 23 and FFmpeg 9. HyperFrames stays pinned at 0.8.144. The private working studio was not upgraded.

- Project-local core and optional 37-package transcription environments install; pip check and MLX Whisper/Pillow/certifi imports pass. Pillow is13.0.0 and certifi2026.10.19. Optional model execution/word accuracy was not tested here.
- Final unit suite: 48 tests covering context formatting, HTTP boundaries, project confinement, explicit approvals, exact hashes, persistence/idempotency, stage progression, rollback/recovery, stale source rejection, release exclusion and incomplete smoke-run guards.
- Node syntax and registry validators pass. HyperFrames sample check reports no findings;5.0s1080×1920 motion render succeeds using hardware drawElement capture. Actual encoded sample frame inspected.
- Synthetic source assembly produces2.4s with audio/video and the intended source gap removed; original source hash is unchanged. It also emits a script/time map/proxy/contact sheet. The motion sample is a separate composition. No human delivery, actual spoken joins, transcription accuracy or listening review is claimed.
- Native browser: actual storyboard frame,5s paused/muted video, demo-only final approval, reload persistence, new library registration, reopening and retained accepted reference. Copy reference/compact context verified; original clipboard restored. No observed console errors or desktop overflow. No audible playback.
- A source export was extracted into a new local directory. Setup, unit suite and complete synthetic assembly/render pass there, with no private creator projects available. The initial Projects and Reference Library are empty and show useful first-use instructions. This uses the same machine/cached package/browser downloads; it is not an independent-machine or fresh-agent pilot.
- npm audit reports zero known advisories; pip-audit reports zero known advisories for the core Pillow pin and all37 optional transcription pins, with no skipped packages. These are dependency checks, not a security certification.
- Source export uses an exact allowlist, rejects private registry/media/secret candidates/symlinks and records file hashes. Only local font binaries with their OFL notices are bundled. Owner registries, projects, references, journals, dependencies and logs are excluded.

Detailed machine-local evidence is under ignored runtime/: validation-summary.json, smoke-report.json, audit outputs and screenshots. The export includes this summary; it excludes local reports/paths.

Still required before broad promotion:a fresh Codex and Claude Code setup/edit pilot and team trial with their own footage. October21:the owner approved a public MIT pilot before those trials; the full guide URL can follow. Additional OS/mobile viewport support has not been validated. The code is for personal loopback use, not authenticated hosted teams. Historical local checks below precede the public pilot.

## RC2 — reference intake

Ten additional tests cover non-fetching saved links, tracking/platform duplicates without writes, preserved analysis/source/techniques during edits, stale forms, canonical/unknown creators, unsafe URLs/fields, external catalog changes, corrupt/symlinked storage, threaded additions and POST/GET boundary guards. Native disposable-studio tests verify save → detail, edit/reload, duplicate opening and the copied analysis request with its saved note. Actual working studios were inspected without test saves to their catalogs; original clipboard was restored. The code and tests were also backported to the private studio (36 tests there). No video rerender was needed for this UI/data feature; previous synthetic rendering evidence remains valid for its unchanged composition.

Current source export has86 selected files plus its checksum manifest. Reference journals/test fixtures/saved owner data stay excluded. No external link was fetched by intake or automatically sent to an AI. That RC2 handoff was not a public release.

## RC3 — analysis hierarchy

48 kit/36 private regressions and JS/registry checks pass after the UI refinement. Native disposable tests verify immediate post-save prompt, skip/reopen/reload persistence, exact copied ID/source/note, keyboard More options, edits/duplicate handling and restored normal actions for a simulated completed record. The completed record is synthetic UI state, not actual external-source analysis. Actual studios load with paused/muted previews; no observed desktop overflow/console errors. Owner catalog/index/approval fingerprints are compared at handoff. No backend/dependency/composition change; prior rendering/audit evidence retains its stated scope. The new86-source RC3 export excludes test fixtures and owner data. Public-release/pilot gates remain.

## Public pilot — 0.1.0-beta.1

The finishing pass adds read-only capability reporting and four setup-readiness regressions. Rendering readiness requires the image dependency and is explicitly a prerequisite check; actual browser/rendering is checked by the synthetic workflow. Optional browser/image/account availability is not guessed. Source code is MIT; fonts/upstream terms remain separately attributed. Fresh assistant/team and other-platform tests follow pilot publication. Detailed exact-build check results are recorded at the release handoff.

Pilot handoff checks on October21,2026:all52 unit tests pass; JavaScript syntax and current registries pass. A new source-only directory completed full setup with optional Apple Silicon speech packages, the52-test suite and full synthetic assembly/render. The2.4s audio/video assembly retains its generated original source; the separate5.0s1080×1920 motion render uses hardware drawElement capture and its actual encoded frame was inspected. Fresh-environment pip check and speech/Pillow/certifi imports pass. No speech model execution, human take-selection/listening assessment, fresh assistant session or independent-machine pilot is claimed.

Current npm audit reports zero known advisories; pip-audit reports zero across the core Pillow pin and all37 optional speech pins, with no skipped packages. The87-file source allowlist includes the final MIT license and capability guide and excludes owner data. Export scanning, exact Git tree comparison and manifest checks accompany publication. A legacy style-library/references path is also ignored and explicitly rejected by the exporter. Dependency/heuristic checks are limited checks, not a complete security certification. The full creator studio and existing starter owner catalogs/approvals are preserved.

## October 27 — local UX review candidate

61 starter tests pass, including exact-context feedback persistence/idempotency/stale-save/path and request guards, stable asset links after registry insertion, and exported UI dependency completeness. The separate private studio's 44 tests and both JS/registry checks pass. Disposable native browser checks verify fresh V02 arrival into an already-open V01 tab, capture/save/reload of a 1.25-second note, draft and timestamp preservation across stages, pending reference intake, newest/oldest sorting and combined-reference briefs. Actual private screens were inspected read-only; 390px layouts were inspected with synthetic same-origin viewport fixtures. No new dependencies, API service or rendering architecture were introduced. Existing project/media/approval/index/catalog data stayed unchanged. These are local checks, not independent-machine, audible media or physical-device validation. The candidate is not yet published or tagged.

## October 27 — follow-up UX V16

61 starter/44 private Python tests and six dependency-free Node feedback regressions pass. The Node checks verify exact current-artifact/open-note scope versus explicit all-project scope, storyboard scope across scenes, zero-second capture/draft navigation/removal, saved time and copy state, stale-save retention and unavailable-clipboard manual copy. Native synthetic UI checks verify persistence/reload and copied selection IDs; private views were read-only. Visible source switching, creator/search filters/removable choices and 390px synthetic layouts were inspected. No production records, original media or dependencies were changed, and nothing was pushed to GitHub. Source export remains an exact allowlist, now including the optional Node UI test.

## October 27 — UX V17

67 starter/50 private Python tests and eight Node feedback regressions pass. Six new backend checks cover exact/idempotent selections, stale/applied/foreign input rejection, immutable scope after new notes, corrupt/symlinked storage, concurrent link creation and guarded HTTP retrieval/creation. Native synthetic UI verifies timestamp replacement with retained text, save, compact-copy/reopen/repeat and invalid-link recovery. Actual owner views are read-only. No dependency or production renderer change. New immutable link metadata is project-local and excluded from exports. The Updates page reports preview source0.1.0-beta.1+ux.17 and links to official releases; it makes no claim of checking the current remote or installing an update.

## October 27 — UX V18

74 starter / 57 private Python tests and eight Node feedback regressions pass. Seven additional checks cover visibility metadata round trips, preserved source/technique dependencies, stale/unknown input, duplicate/edit preservation, concurrent/external writes, corrupt/symlink/recovery storage, guarded HTTP state changes and final approvals retaining removal intent. Native disposable browsing verifies Remove/Undo/reload, retained exact technique links and persistent Restore. Actual private uneven cards have identical footer bottom coordinates; header Updates opens the version page. Synthetic 390px header/Updates fit, with no physical-device claim. Owner data is fingerprinted unchanged. No new service/dependency or production render; the exact source-only export is set up/tested in a clean directory on this same Mac. No remote publication.

## October 27 — UX V19

68 private / 85 starter Python regressions and eight Node feedback checks pass, with eleven new reference-note tests covering non-writing reads/copies, timestamps, exact example/slide IDs, source changes, idempotent legacy import, malformed/retried requests, confinement/corrupt storage, concurrent/external changes, source replacement at commit, recovery and HTTP guards. Native disposable checks verify note save/reload, zero/1.2s capture, exact-example and combined copying, explicit analysis copying and older-note import. All JS/registry/export checks and a clean source-only studio setup are recorded in the local handoff evidence. No dependency/renderer change, production media work or remote publication. Owner notes are excluded from exports. Narrow viewports use synthetic width fixtures, not independent devices.

## UX V20 — October 27, 2026

Local preview 0.1.0-beta.1+ux.20. Reusable source changes are ported explicitly to the starter; no remote push, release publication, new dependency or production media/approval edits.

- Private Python suite:84 tests. Starter suite:101 tests. Existing project-feedback Node suite:8 tests. Both project/library validators, JS syntax and diff whitespace checks pass.
-16 new cases cover isolated editor copies, reopening/manual-change retention, exact version/source revisions, history boundaries, missing tools, source/destination confinement, honest sound state, public cover preservation, blocked/failing metadata, DNS/private IP/credential/port guards, bounded redirects, raster types, concurrent catalog changes, symlinked preview storage and same-origin explicit-action HTTP boundaries.
- Native disposable checks:editor working-copy launch opens the local pinned HyperFrames preview; reopening returns the same copy and retains a manual text change with original source unchanged. Public metadata cover retrieval succeeds, retains the intake note and keeps analysis_status=not_analyzed. Actual projects/references were viewed read-only paused/muted.
-390px synthetic layout:editor working-copy explanation/actions and readable missing-preview state fit without overlap. This is a framed browser check, not physical-device coverage.
-Owner catalogs, projects, notes/reviews/approval files are fingerprinted before/after. Covers remain owner media under ignored style-library/dist/assets/reference-previews/; source exporter explicitly rejects that subtree. Working-copy/session data stays in owner projects/runtime.
-Clean source-only archive:105 allowlisted source files. Fresh studio-only setup,101 Python tests,8 Node regressions, JS syntax and empty registry validation are checked from that exact export.

Limits:public metadata availability depends on the source; no login/video downloading or source analysis is performed. No audio was generated or auditioned for this UI change, and old mixes were not replaced. Sound counts/titles summarize the saved plan, not a new listening assessment. Editor availability requires a registered local composition and local prerequisites; independent manual working copies still need the project’s recorded export/finishing steps and a new review. Optional personal libraries use owner-supplied files or an actually available authorized integration, not an assumed account connection.

## UX V21 — October27, 2026

Local preview0.1.0-beta.1+ux.21; no publication or dependency change.86 private/103 starter Python tests and12 Node regressions pass. New transport coverage reproduces a >512KiB social page with declared cover metadata and preserves hard rejection of oversized declared/streamed responses. Analysis-copy coverage checks no automatic copying, exact source/original note, progress-aware labels, clipboard failure/manual-copy recovery and stale asynchronous completion.

Native disposable Add reference → Copy analysis request returns the correct source link/note, confirms Copied, retains the save-specific next step after the real public cover arrives, and leaves analysis_status not_analyzed. Real owner changes are limited to the explicitly reported source’s cover/provenance; all other source identity, notes, analysis and project/review records remain intact. Covers are owner media and excluded from the106-file source export. Public source does not contain that reference or its media.

Fresh source-only setup,103 Python tests,12 Node checks, JS syntax, empty registry validation and manifest/current-source equality are checked from the exact clean export. Public cover availability remains best effort; no video acquisition, source analysis or listening assessment was performed.

## UX V22 — cover thumbnail refresh

Two delayed-cover regressions reproduce the V21 stale-card failure and pass with the correction; all14 Node checks pass. Native disposable Add reference keeps a cover request pending, then verifies the gallery card and open details share the saved image, the fresh-save next step remains and an unsaved borrowing note survives. Closing shows the updated card without reloading. The real reported reference is viewed read-only. Owner catalog/project/settings/review fingerprints remain unchanged. Source-only export/manifest equality, clean studio setup, the103 Python regressions and registry checks are recorded locally; no dependency, source analysis or remote publication.

## UX V23 — final promotion and scripts

Disposable regressions cover known older-version promotion, source/excerpt/note preservation, removal intent, unknown/foreign/stale sources, exact/idempotent approvals, script history and original/assembled separation, stale/reused/invalid requests, unsafe storage, external changes and same-origin HTTP guards. Node checks cover outside-click/Escape menu behavior and script inclusion for video requests. Native synthetic tests verify final promotion, script save/copy/persistence/draft navigation and exact saved-version links. Production project/media/editor/approval/catalog/script fingerprints are checked unchanged. Exact source-only export and a clean studio-only setup/full suite are recorded locally. No actual source performance, sound or new creative export was assessed. No remote publication.

## UX V24 — starter modal and update handoff

Starter regressions cover format-specific requests, retained scripts, close/reload preservation of edited requests, backdrop/Escape behavior, explicit copy without closing, manual clipboard fallback, late clipboard completion, keyboard format selection and blocked storage. Native disposable checks cover Projects/guide/legacy entry points, draft retention, copied next steps, new project arrival without manual refresh, update URL/installed-version copying and a 390px same-origin viewport fixture (not a physical-device test). Source export, clean studio-only setup, full Python/Node suites and registry checks are recorded locally. Owner project/library/media/review/script fingerprints remain unchanged. No AI invocation, production creation/approval, dependency installation or publication.

## UX V25 local preview

Project-starter checks cover optional file locations, plain chat copy, spoken-cut-first context, exact inspiration/saved-note IDs, changed-source rejection, edited-request preservation and browser draft reload. Native disposable checks exercise Videos/Techniques, a non-default example, combined copy, shown saved notes, importing existing selections and responsive layout. Owner files and production media are fingerprinted unchanged. A clean source-only export is checked independently; no production project or approval is used as a test.

## UX V26 local preview

Checks cover optional labels, project-only notes in previews/cards, zero and exact technique timestamps, manual cover-image ranges, draft/reload persistence, source-window validation, stale-source note review and X/Escape navigation. Native disposable checks verify both directions of note editing, one combined copied request and retained source/selection state. Narrow-screen layout and the actual production UI are inspected without saving production notes or approvals. Owner fingerprints and an exact clean source-only export are recorded separately.


## Pending review: feedback history and scene navigation — 2026-10-31

125 Python tests (including20 feedback persistence/HTTP checks) and49 dependency-free Node UI tests pass locally. New regressions cover correction histories, applied-note preservation, idempotent deletion/restore, stale-window changes, exact copied content revisions, legacy selections, newest-first display, per-note correction drafts and persistent storyboard controls. All JavaScript syntax, registry, source-seed and whitespace checks pass. No renderer or dependency pins changed.

Disposable native browser checks exercised inline edit/save, delete, reload and recovery from All saved notes; an older version retained its Applied in V02 note/link. Two tabs verified that a stale correction is preserved and must be compared with the latest saved note before replacing it. Scene15→16 retained page scrollY1006; the scene strip advanced only to reveal the clicked item, and overview remained open on another selection. Real owner views were inspected read-only; six applied notes are visible on the original spoken cut, with a subtle olive focus border/glow.80 owner metadata files are fingerprinted unchanged. These are local UI checks, not independent-device/media validation.

The public change remains on a feature PR for user review. No merge, tag or numbered release is included in this task. Feedback schema1 receives optional history/updated_at/deleted_at fields only on explicit actions, with no migration or seed replacement. Preserve these fields and copied-link records on upgrades and rollback; older interfaces do not understand deletion markers.


### Storyboard layout follow-up — pending PR review

51 Node UI tests pass after adding per-version saved-note scroll retention/new-save reset and horizontal-only active-thumbnail reveal regressions. JavaScript syntax, whitespace and source-seed checks pass. On the actual33-scene board with9saved notes, the scene strip moved from about1449px below the preview to68px below it; the page shortened from2826px to1580px. The list retains its1031px reading position between scenes; choosing scene31 in overview and returning to filmstrip reveals that exact selection without horizontal page overflow. Native390px/820px static viewport fixtures confirm the strip precedes details/feedback on narrow screens. These are local layout checks, not physical-device validation. Owner records remain unchanged.
