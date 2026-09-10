# Local deployment support

## Promotional video (2026-09-10)

Approved direction: create a roughly 60-second 1920x1080 landscape promotional video for the public website, using real public UI footage, warm and energetic Mandarin narration, original Chinese-percussion/electronic background music, burned-in Chinese captions, and the established navy/gold visual language.

### Video phases
- Capture and inspect current public desktop/mobile website scenes: in progress.
- Write the timed Chinese script and shot list: pending.
- Produce narration, original music, motion graphics, and edit: pending.
- Verify playback, duration, resolution, audio, captions, and final frames: pending.

### Video boundaries
- Preserve all existing application and OCR changes; add only standalone promotional-video artifacts.
- Use public website screens and repository-owned brand art; do not use official game soundtrack.
- Do not log in, create rooms, submit forms, or mutate production data.

### Video errors
- Initial combined planning-file patch did not match findings.md context; no partial change was retained, so the files are being updated separately.

## Deployment/OCR retrospective (2026-09-09)
- User requested code repairs supporting test and production.
- Investigate: complete (OCR dotenv validation/PM2 propagation, backup diagnostics and raw relative path check).
- Regressions and bounded fixes: complete.
- Production loopback HTTP exception: explicitly approved by user; implementation and final verification complete.
- Existing deployment rollback, OCR tests and production build: complete. Six supplied screenshots audited offline.
- Remaining work outside these fixes: complete five additional OCR page parsers and six-file HTTP workflow; verify actual server backup permissions and Linux-only capability checks.
- No automatic permission changes, backup relocation, credential rotation, live deployment or Git publishing.

## OCR local endpoint follow-up (2026-09-09)
- Approved: explicit local mode permits private/loopback HTTP OCR; default production retains HTTPS.
- Regression reproduction: complete; production-built local loopback rejected with the reported HTTPS error.
- Shared hostname policy, provider fix and documentation: complete.
- Targeted tests, type and architecture verification: complete.
- Test runner: sandbox tsx failed uv_os_get_passwd ENOMEM; approved outside-sandbox run reproduced the actual bug.
- Multi-file patch partially applied before reporting failure; inspected diff and applied remaining files separately.
- Preserve public/test; no secrets, commits, pushes or server operations.

User approved explicit local HTTP testing alongside default HTTPS production.

## Phases
- Investigation: complete.
- Regression tests and implementation: complete.
- Documentation and verification: complete.

## Decisions
- DEPLOY_ENVIRONMENT=local permits HTTP on localhost, loopback and private IPs.
- Keep NODE_ENV=production for builds and retain backup, migration, health and rollback.
- No publishing or live VM mutation in this task.

## Errors
- Cannot create nested .planning directory in sandbox; use root planning files.

# Room, archive and tactic follow-up (2026-09-08)

User approved hiding identity details, own-team-first results, own-team submitted archives,
manager draft access; added BETA label, own-team tactics only and broken layer repair.

## Follow-up phases
- Investigate archive access and reproduce layer defects: complete.
- Add failing behavior and permission tests: complete.
- Implement bounded UI and server changes: complete.
- Browser, type, architecture, core, build and independent review: complete.

## Boundaries
- Preserve earlier uncommitted room/avatar/hero improvements.
- No database schema changes unless demonstrated necessary; no real database writes.
- Archive completion means SUBMITTED, not tournament completed (split finished).
- Keep manager archive editing; tactics only for own side, including managers.
- Original terrain image is absent and awaits user-provided asset; explicit neutral-grid fallback is implemented and verified, not a restored map.
