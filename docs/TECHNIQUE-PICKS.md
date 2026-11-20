# Technique picks from your library

## How it works for you

When your editing chat plans the storyboard, it looks through your Reference Library for techniques that fit each part of your video. It searches your own videos, other creators you saved and any creator packs you installed. In the Studio, each storyboard scene then shows a **Technique** line: the technique it borrows, whose example it is, **See example** to watch that exact example in your library, and one line on why it fits. A scene that reuses a move from a recent project says so, and a move designed from scratch shows **New:** with its name.

You stay in charge:

- **Swap or drop any pick.** Leave a note on that storyboard scene ("use the orbit here instead", "no effect here") or say it in chat.
- **Your own picks come first.** Inspiration you chose in Start a project, library links you copied into chat and borrowing notes you saved always win over anything the chat finds.
- **Fresh ideas when nothing fits.** The chat borrows only when a technique really suits the moment. Otherwise it designs something new and labels it **new**. After you approve the video, new moves are added to your library like any other technique, so every video you finish makes the next one easier.
- **Variety.** The chat avoids repeating a move from your last few projects unless you ask for it ("use the same zoom as last time").
- **Creator packs.** Pack techniques are recreated with your own footage, following the pack's license. The pack's videos never end up in your export unless its license allows it.
- **Turn it off.** Untick **Pick techniques from my library** in Start a project, or tell the chat "no library techniques". It then uses only the inspiration you chose.

An empty or small library is fine. The chat simply designs more of the moves itself until your library fills up.

## For the editing chat

### When to run recall

Run recall when you plan the storyboard (docs/WORKFLOW.md step 3), after the spoken cut, when the words and timing of each beat are known. Run it again while building (step 4) for any beat that still has no technique, and when a review note asks for a different move.

Skip it when the creator opted out: the starter request says "Don't pick techniques from my library", the creator said so in chat, or brief.md records `Library technique picks: off`. Record the creator's choice in brief.md either way, so later chats follow it. Script-only work doesn't need it.

The creator's explicit choices come first. Inspiration from the starter request, copied `#technique=…` or `#style=…` links and saved borrowing notes decide the beats they target. Run recall only for the remaining beats, and never replace an explicit pick with a recalled one.

### Run it

```sh
python3 style-library/technique_recall.py --project <slug> \
  --beat "Hook: I say you don't need to learn editing; a big statement fills the frame" \
  --beat "I name three tools; each one appears as I say it" \
  --beat "Before and after: my raw take, then the finished edit"
```

Pass one `--beat` per storyboard beat, in order. Describe what is said and what the viewer should see, in plain words, rather than only the topic. For a single beat or a whole brief, use `--query "<text>"` instead. If the results look unrelated, rephrase in plain technique words ("a zoom into the screen" rather than "transition from the intro") and try again.

Options:

- `--project <slug>`: the project being planned. Its own picks are marked, and it is left out of "recent projects".
- `--limit N` (default 5) techniques per beat and `--examples N` (default 2) exact examples per technique.
- `--exclude tech-x` or `--exclude tech-x@example-id`: leave out picks the creator dropped. Repeatable.
- `--recent N` (default 5): techniques used in the creator's N most recent projects rank lower. Use `--recent 0` when the creator asks for a move they used recently.
- `--source mine|others|packs` limits the search to the creator's own videos, other creators or installed packs.

The same function is available in Python as `technique_recall.recall(query=None, project_id=None, limit=5, examples=2, recent=5, exclude=(), source='all', beats=None)`, with `style-library` on the import path.

### Judge each candidate

The tool matches words; you decide what fits. For each candidate, read its summary and direction, then inspect the exact example (`media_path` between `start` and `end`, and its poster) before borrowing it. Borrow a technique only when the move serves the beat's purpose, not because a word overlaps; `matched` and `unmatched` show which of the beat's words it shared. Results are ordered by score, but the score is only a retrieval aid.

