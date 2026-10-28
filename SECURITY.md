# Security boundaries

Personal loopback use only. The studio binds 127.0.0.1 and has no team login. Do not expose it through a public tunnel/reverse proxy or open firewall binding as part of setup. A hosted/team service needs separate authentication, private media storage and deployment review.

HTTP routes require the current loopback Host; browser origins/fetch metadata must agree. Writes require exact Origin and explicit JSON/header checks. Registered media and notes must resolve inside their exact projects/<slug> or references/<slug> roots, including symlink checks and bounded indexes. Static files are restricted to dist. The service does not provide a file-upload or arbitrary-code API.

Review approvals record metadata only, guard current revisions/file hashes and retain before-images/transaction journals. The process user and local apps can still read/change local files; this is not protection against a compromised machine or malicious local process.

Never commit personal catalogs, footage, references, project notes, credentials or runtime journals. Use the explicit release-files.txt/exporter, inspect every included file and scan again before pushing. .gitignore alone is not a privacy audit. The exporter excludes symlinks, private data and unexpected paths.

Report a security concern privately to the repository maintainer through GitHub's security reporting channel when configured. Until a repository/contact is confirmed, do not post private files/credentials in a public issue. Automated dependency audits are limited checks, not a full security certification.

The reference-intake endpoint saves only an explicit URL and bounded text fields, with exact origin/host/header/JSON guards. Creates merge under the catalog lock, duplicates do not overwrite notes, and edits require the current entry revision. Saves use the shared private backup/rollback/recovery journal. Source URLs, notes and journals are owner data, not release files.

After a new save, the UI may explicitly request a best-effort public cover image through /reference-preview. The helper accepts only HTTPS, rejects non-public DNS results, pins the connection address while verifying TLS for the original hostname, and rechecks redirects. HTML/image responses, redirects and read times are bounded. It reads declared image metadata and supported raster images only; it does not execute scripts, load embeds, send cookies, download video or mark analysis complete. Cover files and provenance are owner data, excluded from source exports. DNS resolution still depends on the operating system's resolver; network failures retain the saved link and placeholder.

Open in HyperFrames requires a guarded explicit POST, a registered exact-version source and its current revision. It prepares/reopens a bounded local working copy and invokes the pinned local CLI with fixed arguments, without a shell. GET requests never launch processes. Opening the editor does not modify a saved review, approve it or render a final. Like other local creative tools, editable source code should come from trusted or inspected sources.

Upgrades must preserve owner files and local source changes; see docs/UPDATING.md. Release checks include a clean source allowlist, consistent versions and empty starter seeds. Never replace existing registries with those seeds during an update.
