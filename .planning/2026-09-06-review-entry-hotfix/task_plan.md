# R01 / R02 entry hotfix

User approved the first review batch on 2026-09-06. Preserve all existing worktree changes.

- [x] Verify middleware, auth redirect, CI, browser and deployment gaps.
- [x] Reproduce redirects and unsafe return paths with regression tests.
- [x] Unify approved public origin and safe auth return paths.
- [x] Gate deployment on public origin, release health and redirect smoke.
- [x] Wire routing/session/resource and Chromium/Android/WebKit proxy browser regressions into CI.
- [x] Run targeted tests, architecture, typecheck, core, lint, build and available isolated browser checks.
- [x] Record evidence and unexecuted public deployment / real-device acceptance.

Scope: R01/R02 repository implementation; R03-R12 remain separate batches. No production deployment or existing migration edits.
