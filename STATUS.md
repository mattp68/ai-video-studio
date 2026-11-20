# AI Video Studio — 0.1.0-beta.16

Creator packs can be installed into an existing or new studio. A pack is one versioned file holding a creator's own videos, technique families with exact examples, posters, optional editable recipes and its own license. Ask your editing chat to install it (python3 scripts/pack.py install); the pack's techniques then appear in the Reference Library, each as its own card, under a collection in Collections → Creator packs. Installing never changes your projects, personal collections, notes or approvals, and packs can be updated or removed. Pack authors build packs from a personal collection with python3 scripts/pack.py build. See docs/PACKS.md.

There is no owner-data migration and nothing is deleted. The numbered GitHub release is authoritative for publication state. Dependency pins and renderer code are unchanged.

## Previous release — 0.1.0-beta.15

Techniques are no longer missed when a video is approved in the Studio. The editing chat prepares technique examples for every version it delivers for review, in step-by-step projects and in single requests that edit a supplied video, and reuses unchanged examples on later versions. Approval still publishes only the plan for the exact version chosen. The approval panel says plainly when nothing is prepared, and a finished video with no techniques in the library offers Find its techniques for that video. See docs/TECHNIQUE-CATALOGING.md.

There is no owner-data migration and nothing is deleted. The numbered GitHub release is authoritative for publication state. Dependency pins and renderer code are unchanged.
