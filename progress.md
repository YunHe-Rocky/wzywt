# Progress

## 2026-09-09 OCR local endpoint
User approved bounded local HTTP exception with production HTTPS unchanged.
Read TDD/verification guidance; adding real provider URL regressions to test:local-deploy.
RED confirmed outside sandbox: local HTTP throws the reported production HTTPS ServiceError.
GREEN: local origin/cookie and OCR endpoint tests pass after shared hostname policy wiring.
Documented VM configuration and preview limits; no live deployment performed.
Verification: test:local-deploy, test:connections, typecheck and check:architecture passed.
Final diff inspection preserves production HTTPS, redirect rejection and token transport; public/test untouched.

Verified clean checkout and architecture. User approved design.
Read TDD and verification skills. Next: failing local-mode regressions.

Regressions failed as expected: HTTP cookie Secure=true, middleware returned no redirect.
Windows sandbox tsx failed uv_os_get_passwd ENOMEM; tests run outside sandbox.
Implemented shared origin policy, protocol-aware local cookies, deploy and PM2 wiring.

Architecture, typecheck, core, entry, connections and initial deployment suite passed.
Lint: zero errors, 18 existing img warnings. Production build passed.
Added HTTP browser CI path; full login not run locally because configured DB is remote.
Review corrected wildcard bind health URL to loopback; final deployment suite running.

Built-runtime headless Edge navigation exposed NextURL rewriting 127.0.0.1 to localhost.
Traced next/server/web adapter normalization and enabled skipMiddlewareUrlNormalize so PUBLIC_ORIGIN stays exact.
Rebuilding and rerunning desktop/mobile browser navigation. Full authenticated browser test remains CI-only here.

Final build and complete deploy suite passed, including wildcard listening and local entry failure rollback.
Headless Edge against the final production build passed desktop/mobile HTTP login-page navigation with exact origin and query.
Full authenticated HTTP/HTTPS E2E jobs are wired into CI but not executed in this local environment.
No commits, pushes, live VM operations, real database writes or secret edits performed.

## 2026-09-08 room/archive/tactic follow-up
User approved proposed rules and added BETA label, own-team tactics, and layer bug.
Read architecture, debugging and TDD guidance. Preserved prior uncommitted changes.
Investigating server guards and real layer interactions before implementation.
Layer regression: 5 scenarios x desktop/mobile failed before repair and pass afterward.
Room regression failed on missing own-team-first region; implementation now passes desktop/mobile member/manager cases.
Backend service-isolated permission tests pass without constructing PrismaClient; checks metadata, full-detail filtering and tactic/dispute guards.
Added BETA badges, own-team-first overview, separate own-team tactics tab, completed-only archive links and clear denied states.
Patch tool reported failure after partially updating package scripts; inspected actual diff and applied remaining files separately.
Combined browser suite passed: desktop/mobile member+manager archive flows, 10 layer scenarios, previous room/profile 1280/390/320 cases.
Permissions, architecture, typecheck, core, next-stage and lint passed; lint remains 18 image warnings, 0 errors.
Visual review: archive mobile BETA layout fits; room screenshot caught intro overlay, so regression now uses reduced motion before recapturing.
Initial production build passed. Independent review found first-layer bootstrap and global-admin draft-link gaps; correcting before final build.
Both review findings corrected and re-reviewed: server-authoritative global-admin archive access, default layers for new rooms, restricted idempotent explicit initialization for legacy empty rooms.
Backend defaults/initialization/POST dispatch/concurrent conflict/submitted-state tests pass; browser global-admin member/manager flows pass at1280/390px.
Actual 390px room screenshot shows own-team card ahead of member list; archive screenshot shows BETA and only own-team rows, no horizontal overflow.
Original map still absent; user asked to provide it. Layer UI adding honest map404 coordinate fallback and empty-room initialization control.
Layer UI follow-up complete: missing-map notice + neutral grid, ordinary own-side initializer, readonly guard. All 18 desktop/mobile layer cases pass after observed RED.
Final permission service/POST tests, typecheck, architecture, core, next-stage and lint pass after follow-up; final production rebuild pending.
Final production build passed. Against built server: all 6 desktop/mobile ordinary/owner/global-admin archive cases and all18 layer/map/init cases passed (exit0).
Independent review findings closed. Owned test servers stopped. No real DB changes, schema migrations, commits, pushes or deployment performed.
Remaining supplied-asset limitation: original terrain JPG is missing; coordinate grid and explicit warning are the verified fallback pending user's image.
