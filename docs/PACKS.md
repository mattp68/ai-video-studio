# Creator packs

A creator pack is one versioned file that holds a creator's own videos, technique families with exact examples, their posters, optional editable recipe folders and the pack's own license. Installing it adds the pack's videos and techniques to the Reference Library and a collection with the pack's name. Pack techniques are creative references to learn from and adapt, not one-click templates.

The pack license is separate from the studio's MIT license. It covers the pack's media, records and recipes; read `LICENSE.txt` in the pack before reusing anything from it. Pack videos are references, not stock footage: recreate a technique with the owner's own footage rather than placing the pack's videos, clips, posters or the author's voice or likeness in the owner's exports, unless the pack license allows it.

## Installing a pack

When the owner asks to install a creator pack (for example "install my Creator Pack"):

1. Find the pack file they downloaded, usually a `.zip` in Downloads. If their browser unzipped it, use the unzipped folder instead; it works the same way. Do not unzip, copy or edit pack files by hand.
2. Run `python3 scripts/pack.py verify <file>` and tell the owner the pack name, version, author, size and license summary.
3. Run `python3 scripts/pack.py install <file>`. Use `--dry-run` first if the owner wants to see what would change.
4. Report the result: what was added, the collection name, where the files went and any warnings. Ask them to reload the Reference Library and choose the pack under Collections. No restart is needed.

If the installer refuses, explain its message and stop. Do not work around a refusal by editing catalog files, renaming records or copying media.

Installing adds:

- the pack's videos as library entries credited to the pack's author, shown under **Other creators** with IDs that start with the pack ID
- the pack's technique families and exact examples, also with pack-prefixed IDs. Each family is its own card in the Techniques tab, separate from every other pack family and from any family the owner already has, even one with the same title
- a pack collection with exactly the pack's items (grouped under **Creator packs** in the Collections menu)
- media, the license and readme in `references/pack-<pack-id>/`, and posters in `style-library/dist/assets/posters/packs/<pack-id>/` and `style-library/dist/assets/techniques/packs/<pack-id>/`
- a record of what was installed in the private `style-library/packs.json`

Installing never changes the owner's projects, personal collections, reference notes, approvals, removed-reference markers, their own library entries or their own technique families. A family the owner already has, even one with the same name or ID suffix, is never merged with a pack family; the same ID or title is not evidence of the same technique. Pack entries are complete for technique review, so they do not appear in **Find remaining techniques**.

The installer checks the whole pack before changing anything: the manifest, every file's size and SHA-256, safe relative paths only (no absolute paths, `..`, links, special files, hidden files, Windows-reserved names or names that differ only by case), an allowlist of file types and sizes, and that every record uses the pack's own ID prefix and is the pack author's own video. It refuses when a record or file it would write already belongs to the owner, when there is not enough disk space, or when an earlier save needs recovery. Library files are written in one recoverable transaction like other studio saves; copied media is removed again if that transaction fails. If the library would no longer validate afterwards, the installer undoes the install.

## Updating to a newer version

Install the newer file the same way. The installed pack then matches the new version exactly.

- Videos, techniques and examples that keep their IDs keep working everywhere: saved links, personal collections, borrowing notes and the pack collection.
- Items the new version drops or replaces are taken out with their files. The owner's personal collections and notes keep their records of those items, which show as unavailable; the report counts them.
- A video whose bytes change gets a new file path; the old file is deleted only after the new library is saved, and only if it still has the bytes the pack installed.
- If the owner hid the pack collection, it stays hidden.
- Installing the same file again changes nothing. It also repairs a missing pack file.
- An older version is refused unless `--allow-downgrade` is given.
- If a pack record was edited in this studio, the update stops and lists it. Ask the owner before rerunning with `--replace-local-edits`.
- The owner's own examples saved into a pack technique family stay in that family. An update that would change or remove a pack video one of those examples uses is refused.

## Hiding or removing a pack

To hide the pack's collection, use **Manage** beside Collections and choose **Remove collection**; **Restore** brings it back. The pack's videos and techniques stay in the library.

To uninstall, run `python3 scripts/pack.py remove <pack-id> --dry-run`, show the owner what would be removed, then run it without `--dry-run`. `python3 scripts/pack.py list` shows installed packs and their IDs. Removing takes out the pack's entries, examples, families and files and hides its collection. A family that also holds the owner's own examples stays, as the owner's family. Installing the same pack file again restores everything with the same IDs, so old links work again.

## Recipes

A pack technique can include an editable HyperFrames recipe: a folder recorded in the family's `recipe` field, such as `references/pack-creator-pack-1/recipes/tech-creator-pack-1-orbit-1a2b3c4d5e6f/`. To use one, copy the folder into the project's current version folder and adapt it to that project's footage, script and brand, as the pack license allows. Never edit the installed recipe in place; updates replace it. Like any composition, inspect it before running it.

## Building a pack (pack author)

Run these in the author's own studio. Building only reads the studio and writes the one output file.

