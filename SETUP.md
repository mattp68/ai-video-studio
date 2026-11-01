# Set up your studio

Start in this repository’s root. Read AGENTS.md. Use the included working code; there is no need to reconstruct the app from screenshots.

## 1. Get your copy and check the machine

For a reproducible installation, use the **v0.1.0-beta.4** [release](https://github.com/mattp68/ai-video-studio/releases/tag/v0.1.0-beta.4): clone and check out that tag, or download its source ZIP and extract it into a new folder. Open that folder in Codex or Claude Code. Use your own assistant account. Git is needed for cloning; a ZIP works without it.

The home base needs Python 3.11+. Full media work also needs Node 22+, npm, FFmpeg and FFprobe. Python 3.13 and a supported Node LTS release are sensible starting choices for the pilot. Run `python3 scripts/setup.py --check`; a nonzero exit means required media dependencies are not ready yet, and the report explains what is missing.

If Python is not available, the assistant cannot run this script yet. Install it from [Python’s official downloads](https://www.python.org/downloads/) first. Missing Node/npm and FFmpeg should come from [Node’s downloads](https://nodejs.org/en/download) and [FFmpeg’s official download guidance](https://ffmpeg.org/download.html), or an established OS package manager with your authorization. On a managed work computer, follow your organization’s installation process. The setup script reports missing system tools; it does not install them or alter your shell/profile.

Full media validation so far is Apple Silicon macOS with Python 3.13, Node 23 and FFmpeg 9. Other platforms need the checks in docs/PILOT.md; do not claim full Windows or Intel/Linux speech compatibility. See [the capability guide](docs/CAPABILITIES.md).

## 2. Install project dependencies

```sh
python3 scripts/setup.py
```

This creates .venv, installs hash-pinned Pillow, runs npm ci from the lock, downloads/verifies HyperFrames’ render browser if needed and creates empty personal catalogs/settings only when missing. Re-running preserves projects/settings. It copies GSAP into the synthetic sample. Internet is needed for dependency/browser downloads. The local home base and renderer need no additional AI API key.

For the home base alone, use `python3 scripts/setup.py --studio-only`. It skips media packages, Node and render-browser downloads. It does not validate video editing/rendering.

For local speech on an Apple Silicon Mac, use `python3 scripts/setup.py --transcription`. This includes the full setup and the separate hashed speech dependencies. The default setup prompt requests this on supported Macs. The first transcription downloads a model from Hugging Face and uses disk/bandwidth; setup does not claim that a model has already run. On other platforms provide a word-timed transcript or choose an explicitly authorized supported transcription tool. Run transcription through the project’s .venv Python.

## 3. Check what is ready

Setup prints a capability report. Run it again with `python3 scripts/setup.py --check`. It distinguishes the local studio, rendering prerequisites, transcription and basic sound synthesis. Browser access, image generation and external accounts must be checked in the editing chat; they cannot be inferred from a package installation. Optional capabilities do not block the home base.

```sh
python3 -m unittest discover -s style-library -p 'test_*.py' -q
python3 style-library/project_index.py validate
python3 style-library/library.py validate
python3 scripts/smoke.py
```

Smoke generates a small synthetic source, makes a two-cut assembly/time map/script, checks a rendered animation and prepares a demo checkpoint/actual board frame. It does not approve the demo. Read its report before saying setup passed. The sample does not assess human performance, real spoken joins, caption accuracy or artistic quality. A previous complete smoke run is preserved rather than silently rerun; use a fresh directory for a new full test.

## 4. Open your home base

```sh
python3 style-library/start.py
```

Use the HTTP address it prints, not the HTML file. If another studio is running, this copy chooses another free port without stopping it. Keep the service local; public GitHub source does not mean public hosting of personal media. Personalize style-library/settings.json if desired; it remains ignored local data.

## 5. Bring a real video

Start a chat in this folder with your footage, script, goal and references. Read docs/WORKFLOW.md. Original files are copied into raw/; exports are versioned. Review the spoken cut before the storyboard. Later chats read saved decisions in this same folder.

Use Add reference to save inspiration and Analyze in chat to inspect it. If a site requires login, use the assistant’s connected browser. If access fails, supply the file or screenshots. See docs/CAPABILITIES.md for browser, local sound-effect and optional service guidance. Paid services are never a prerequisite for basic clicks/pops/whooshes generated with local code.

## Common fixes

- Empty library: expected before adding your own work/references. The synthetic smoke demo appears only after running the full workflow; it is a test fixture.
- File URL cannot load: run start.py and use the printed HTTP address.
- Old port: rerun start.py; it checks the running installation’s identity.
- Missing speech package/model: install the optional supported speech lock or supply a transcript; do not silently choose a paid service.
- Browser not connected: check the assistant’s current session and official browser setup. A render browser is separate from site access.
- Notes updated warning: read changed STATUS/approval decisions, reconcile the descriptor, then refresh hashes.
- Interrupted metadata save: inspect the named transaction and follow style-library/PROJECT-NAVIGATION.md.
- Renderer failure: run `python3 scripts/hf.py doctor --json`, save the output and inspect it. Do not upgrade the production pin or disable security checks just to obtain a pass.

Codex’s [AGENTS.md guidance](https://learn.chatgpt.com/docs/agent-configuration/agents-md) and Claude Code’s [project instructions](https://code.claude.com/docs/en/memory) provide entry points to shared instructions here. No account credentials or private global skills are bundled.

## Updating an existing studio

Keep working in its existing folder. Use the Updates page and docs/UPDATING.md. Do not extract a starter ZIP over the entire folder or replace populated registries with the empty examples. Your projects, reference videos, techniques, notes and settings must survive the update.
