# Local deployment support

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
