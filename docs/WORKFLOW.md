# From first take to final export

The creator supplies intent and taste; the assistant implements and keeps durable project notes. The website previews work and records review decisions.

1. **Bring the material.** Create a project and immutable copies of footage. Record metadata/HDR, script, goal, audience, CTA, references and rights. Prepare a proxy/contact sheet/audio with scripts/studio.py.
2. **Choose the performance.** Compare candidate deliveries and visuals together. Keep alternatives in selects.csv. Remove dead air/bad takes, preserve meaningful breaths/gestures and join complete phrases without fixed padding. Deliver assembly, spoken script and time map. Silence detection is a review aid only.
3. **Align the storyboard.** Show actual proposed frames and relevant spoken lines, headline/caption placement, genuine media, motion/hold/transition and sound intent. Any Blender shot names its reason and estimated render time (see 3D shots and Blender below). Invite targeted notes. Preserve approved speech timing.
4. **Build the edit.** Add short correctly timed captions, genuine product B-roll, motion graphics, purposeful zooms/transitions and sparse sound effects. Optional music follows the brief. Keep speech dominant and licenses recorded.
5. **Review and refine.** Watch/listen to actual renders where supported. Check continuity, captions, source accuracy, framing, color/HDR, sync, sound and CTA. State what was not perceived. Keep accepted versions and experiments distinct. Prepare technique examples for every version you deliver for review, since the user may approve any of them (docs/TECHNIQUE-CATALOGING.md).
6. **Call it final.** User approves in chat or the current project's Next step card. Record exact version/files; register the final in the library. Stage approvals advance only their stage. Reopen preserves accepted assets. Publishing is separate.

For carousels: set dimensions in the brief, adapt the hook for swiping, keep each resource concise, end with the requested CTA. For presentations: start with story/outline, venue dimensions and actual visual boards; no forced spoken-cut stage.

At every meaningful handoff follow HANDOFF.md: status, review notes, safe build command and the navigation descriptor. Never assume an export filename means approved.

## 3D shots and Blender

HyperFrames does almost everything. Use the first of these that can do the shot:

1. **HyperFrames motion graphics (the default).** Text, captions, interfaces, charts, diagrams, transitions and nearly every effect.
2. **HyperFrames with its Three.js adapter.** Simple 3D such as a spinning logo, 3D text or simple objects. No Blender needed; keep its files local like any other asset.
3. **Blender, only when the shot needs** a real 3D model (.blend, .glb or .fbx), realistic lighting and materials, physics (cloth, liquid, collisions) or a camera flight through a 3D scene.

When a shot could go either way, choose the lower tier. Blender being installed is never a reason to use it, and neither is "it would look a bit nicer".

**The storyboard approves every Blender shot.** Its frame names Blender as the tool, gives the tier-3 reason and an estimated render time on this computer, and shows the HyperFrames alternative. For the estimate and a sample still, run `python3 scripts/blender_render.py projects/<slug>/<version> --scene <scene> --name <shot> --estimate` on a draft scene; copy the still next to the storyboard, since nothing may link to .scratch. Without a draft scene or Blender, give a rough range and say it is a guess. Render only shots the creator approved. A Blender shot added later needs the same approval.

**Installing Blender.** Blender is a separate free app of about 1 GB. It is never installed with the studio or included in a release. Setup offers it once ("Add Blender for 3D shots?") and installs nothing. If it is still missing the first time you propose a Blender shot, ask in that storyboard whether to install it. Install it only after a yes, and only from an official source listed in the setup report's `install_options`: blender.org, or the platform's package manager, such as `brew install --cask blender` on macOS. Then run `python3 scripts/setup.py --check` and `python3 scripts/blender_smoke.py`. If the creator says no, note it in STATUS.md and use the best HyperFrames treatment or real footage. Don't ask again in that project unless they bring it up.

**Rendering an approved shot.** Keep the scene with the version, for example `<version>/blender/<shot>.py`: a trusted script that builds the scene without rendering, like examples/blender-check/scene.py. A .blend file also works; scripts embedded in it stay disabled. Record outside models and textures with their licenses in asset-ledger.csv. Then run:

```sh
python3 scripts/blender_render.py projects/<slug>/<version> --scene projects/<slug>/<version>/blender/<shot>.py --name <shot>
```

