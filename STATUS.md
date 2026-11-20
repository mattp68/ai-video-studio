# AI Video Studio — 0.1.0-beta.17

Your editing chat now picks techniques from your Reference Library when it plans a storyboard, borrowing one wherever it fits a scene and designing something new where nothing does. Each storyboard scene shows its pick, whose example it is, a link to that exact example and why it fits, or **New** for a move designed from scratch. Your own inspiration comes first, any pick can be swapped or dropped, and picks can be turned off in Start a project or in chat. The lookup only reads the library and uses no AI. See docs/TECHNIQUE-PICKS.md.

The renderer moves from HyperFrames 0.9.16 to 0.9.71. The studio's sample renders pixel-identical, and real iPhone HDR footage and an 80-second edit kept the same frames, duration and audio sync. Renders of 4K footage use much less temporary disk. Scripts and scene files a composition loads must now sit inside its folder, and a render that would miss one stops with an error instead of producing a broken video. A mix that peaks above -1 dBFS keeps up to about 2 dB more peak. The two moderate npm advisories in the editor's local server are cleared. See docs/TOOLING.md.

Windows gets early support. Saved library paths always use forward slashes, every studio text file is read and written as UTF-8, and setup now completes on Windows. In CI on Windows, setup, the smoke test's edit and render, and the full Python and UI suites pass, including creator pack install and removal. It has not yet been used on a real Windows PC, and on-device transcription stays Apple Silicon only. Nothing changes on macOS or Linux.

There is no owner-data migration and nothing is deleted. A media installation runs full setup once, which downloads the new render browser (about 200 MB). The numbered GitHub release is authoritative for publication state.

## Previous release — 0.1.0-beta.16

Creator packs can be installed into an existing or new studio. A pack is one versioned file holding a creator's own videos, technique families with exact examples, posters, optional editable recipes and its own license. Ask your editing chat to install it (python3 scripts/pack.py install); the pack's techniques then appear in the Reference Library, each as its own card, under a collection in Collections → Creator packs. Installing never changes your projects, personal collections, notes or approvals, and packs can be updated or removed. Pack authors build packs from a personal collection with python3 scripts/pack.py build. See docs/PACKS.md.

There is no owner-data migration and nothing is deleted. The numbered GitHub release is authoritative for publication state. Dependency pins and renderer code are unchanged.
