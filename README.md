# AI Video Studio

**Video editing with AI.**

An open-source AI video editing studio for your footage, visual storyboards and creative references. Create in chat with Codex or Claude Code; keep each cut, review and final in your own studio.

**Public launch beta · v0.1.0-beta.5.** Start with Apple Silicon macOS for the closest match to current validation. Fresh assistant/team workflows and other platforms are being tested. [What has been verified](docs/VALIDATION.md) · [Pilot checklist](docs/PILOT.md)

## Set up with one prompt

Paste this into Codex or Claude Code on your computer:

> Set up AI Video Studio from https://github.com/mattp68/ai-video-studio at tag v0.1.0-beta.5 in a new local folder. Read SETUP.md and AGENTS.md first. Check prerequisites and guide me through any missing system tools with my authorization. Install project-local dependencies, including local transcription on a supported Apple Silicon Mac. Run the tests and full synthetic smoke workflow, report available and unavailable capabilities, and open my local studio. Preserve existing files. Use my own footage, references and accounts; ask before paid services or system-wide changes. Do not publish my work.

The repository includes the working code and templates. Setup installs their dependencies; the assistant does not rebuild the application. Missing system tools may need your authorization or your company’s installation process. [Setup and troubleshooting](SETUP.md) · [Capabilities and optional tools](docs/CAPABILITIES.md)

## From first take to final export

1. Bring your raw video, script and references.
2. Review the best takes in a tightly paced spoken cut.
3. Align actual visual storyboard frames before the designed edit.
4. Refine captions, B-roll, motion graphics, zooms, transitions and sound.
5. Approve the final and keep it in your Reference Library.

Already edited the speech? Preserve it and start with the visual plan. Carousels and presentations start with an outline and their own dimensions. The studio organizes saved work and review decisions; the assistant does the editing in chat. [Workflow](docs/WORKFLOW.md)

## Review without losing your place

Move between Spoken cut, Storyboard and Edit, with each stage's versions together. Enlarge storyboard scenes or see the full sequence. Save feedback at the paused video time or selected scene, then tell your editing chat, “Apply my saved feedback for [project].” Notes stay in the local project; saving them never starts an edit or approves a version. Working files remain available under More downloads and Project details.

## Your own collection

Use Add reference to save a source link and what caught your eye. Analyze in chat copies a request to inspect that same entry. You can skip it and return later; copying never marks analysis complete. The + selects examples, the copy icon copies a library link, and Review selected references combines optional notes. Nothing is automatically sent to a chat. [Reference guide](docs/ADDING-REFERENCES.md)

Personal footage, projects, catalogs, settings and downloaded references stay local and are ignored/excluded from starter exports. Each user starts with empty personal registries. Local links work in that user’s installation and do not share media across computers. The included smoke demo is synthetic. [Security boundaries](SECURITY.md)

## Tools

The home base needs Python 3.11+. Media work adds Node 22+, FFmpeg/FFprobe, project-local Pillow, HyperFrames and GSAP. Setup downloads the render browser. Optional local transcription currently targets Apple Silicon macOS. Basic sound effects can be synthesized locally; browser connections, image generation and paid libraries depend on the user’s available tools/accounts. [Capability guide](docs/CAPABILITIES.md)

Restart with `python3 style-library/start.py` and use its printed HTTP address. Public source is separate from hosting: this studio is a personal local service, not a public team server.

## Learn the system

Created by [Matt Paige](https://substack.com/@mattpaige68). A full Substack deep dive on building and using this workflow is forthcoming. The repository’s setup guide stands on its own; no paid article or private chat is needed to install it.

## Updates

Open **Updates** in your studio, copy the update request and paste it into chat in this same folder. Your assistant checks official releases, including newer betas, and preserves your projects, videos, references, techniques, settings and feedback. New installations start empty; upgrades keep your collection. Git and ZIP installations are supported by the documented procedure. [Upgrade guide](docs/UPDATING.md) · [Release process](docs/RELEASE.md) · [Releases](https://github.com/mattp68/ai-video-studio/releases)

## License and feedback

Project code is under the [MIT License](LICENSE). Fonts and dependencies keep their [own notices](THIRD_PARTY_NOTICES.md). For pilot feedback, include the version, OS, setup report and reproducible steps in [GitHub Issues](https://github.com/mattp68/ai-video-studio/issues). Keep private footage, credentials and sensitive logs out of public reports. [Contributing](CONTRIBUTING.md)
