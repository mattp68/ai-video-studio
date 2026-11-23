# AI Video Studio — 0.1.0-beta.18

Approving a step in the Studio no longer stops the project. After you approve a spoken cut or a storyboard, or reopen a version for changes, your editing chat can add the next stage. Before, its registration step refused any project with a saved decision. Every approval stays as it is: the chat cannot drop or change a file you approved, and new work gets its own version.

**Approve & mark final** no longer stops with "This library ID is already in use" when a project was never linked to its own library entry. Approval now uses that entry, moves it to the version you approved and keeps the earlier version's techniques with the earlier version. Entries from other projects are still refused.

Projects show a thumbnail even without a chosen cover: the library poster, the prepared poster, a storyboard frame or a frame from about one second into the video. Nothing is generated or written. A project with no picture at all, such as a script that hasn't been recorded, keeps the placeholder.

There is no owner-data migration and nothing is deleted. Dependency pins and renderer code are unchanged, so no setup rerun is needed. The numbered GitHub release is authoritative for publication state.

## Previous release — 0.1.0-beta.17

Your editing chat now picks techniques from your Reference Library when it plans a storyboard, borrowing one wherever it fits a scene and designing something new where nothing does. Each storyboard scene shows its pick, whose example it is, a link to that exact example and why it fits, or **New** for a move designed from scratch. Your own inspiration comes first, any pick can be swapped or dropped, and picks can be turned off in Start a project or in chat. The lookup only reads the library and uses no AI. See docs/TECHNIQUE-PICKS.md.

The renderer moves from HyperFrames 0.9.16 to 0.9.71. The studio's sample renders pixel-identical, and real iPhone HDR footage and an 80-second edit kept the same frames, duration and audio sync. Renders of 4K footage use much less temporary disk. Scripts and scene files a composition loads must now sit inside its folder, and a render that would miss one stops with an error instead of producing a broken video. A mix that peaks above -1 dBFS keeps up to about 2 dB more peak. The two moderate npm advisories in the editor's local server are cleared. See docs/TOOLING.md.

Windows gets early support. Saved library paths always use forward slashes, every studio text file is read and written as UTF-8, and setup now completes on Windows. In CI on Windows, setup, the smoke test's edit and render, and the full Python and UI suites pass, including creator pack install and removal. It has not yet been used on a real Windows PC, and on-device transcription stays Apple Silicon only. Nothing changes on macOS or Linux.

There is no owner-data migration and nothing is deleted. A media installation runs full setup once, which downloads the new render browser (about 200 MB). The numbered GitHub release is authoritative for publication state.
