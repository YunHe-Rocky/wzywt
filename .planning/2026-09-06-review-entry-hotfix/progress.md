# Progress

- Inspected current code, architecture and dirty worktree.
- Node on PATH is 26; locate Node 24 for verification.
- Initial output truncation resolved with bounded reads; one guessed auth service filename did not exist.
- Creating the planning directory required scoped escalation and succeeded.

- Observed the new /me?tab=history assertion fail with localhost origin and lost query, then pass after the shared origin implementation.
- Entry, auth redirect, public smoke fault injection, auth-session, resources, architecture, core and typecheck passed with Node 24.19.0. Lint: 0 errors / 18 existing image warnings. Production build exited 0.
- Added strict HTTPS PUBLIC_ORIGIN, deployment public release/redirect smoke and rollback, shared CI entry gate, managed Chromium/WebKit profiles and a real Nginx HTTPS harness.
- Independent review found bootstrap Node selection ordering and IPv6 loopback mismatch; fixed both.
- Downloaded official MySQL 8.4.11 / Nginx 1.28.0 into a dedicated temporary directory, initialized loopback-only 3307 entry_test, applied all 9 existing migrations without editing them.
- HTTPS Nginx public smoke and real login/resource tests passed on Chromium desktop and Android. WebKit passed after waiting for network-idle before navigation and checking the actual Set-Cookie header.
- Isolated Windows WebKit probe: addCookies(sameSite=Lax) reports sameSite=None. Real HTTP response still must include SameSite=Lax; Secure/HttpOnly storage, refresh and authorization assertions remain enforced.
- Visual login transition passed: normal 1712 ms, reduced-motion 66 ms. Missing-session UI remains on login.
- Windows Nginx requires a temp subdirectory below the isolated prefix; added it. Deploy shell parser/state tests pass directly; investigating npm runner's MSYS native-symlink behavior.

- Final full HTTPS matrix exited 0: Chromium desktop, Android simulation, WebKit iPhone simulation, public release/redirect probes and visual login tests. Final visual timings: 1711 ms normal / 64 ms reduced motion.
- Complete deploy simulation passed with explicit BASH_BIN=D:\Git\bin\bash.exe, including public-smoke failure rollback. Added test argument forwarding for that fault and an explicit Windows-only skip when native symlinks are unavailable; Unix still fails without symlink support.
- Final typecheck, changed-file lint and git diff --check passed. All 18 full-repository lint warnings predate this change. Build passed before subsequent test/docs-only edits.
- Fixture users and official_news rows were verified at zero. One read-only SQL check required corrected PowerShell quoting; shutdown initially returned before the process exited, so deletion was deferred until confirmed shutdown. Removed only the dedicated MySQL/Nginx/test database directory after the MySQL process exited 0. Cached Playwright browsers remain ignored for reuse.
- Delivery record: docs/reviews/entry-hotfix-acceptance-2026-09-06.md. No commit, push, production deployment, production Redis investigation or real-device acceptance performed.
