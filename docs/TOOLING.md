# Local tools

Website/registries: Python standard library, loopback server. Media probing/proxies/precise cuts/audio/assembly: FFmpeg/FFprobe. Contact sheets: Pillow. Motion/compositing: pinned HyperFrames and GSAP installed from package-lock.json. Optional word timing: MLX Whisper on Apple Silicon macOS. No private/global skill path is required.

Use `.venv/bin/python scripts/studio.py --help` on macOS/Linux (Windows uses .venv/Scripts/python.exe). Commands: new, ingest, new-version, prepare, transcribe, assemble. Review metadata first. Assembly preserves originals, pads to fit, refuses HDR without explicit conversion, emits time map/script and rejects existing outputs. It does not automatically choose the best performances, design captions or mix music.

Use `python3 scripts/hf.py <command> ...` for the local renderer. It sets no-update/telemetry flags and fails clearly when npm dependencies are missing. Read the installed CLI help and current official composition docs before changing architecture: https://hyperframes.heygen.com/concepts/compositions . Timed media uses class clip and explicit starts/durations/media offsets; one paused timeline is registered by composition ID. Keep assets local and seek behavior deterministic. Use check, preview, render and inspect actual encoded frames. The sample is editable in examples/studio-check/index.html.

## Files a composition can use

HyperFrames renders the folder you pass to `scripts/hf.py render` (usually a version folder) and is strict about anything outside it, including files reached through a symlink:

- Images, video, audio, fonts and CSS from outside the folder still render.
- Scripts (`.js`, `.mjs`) from outside the folder are left out. GSAP loaded from a parent folder or from a `vendor/` folder that links elsewhere fails the render with `sub_timeline_script_failure`. Keep `gsap.min.js` and other scripts as real files inside the folder; a clone costs no extra space. For the creator's own older work folders, `python3 scripts/hf.py render <folder> --include-outside-files` renders them unchanged. Don't use that flag on files someone else sent.
- Scene files mounted with `data-composition-src` must be inside the folder. An outside scene is refused even with `--include-outside-files`; copy it in.
- Renders never read `.env` files, Git data, credential or tool-state files, or HyperFrames' own `.hyperframes/` records. Media in other dot-folders still renders, but compositions should not reference `.scratch/`.

Source/rights ledger: origin, owner, permission, purpose and limitations. Epidemic Sound is an optional source to evaluate with the user's own coverage; no tracks/account coverage ship here. Record edited-time cues and listen for clipped words, masking and excessive repetition. No background music by default.

Run python3 scripts/setup.py --check for the capability report. It checks local prerequisites/packages and leaves browser/site/image-generation availability for the assistant to verify in chat. docs/CAPABILITIES.md explains fallbacks. Simple sound effects can be synthesized locally with code and FFmpeg; a commercial library is optional. Local availability does not prove audible quality.

## Disk use

Video work grows quickly, so the studio avoids storing the same bytes twice:

- **Clones instead of copies.** `ingest`, `new-version` and the editor's working copy use copy-on-write clones on disks that support them (APFS on macOS; Btrfs, XFS and bcachefs on Linux). A clone shares the original's data until either file changes, and changing one never changes the other. Other disks (Windows, exFAT, network drives) get an ordinary full copy, so behavior is identical everywhere; only the space used differs. Imports leave the original in place: once the import is confirmed, the original in Downloads can be removed by the user.
- **One command per new version.** `python3 scripts/studio.py new-version projects/<slug>/assembly-v01` creates `assembly-v02` beside it (`--name` chooses another name). It keeps symlinks as links, leaves out `.scratch/`, `.hyperframes/` (so the new version gets its own HyperFrames history), HyperFrames' `.thumbnails/`, `.waveform-cache/` and `.transcode-cache/`, and `node_modules/`, and reports what was cloned or copied. It never overwrites an existing folder.
- **Regenerable files go in `.scratch/`.** Frame dumps, mattes, contact sheets made for checking and temporary renders belong in the version's `.scratch/` folder. HyperFrames history does not track dot-folders, and new versions and editor copies leave `.scratch/` out, so these files are stored once. Never reference `.scratch/` from a composition or a registered artifact; keep finished cut-outs, plates and exports in their normal folders.
- **HyperFrames history.** HyperFrames keeps per-folder undo history in its user cache folder (`~/.cache/hyperframes/history` on macOS/Linux). The pinned version stores audio/video and files over 64 MB by reference only, but it copies other changed files such as PNG frames, which is why `.scratch/` matters.
- **Render frame cache.** Renders extract video frames into a temporary cache (`hyperframes-extract-cache-<user id>` in the system temp folder). Each video is extracted at about the size it is shown, so 4K footage in a 1080p film takes far less space: 14 MB instead of 45 MB for a 3-second 4K clip in a 1280×720 box in the upgrade test. Entries made by an older HyperFrames version are not reused; HyperFrames removes idle entries itself. `check` also keeps a replay record in the version's `.hyperframes/` folder and a small face-detection model in the HyperFrames cache folder.
- **Free space.** `scripts/hf.py render` warns when the project's disk or the temporary render cache has under 10 GB free (`AI_VIDEO_STUDIO_MIN_FREE_GB` changes the threshold; `0` turns it off). `python3 scripts/hf.py clean --dry-run` lists what HyperFrames itself can remove: abandoned render folders, idle video proxies, history for deleted folders and its frame-extraction cache (`--snapshots` adds its snapshot and check images). It covers every folder HyperFrames has history for on this computer, including other studio installations, so review the list before running `clean` without `--dry-run`. These are all regenerable HyperFrames files; it does not remove studio projects, exports or references.

## Pinned renderer maintenance

This release pins HyperFrames 0.9.71 and retains GSAP 3.14.2. Full media setup needs Node >=22.12.0. HyperFrames renders with its own Chrome headless shell (158), which setup downloads. HyperFrames 0.9.71 pins Undici 7.30.1 upstream, which already carries the security fixes; the scoped npm override keeps the tested Undici 7.30.2 within its 7.x line. Keep the override and package-lock.json together, audit after any dependency change and rerun local rendering/editor checks before removing or changing it. Do not run npm audit fix --force or an unpinned upgrade in an owner's studio.

When a mix's true peak goes over -1 dBFS, HyperFrames limits it only as far as needed, starting at -1 dBTP. HyperFrames 0.9.16 limited such mixes to -3 dBTP, so a re-render of a hot mix can have peaks up to about 2 dB louder. Mixes that stay under the ceiling render unchanged.

Local check, render and the isolated editor handoff were exercised with synthetic sources; an app update does not rewrite accepted compositions or videos. The editor's Share and cloud export buttons upload to HeyGen with the creator's own account; the local workflow does not use them, and publishing stays an explicit decision. Custom Lambda/Cloud Run owners must migrate their own optional stacks together with their SDK; this release does not deploy or validate cloud infrastructure.
