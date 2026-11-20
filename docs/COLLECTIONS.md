# Collections and library filters

A technique family groups related behaviors. An example is a specific, source-backed use of that technique. A collection groups chosen examples and references across families and creators; it does not create a new family or change source ownership.

## Saving and browsing

The compact library heading leads directly to format tabs and browsing controls. How to use references expands inline when needed and starts collapsed. First-use steps appear only when the whole library is empty. The technique-review reminder stays compact and dismissible; Library options retains access after dismissal.

Expand an example and use the quiet **Save to collection** action below its borrowing controls. Whole-reference options also offer **Save to collection**. Choose a personal collection or create one with a name. Selection options also offers **Save selection to collection** for the exact current examples, whole references, slides and moments. Saving keeps the current editing picks and does not include edit-specific borrowing directions.

The Collections selector sits beside Search in Videos, Carousels and Techniques. Collections, Creator, Category and Techniques use the same searchable checkbox menus. Choices apply immediately and menus stay open while checking several values. No choices means All. Each closed control summarizes its first choice and the number of additional choices. Active filter chips remove individual choices; Clear inside a menu clears that group.

Choices within one group match **any** checked value (OR). Different groups must **all** match (AND). For example, two creators and two techniques show either technique from either creator. Several collections combine their exact memberships without duplicating cards or widening families. A source cannot satisfy a technique filter through an unrelated example outside the selected collections. Category is a family's broad classification; Techniques selects actual family IDs. Existing source tags remain unchanged and searchable, but are no longer a separate filter or treated as proof of a technique. Carousel technique filtering requires explicit `technique_ids` on its catalog entry or slide; categories can be recorded explicitly in `categories`. Keywords do not create these associations.

Source (My work / Other creators / All) and Sort remain single-choice. Source, Creator, Collections, Category, Techniques, Search and Sort persist across tabs and reload. Availability applies only to source formats. Clear filters, beside Filters whenever filtering is active, resets Source, Collections, Creator, Category, Techniques and Availability while keeping search text, sort order, editing picks and notes. Search has its own clear action. Sort by sits beside the result summary; neither search nor sorting is counted as a filter. The Filters badge counts active groups inside its panel, not each checked value. Empty results retain the chosen filters.

Membership is exact. A collection containing one example in a four-example family shows that example, its poster, count, copy target and + target. The source video appears as context without adding its other examples to the collection. Full-reference membership includes the source in Videos or Carousels but does not silently include every technique from it. Slide and moment memberships retain their positions. Filtered detail panes offer **Show all examples** as an explicit way to browse the wider library. An existing direct link remains available even when outside the current filter.

**Manage**, beside the Collections label above the filter, opens the collection overview for names, contents and removal. Removing a member has Undo. Removing a collection keeps its library items and offers Restore, including after reload. Collections are optional; no folder hierarchy or organizational setup is required.

## Installed creator packs

An installed pack is another collection with curated exact memberships. Owners can browse it, save its examples into personal collections, or hide/restore it. Personal collections and edit-specific notes remain separate. Pack membership never changes a source's creator, source collection, approval, or Used in my work status.

The studio has no storefront, teaser, purchase link, account gate, billing or media downloader. Only installed packs appear in the selector. `python3 scripts/pack.py install <file>` installs a pack file the owner already has: it verifies it, installs its library records and media, and creates or updates its collection with exactly that version's items. An update keeps the owner's hidden marker. See docs/PACKS.md.

`python3 style-library/saved_collections.py import <manifest.json>` remains a lower-level membership seam for records that are already in the catalog. Its manifest has only pack_id, version, name and members; it does not import media or catalog entries, and a newer version adds memberships while retaining earlier ones. Use the pack installer for pack files.

## Owner records and guards

The optional, private `style-library/collections.json` has schema_version 1, collections and request identities. No first-install seed or upgrade migration creates it. Each collection has a UUID-based ID, name, kind (personal or pack), members and recoverable history. Soft removal adds deleted_at. Members are one of:

- example: technique_id + example_id
- reference: reference_id
- slide: reference_id + one-based slide
- moment: reference_id + numeric source time

Members also pin source version, path, hash when known and original URL; examples pin their ID and window, and slides pin their path. Stable identity deduplicates repeated saves. Earlier source examples remain members of the earlier source instead of switching to a replacement version. Missing or removed library items retain membership and can be removed from the collection without losing other records.

GET /collections is read-only. Explicit POST /collections requires the same-origin action header, a current file revision, a request UUID and valid exact membership. Atomic transactions verify the catalog and owner file revisions before writing only collections.json. Stale source or collection changes reject saves and preserve the draft for review. Pack membership is not editable through personal collection actions. There is no raw collections.json HTTP route.

## Updates and rollback

Preserve collections.json, including all memberships, snapshots, request identities, removed markers and histories, alongside every existing owner project, media, library, technique, setting, script and feedback record. It is ignored by Git and rejected by the release exporter. Empty starter examples must never replace populated registries. Application updates require no collection data rewrite.

Source rollback retains collections.json and newer owner work. Earlier source ignores collections; restoring compatible source makes them available again. Keep the browser filter key ai-video-studio-library-filters-v1. It is independent of editing selections, saved directions and Clear/Undo state.