It renders the frames into `<version>/.scratch/blender/<shot>/` and warns first when that disk may not hold them. Then it encodes `assets/blender/<shot>.mp4` with a `<shot>.json` render record, checks the clip and removes the frames, so only the final clip is kept. Add `--alpha` for an overlay (a transparent VP9 `.webm`) and check it over the actual picture. It never overwrites a clip: render a change under a new name or in a new version. Use the clip as ordinary B-roll in the composition and match the edit's timing and color. Captions, typography and genuine app evidence stay in HyperFrames.

## Script before recording

Choose Help me write a script in the video starter to work from an idea, draft or creator reference. The request loads the shared writing guidance and this installation's private writing preferences. Develop the script in chat; the assistant creates the project and saves the script/brief. Script sits before Spoken cut and stays optional. Approve the current script when you are ready to record. Record outside the studio, then copy the recording request and attach the raw footage in chat to start the spoken cut. Edit my footage starts with a brief, an optional recorded script and optional inspiration. See SCRIPTING.md.

## Optional saved script

Your script is optional context before the spoken-cut assembly. Supply it with footage in chat or paste it into Your script in the project’s Spoken cut section. Save script keeps a version without changing the original script.txt, raw footage, selected spoken script or approval. Copy request for chat identifies the exact saved text to use. A new-project guided request can include the full script; the receiving assistant saves it when creating the project. The recording determines what speech is available; flag absent lines and preserve natural delivery.

## Start a project in the studio

Projects → Start a project opens the shared request modal. Choose a format and starting point. Edit my footage asks for one brief (including requirements), with optional recorded script and inspiration. Browse library or paste a video link in the same inspiration section, then describe what to borrow. See message reveals the exact read-only footage request. A local file location stays optional. Copy request for chat, paste into the editing chat in this studio folder, attach raw video (or supply its location) and send. Carousels/presentations use source material or an outline. The assistant creates/registers the project; opening or copying the starter never creates one. The same starter is available in How it works and through existing start links. Closing retains the draft for this tab; completing the actual project setup remains a chat task.

## Optional inspiration when starting — UX V25

Start a project stays one optional form. Attach raw video in chat, or disclose a local file location to include it in the request. Add inspiration offers Browse library and Paste a video link together. The library picker stays inside the dialog; choose full videos or exact technique examples, then return to the retained draft. A pasted link becomes a project-only card with a borrowing note; Add link or Enter confirms it. It is not downloaded, analyzed or registered in the library. Importing existing browser selections is explicit. Project-only borrowing notes stay in the tab draft and copied request; they do not overwrite library notes. Shown library notes are pinned to their original source/revision and exact note IDs. Copy request validates those sources and combines goal, script, requirements, links and borrowing intent for one paste into chat. If raw footage is supplied, deliver the spoken cut first and keep inspiration for later visual design. If speech is already edited, preserve its words/timing and develop the storyboard. References can also be added later.

## Project-specific reference notes — UX V26

While choosing inspiration, write a borrowing note in the reference preview or its selected project card; both edit the same draft. Selected library cards keep one borrowing-note field; Reference details holds saved library context and optional time controls. Capture a playable source’s current timestamp with Add timestamp, or describe a moment/range when only a cover exists. Notes before selection stay in the tab draft; explicitly add that reference to include them in the new project request. Exact source/example and source-pinned library notes remain distinct. Changing a source requires reviewing the draft, preserving its text and clearing an obsolete position only after explicit rebase. X/Escape step through the preview/library/project form before closing; Close/Done and outside clicks retain the draft.


## Finished video techniques

Follow docs/TECHNIQUE-CATALOGING.md for existing-library completion and review preparation. Any delivered version can become the final, and the user usually approves it later in the Studio, so every time you deliver a video version for review (in a staged project or a single request that edits a supplied video), inspect each distinct reusable move in that exact export and prepare its examples project-locally with style-library/technique_upkeep.py prepare. Reuse the previous version's verified examples where the video is unchanged. Approval promotes only the plan for the version the user chooses, preserving the preferred baseline and historical links. Approval does not invoke AI. Existing approved sources can receive missing techniques without changing their approval or media. Software updates never perform bulk analysis or replace owner data.
