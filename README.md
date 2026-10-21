# AI Video Studio

**Bring your footage. Make it yours.**

A local home for AI-assisted video edits, visual storyboards and creative references. Create in chat with Codex or Claude Code; keep each cut, review and final in your own studio.

**Public pilot · v0.1.0-beta.1.** Start with Apple Silicon macOS for the closest match to current validation. Fresh assistant/team workflows and other platforms are being tested. [What has been verified](docs/VALIDATION.md) · [HatchWorks pilot checklist](docs/PILOT.md)

## Set up with one prompt

Paste this into Codex or Claude Code on your computer:

> Set up AI Video Studio from https://github.com/mattp68/ai-video-studio at tag v0.1.0-beta.1 in a new local folder. Read SETUP.md and AGENTS.md first. Check prerequisites and guide me through any missing system tools with my authorization. Install project-local dependencies, including local transcription on a supported Apple Silicon Mac. Run the tests and full synthetic smoke workflow, report available and unavailable capabilities, and open my local studio. Preserve existing files. Use my own footage, references and accounts; ask before paid services or system-wide changes. Do not publish my work.

The repository includes the working code and templates. Setup installs their dependencies; the assistant does not rebuild the application. Missing system tools may need your authorization or your company’s installation process. [Setup and troubleshooting](SETUP.md) · [Capabilities and optional tools](docs/CAPABILITIES.md)

## From first take to final export

1. Bring your raw video, script and references.
2. Review the best takes in a tightly paced spoken cut.
3. Align actual visual storyboard frames before the designed edit.
4. Refine captions, B-roll, motion graphics, zooms, transitions and sound.
5. Approve the final and keep it in your Reference Library.

Already edited the speech? Preserve it and start with the visual plan. Carousels and presentations start with an outline and their own dimensions. The studio organizes saved work and review decisions; the assistant does the editing in chat. [Workflow](docs/WORKFLOW.md)

## Your own collection

Use Add reference to save a source link and what caught your eye. Analyze in chat copies a request to inspect that same entry. You can skip it and return later; copying never marks analysis complete. The + selects examples, the copy icon copies a library link, and Review & copy combines optional notes. Nothing is automatically sent to a chat. [Reference guide](docs/ADDING-REFERENCES.md)

Personal footage, projects, catalogs, settings and downloaded references stay local and are ignored/excluded from starter exports. Each user starts with empty personal registries. Local links work in that user’s installation and do not share media across computers. The included smoke demo is synthetic. [Security boundaries](SECURITY.md)

## Tools

The home base needs Python 3.11+. Media work adds Node 22+, FFmpeg/FFprobe, project-local Pillow, HyperFrames and GSAP. Setup downloads the render browser. Optional local transcription currently targets Apple Silicon macOS. Basic sound effects can be synthesized locally; browser connections, image generation and paid libraries depend on the user’s available tools/accounts. [Capability guide](docs/CAPABILITIES.md)

Restart with `python3 style-library/start.py` and use its printed HTTP address. Public source is separate from hosting: this studio is a personal local service, not a public team server.

## Learn the system

Created by [Matt Paige](https://substack.com/@mattpaige68). A full Substack deep dive on building and using this workflow is forthcoming. The repository’s setup guide stands on its own; no paid article or private chat is needed to install it.

## License and feedback

Project code is under the [MIT License](LICENSE). Fonts and dependencies keep their [own notices](THIRD_PARTY_NOTICES.md). For pilot feedback, include the version, OS, setup report and reproducible steps in [GitHub Issues](https://github.com/mattp68/ai-video-studio/issues). Keep private footage, credentials and sensitive logs out of public reports. [Contributing](CONTRIBUTING.md)
