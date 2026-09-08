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
