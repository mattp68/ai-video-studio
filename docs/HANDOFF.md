# Continue without the old chat

Read the project's current STATUS.md, approval-state.json if present, brief/design/board and review notes. Explicit versioned review decisions override old pending wording for that checkpoint. Save accepted baseline, latest experiment, exact files, build commands, input clocks/time map, checked/unchecked areas and next action.

Use a project descriptor (projects/<slug>/studio-entry.json) and register it with `python3 scripts/register.py project projects/<slug>/studio-entry.json`. That verifies files and refreshes note fingerprints after you have read them. A new intake descriptor is created by studio.py new. Update artifact IDs, roles, version, paths and current primary after a new review, preserving previous accepted/history entries. Do not use --replace on an approved record without explicitly reconciling its saved decisions. Read style-library/PROJECT-NAVIGATION.md for the exact contract.

If a copied link names a reference, parse the hash and resolve the registry ID/example/slide directly even if its server is stopped. Inspect actual source media/notes; take only the requested behavior. User/new brief wins. Links do not upload local files. Missing access should produce a targeted request, not invented analysis.

Maintain one representative reference per project/source. Register first full reviews as pending. Promote to preferred/final only with actual user feedback. Keep original source identity, creator/aliases, rights, useful moments and exact technique-version/hash/windows. Run prepare_assets.py and validators when source data changes. Do not duplicate every draft.

Website approvals write exact file hashes and append decisions. They do not render or publish. Do not fake an approval to test UI; use temporary fixtures. New production changes must reconcile current approvals, retain accepted files and record a new review round.

## Analyze in chat handoff

A UI-saved link already has a stable ID in catalog.json. Resolve its library URL and read reference_note before opening the original source. Update that same entry with verified creator/style/useful moments and source-backed excerpts only where access and rights permit. Preserve source URL, ID and user note; do not replace it with a duplicate curated record. analysis_status=not_analyzed means no observation yet; partial/analyzed must state what was actually inspected. Keep limitations honest and retain pending status if unavailable. A local preview needs an actual source file, measured duration, a versioned genuine poster and the usual evidence/technique snapshots. The generic link poster is never proof of a video frame.