Prefer variety. Avoid a technique in `recently_used_in` unless it is clearly the only fit or the creator asked for it, and avoid repeating one move across beats (`also_top_for_beats`) unless the repetition helps the story. Pick the exact example closest to the beat, and say whose it is. When nothing fits, design the move yourself and label it new.

### Show the picks in the storyboard

For every scene, name the technique, link the exact example and give one short reason:

```
Technique: Checklist reveal, "three pills sharpen as named" (@kallawaymarketing)
http://127.0.0.1:4870/#technique=tech-checklist&example=checklist-kallaway-blur-pills
Why: you name three tools in a row, so each one lights up as you say it.
```

or, when nothing in the library fits:

```
Technique: new, "receipt countdown"
Why: nothing in your library shows a running total.
```

Write the same in STORYBOARD.md and in the scene's `technique` field in the project descriptor (see style-library/PROJECT-NAVIGATION.md), so the Studio shows it beside the scene:

```json
"technique": {"technique_id": "tech-checklist", "example_id": "checklist-kallaway-blur-pills",
              "title": "Checklist reveal", "creator": "@kallawaymarketing",
              "why": "You name three tools in a row, so each one lights up as you say it.",
              "repeat": "Kallaway style"}
```

Add `repeat` with the recent project's title only when the result's `recently_used_in` lists one. For a new move use `{"new": true, "title": "Receipt countdown", "why": "…"}`. The Studio only displays this field; leave it out of a scene with no technique. When you present the storyboard, tell the creator they can swap or drop any pick.

### Swaps, drops and the opt-out

Apply a swap or drop from a storyboard note or chat message like any other review note: update the scene, record it in review-notes.md and pass dropped techniques to `--exclude` when you run recall for that beat again. A creator's opt-out lasts for the project until they turn picks back on.

### Pack techniques

A result with `pack` set comes from an installed creator pack. Read the license in `pack.license_file` and follow AGENTS.md "Creator packs": recreate the move with the owner's footage, keep the pack's videos, clips, posters, voice and likeness out of the export unless the license allows them, and copy the technique's `recipe` folder into the project's current version folder before adapting it. Never edit the installed recipe.

### After approval

Prepare and catalog the delivered version's techniques as usual (docs/TECHNIQUE-CATALOGING.md). Reuse the borrowed family's ID for a borrowed move and create a new family for a move labeled new. That is how the library grows, and how recall knows a move was used recently.

## Recall output

The command prints JSON. `schema_version` is 1; later versions only add fields.

- Top level: `schema_version`, `project_id`, `source`, `recent_projects` (IDs, newest first), `library` (`techniques` and `examples` searched, `all_examples` in the catalog) and `note`. A `--query` call has `query` and `results`; a `--beat` call has `beats`, each with `beat` (its number), `text` and `results`.
- Each result: `technique_id`, `title`, `category`, `summary`, `direction`, `keep`, `avoid`, `recipe` (folder or null), `pack` (null, or `id`, `name`, `license_file`, `license_summary`), `score`, `matched`, `unmatched`, `used_in_my_videos`, `recently_used_in` (`project_id`, `title`), `in_this_project`, `also_top_for_beats`, `reason` and `examples`.
- Each example: `example_id`, `token` (`technique@example`), `label`, `start`, `end`, `link` (`#technique=…&example=…`), `url` (the full local link when the studio is running, otherwise null), `media_path`, `poster_path` and `source` (`reference_id`, `title`, `creator`, `creator_id`, `kind`: `mine`, `other_creator` or `pack`, `project_id`, `pack_id`).
- Errors print `{"schema_version": 1, "error": "…"}` and exit with status 1.

Recall shows only what normal library browsing shows: removed references, hidden examples, earlier archived versions and examples whose source changed are left out. Families used in a project are found from its storyboard `technique` fields, its prepared technique plan, its published library examples and `#technique=` links in its registered notes. Projects are ordered by their last registration (`synced_on`).

The tool reads style-library/catalog.json, projects.json, packs.json, runtime/server.json and each project's technique-plan.json and registered notes. It never writes, makes no network or AI requests, and needs only Python's standard library. All of these are the owner's private records; nothing new is stored and updates need no migration.
