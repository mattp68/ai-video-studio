# Local tools

Website/registries: Python standard library, loopback server. Media probing/proxies/precise cuts/audio/assembly: FFmpeg/FFprobe. Contact sheets: Pillow. Motion/compositing: pinned HyperFrames and GSAP installed from package-lock.json. Optional word timing: MLX Whisper on Apple Silicon macOS. No private/global skill path is required.

Use `.venv/bin/python scripts/studio.py --help` on macOS/Linux (Windows uses .venv/Scripts/python.exe). Commands: new, ingest, prepare, transcribe, assemble. Review metadata first. Assembly preserves originals, pads to fit, refuses HDR without explicit conversion, emits time map/script and rejects existing outputs. It does not automatically choose the best performances, design captions or mix music.

Use `python3 scripts/hf.py <command> ...` for the local renderer. It sets no-update/telemetry flags and fails clearly when npm dependencies are missing. Read the installed CLI help and current official composition docs before changing architecture: https://hyperframes.heygen.com/concepts/compositions . Timed media uses class clip and explicit starts/durations/media offsets; one paused timeline is registered by composition ID. Keep assets local and seek behavior deterministic. Use check, preview, render and inspect actual encoded frames. The sample is editable in examples/studio-check/index.html.

Source/rights ledger: origin, owner, permission, purpose and limitations. Epidemic Sound is an optional source to evaluate with the user's own coverage; no tracks/account coverage ship here. Record edited-time cues and listen for clipped words, masking and excessive repetition. No background music by default.

Run python3 scripts/setup.py --check for the capability report. It checks local prerequisites/packages and leaves browser/site/image-generation availability for the assistant to verify in chat. docs/CAPABILITIES.md explains fallbacks. Simple sound effects can be synthesized locally with code and FFmpeg; a commercial library is optional. Local availability does not prove audible quality.