1. Save the exact examples (and any whole videos or moments) to a personal collection, for example "Creator Pack 1". Only your own videos (`collection: mine`, one creator) can go in a pack; carousels are not supported yet. Buyers see one Techniques card per technique family, so give each technique you want as its own card its own family in your catalog; examples in one family share a card. The build report lists families that hold more than one example.
2. Write the pack license as a text file outside the studio library, and pass a one-sentence `--license-summary` that buyers see before installing.
3. Check the collection:

   ```
   python3 scripts/pack.py build --collection "Creator Pack 1" --pack-id creator-pack-1 --version 1.0.0 --license ~/Documents/creator-pack-license.txt --dry-run
   ```

   The builder refuses another creator's videos, stale collection items (save them again) and anything it cannot package. It warns about music credits, sound plans with music, asset-ledger rows that mention licensed, stock, third-party or reference-library media, notes that mention licensing and videos with no asset ledger. Warnings are advisory: it cannot prove clearance. Leave out any video that uses someone else's footage or music you may not resell. `--strict` turns warnings into a stop.
4. Fix buyer-facing wording without changing your library by passing `--overrides <file.json>`:

   ```json
   {
     "entries": {"<your entry id>": {"summary": "…", "evidence": "…", "source_url": null}},
     "techniques": {"<family id>": {"title": "…", "summary": "…"}},
     "examples": {"<family id>@<example id>": {"label": "…", "evidence": "…"}}
   }
   ```

   Entries accept title, subtitle, summary, tags, traits, keep, avoid, evidence, moments and source_url (null removes the link). Families accept title, category, summary, direction, aliases, keep, avoid and evidence. Examples accept label and evidence. The builder warns when exported text mentions a private file path.
5. Optional recipes: pass `--recipes <folder>` containing one folder per technique, named with your family ID (such as `tech-orbit`). Buyers edit recipes into their own videos, so include only code, text and assets they may use, not your footage or voice. Hidden files, `node_modules` and unsupported file types are refused or left out; video and audio files are flagged.
6. Build outside the studio, for example `--out ~/Desktop/creator-pack-1-1.0.0.zip`. The report includes the file's SHA-256, which you can publish so buyers can check their download. The same collection and inputs produce a byte-identical file (checked on Python 3.11 and 3.13).
7. Test-install the file into a disposable fresh studio, never into your own.

For a later version, keep the same `--pack-id`, raise `--version` and build from the updated collection. IDs come from your source IDs, so unchanged items keep their links in buyers' studios. A new version of one of your videos becomes a new pack entry, and its examples get new IDs.

Packs ship full source videos, not per-example excerpt clips: examples are windows into the real edit, so **View full video**, exact checksums and the existing example player keep working, nothing is re-encoded, and the file is deterministic. Short-form videos keep packs small (a 13-video, 66-example selection measured 418 MB). Very large packs warn above 3 GB; a single video may be at most 4 GB and a pack 16 GB.

## Pack format, version 1

A pack is a ZIP (stored, not compressed) containing:

| Path | Contents |
| --- | --- |
| `pack.json` | Manifest: `format` (`ai-video-studio-pack`), `format_version` (1), `pack_id`, `name`, `version` (`1.0.0` style), `author` (`name`, `creator_id`, optional `url`), `license` (`title`, `summary`, `file`: `LICENSE.txt`), optional `description`, and `files`: every other file with `path`, `bytes` and `sha256` |
| `library.json` | `entries` (videos), `techniques` (families with their examples) and `members` (the collection's exact items) |
| `LICENSE.txt` | The pack license |
| `README.md` | Buyer-facing summary and install steps |
| `media/<entry-id>-<sha12>.<ext>` | Videos (mp4, mov, webm, m4v), named by content |
| `posters/videos/…`, `posters/examples/…` | Poster images (jpg, png, webp) |
| `recipes/<family-id>-<sha12>/…` | Optional editable recipe folders |

Entries carry `id`, `title`, `version`, `creator`, `creator_id`, `summary`, `duration`, `media`, `poster` and `source_sha256`, plus optional `subtitle`, `creator_handle`, `creator_aliases`, `tags`, `palette`, `traits`, `keep`, `avoid`, `moments`, `evidence`, `poster_at` and `source_url`. Families carry `id`, `title`, `category`, `summary`, `direction`, `aliases`, `keep`, `avoid`, `evidence`, `default_example`, `examples` and optional `recipe`. Examples carry `id`, `style_id`, `label`, `start`, `end`, `poster_at`, `poster` and `evidence`; times use the video's own clock. Members are `{"kind": "example", "technique_id", "example_id"}`, `{"kind": "reference", "reference_id"}` or `{"kind": "moment", "reference_id", "time"}`.

Entry and example IDs start with `<pack-id>-`; family IDs start with `tech-<pack-id>-`. Every file must be listed with its checksum and referenced by a record. Unknown fields, files or newer format versions are refused; a newer format needs a studio update first.

## Product page install steps

Paste-ready text for a store page or download email:

> **Install your pack**
>
> You need AI Video Studio (free: github.com/mattp68/ai-video-studio) and the editing chat you use with it, Claude Code or Codex. Already have a studio? Use it. Your projects and personal library stay in place.
>
> 1. Download the pack file. You don't need to unzip it. (If your browser unzipped it into a folder, that works too.)
> 2. Open your editing chat in your studio folder and send: **Install my Creator Pack from ~/Downloads/creator-pack-1-1.0.0.zip** (use the file's actual location).
> 3. Reload the Reference Library and choose the pack under **Collections**.
>
> Updates work the same way: download the new version and ask your chat to install it. These are creative references to learn from and adapt, not one-click templates. See LICENSE.txt in the pack for what you may do with it.
