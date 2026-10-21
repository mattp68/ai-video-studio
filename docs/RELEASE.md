# Public pilot release process

October21,2026:the owner authorized a public GitHub pilot at https://github.com/mattp68/ai-video-studio, with the MIT code license (copyright2026 Matt Paige). Team testing follows pilot publication; it is no longer a prerequisite for sharing the source. The forthcoming Substack deep dive is optional for installation.

## Before each pilot tag

- Review all source selected by release-files.txt, third-party notices and the actual Git index/tree. Owner catalogs, footage, references, journals, logs and credentials stay excluded. .gitignore alone is not an audit.
- Run tests, syntax/registry checks, dependency audits and the exact export scan. Exercise changed setup behavior in a fresh directory and complete the synthetic workflow. Preserve earlier archives.
- Keep docs/VALIDATION.md precise about observed results and unsupported platforms. Do not turn a local synthetic pass into a claim about real performance or every assistant/OS.
- Publish only the reviewed source commit/tag. Mark the release as a prerelease while the fresh-user pilot is pending. Confirm the remote tree matches the source allowlist.
- Verify the public checkout and its setup instructions; keep code hosting separate from hosting personal media.

## After publication

Run docs/PILOT.md in fresh Codex and Claude Code sessions and with the team’s own footage. Record installation friction, reference/browser access, transcription and creative review. Report anonymized results and version fixes. Add the full Substack guide URL when published, then decide when to promote a stable release. Never distribute private pilot logs/footage through public issues or release attachments.

Use python3 scripts/export_release.py for source archives. It writes an exact allowlist and checksum manifest and never pushes. The working folder may contain ignored owner/synthetic files; do not zip or stage it wholesale. A heuristic scan is a limited check, not a full security certification.

The independent starter is maintained separately from the creator’s private production studio. Port reusable fixes explicitly and retest; do not copy private registries or silently upgrade existing projects/renderers. Public-source authorization does not authorize team messages, invitations or publishing anyone’s creative work.
