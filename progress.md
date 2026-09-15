# Progress

## 2026-09-10 participation rate
User approved fixing the percentage-unit defect. Root cause is confirmed across OCR output, React presentation, and server validation. Selected the compatibility-preserving design: retain 0-1 storage and convert only at OCR ingestion plus UI presentation/input boundaries. Pre-existing dirty files, especially promotional-video artifacts, remain out of scope.
Read the architecture and UX form guidance. Confirmed the feature model already owns recognition normalization and the server use case owns canonical validation; no schema change or API route business logic is needed.
Completed flow tracing, including local draft restoration and the super-admin correction entry. Starting RED tests for OCR normalization and browser-visible percent input/submission.
Added the pure recognition/conversion expectations to `test-next-stage`; production code is still untouched.
RED observed outside the sandbox: expected conversion function, got `undefined`. Added browser expectations for 0.65 -> 65 display, 63 -> 0.63 submission, and draft restoration; production code remains untouched.
Browser RED infrastructure could not reach a ready dev server: Chrome exited, Edge launched, then navigation timed out. The pure RED is valid and specific; browser regression remains in place for the post-build run. Stopped the temporary port 8011 server before implementation.
GREEN: `npm run test:next-stage` passed after adding explicit percentage converters, OCR boundary normalization, legacy draft normalization, percentage presentation/input handling, and correction conversion. Database schema and server canonical validation are unchanged.
Typecheck passed after adding the union overload. The Python-to-TypeScript OCR contract passed with 55% normalized to 0.55; the existing Node module-type warning remains unchanged.
Fresh architecture and account-isolated draft tests passed outside the sandbox. Lint still needs a fresh standalone exit code; build and browser verification remain.
Standalone lint passed with 0 errors and the same 18 existing `<img>` warnings. Production build passed with 42/42 static pages. On built port 8012, the browser executed all new percentage assertions successfully before the broader suite stopped on the unrelated existing 11px BETA badge assertion.
Independent review found stale OCR could overwrite already persisted stats. Browser RED reproduced it exactly (`0.65` database value displayed as `55` because OCR was `0.55`). Implemented per-player precedence: any player with persisted stats bypasses OCR merging; OCR only seeds players without stored stats.
Final review found group-wide legacy-draft conversion could corrupt mixed values such as `[63, 0.63]`. Replaced it with per-value normalization and added the exact mixed-unit regression; explicit OCR result versions continue to disambiguate legacy 1% values.
Final verification passed: typecheck, architecture, core, next-stage, draft isolation, OCR contract, lint (0 errors/18 existing warnings), production build (42/42 pages), and the dedicated Edge browser regression for normal confirmation plus super-admin correction. The follow-up independent review found no remaining blocker; the temporary server was stopped and no deployment was performed.

## 2026-09-10 promotional video
User approved the proposed 60-second landscape concept. Live homepage and repository product/visual documentation were inspected. Existing dirty worktree is unrelated and will be preserved. Next: capture current public pages without mutating production data.
Captured six public desktop/mobile page views with headless Edge. Generated eight 1080p scene boards and a 61.2-second original synthesized score. The first narration attempt through the bundled PowerShell runtime could not access SAPI voices; retrying through the current system shell where Microsoft Kangkang was observed.
User caught unloaded lazy hero portraits in scene 07. Paused final render work to recapture that page with an explicit image-completion gate and rebuild the affected scene.
Hero recapture gate passed and scene 07 was rebuilt/visually inspected with the first row of portraits loaded. Resuming final MP4 rendering after the earlier audio-graph branch fix.
Initial MP4 encoded at 1920x1080/30fps/60.930s and fully decoded. Nine-frame contact-sheet QA passed, including loaded hero portraits. Audio measured 60.267s, leaving about 0.66s of silent tail; extending the music fade to the final video frame before final verification.
Final rerender completed after padding the narration control stream. Fresh verification passed: 1920x1080, 30fps, 60.950s; stereo 48kHz audio runs 60.907s at -17.51 dBFS RMS/-0.83 dBFS peak; complete video+audio decode passed. Fresh 1.0s, 45.5s and 60.0s frames were visually inspected, including the corrected loaded hero portraits and final URL. No production data or application source was changed.

## 2026-09-09 deployment/OCR retrospective
Reproduced duplicate/Markdown OCR config passing preflight and stale PM2 OCR values; new tests fail before fix, pass after.
Reproduced raw relative backup directory accepted; now reject before canonicalization and give targeted safe permission diagnostics.
Full deploy simulation passed after backup fixes; added actual deploy-entry OCR policy test, observed RED, wired shared checker and rerunning full suite.
Agent inspected all six supplied images with offline cached RapidOCR. DATA yields 10 players/10 scores/40 metrics; six-image request rejected before inference by one-file limit.
Agent reproduced missing all metrics/score with six pages incorrectly PASS; fixed to WARNING, preserving manual correction and zero values, validated next-stage and Python/TS contract.
Entry/local-mode, connections, core, next-stage, architecture, typecheck and all 28 Python tests passed. Lint: 0 errors, 18 existing image warnings.
Independent review found no new P1/P2 in deployment diff. Permission failures do not change permissions; existing successful deployment chmod 700 behavior is retained.
User approved production loopback HTTP only. RED reproduced existing HTTPS rejection with new regression before interruption.
Resumed after interruption; old deploy/build session IDs are unavailable, so their completion is not claimed. Applied loopback-only exception; rerun final verification.
Final production build passed (exit 0), including type validation and all 42 static pages.
Fresh typecheck, lint (0 errors/18 existing warnings), local/production entry, core, next-stage, architecture and real-loopback connection tests passed.
Fresh Python -> TypeScript OCR contract passed; 28 Python tests previously passed with unchanged Python source.
Final test:deploy passed after production loopback change (exit 0), covering release activation/rollback, PM2 ownership and new OCR preflight. Unix mysqldump/search-permission cases are skipped on Windows and still require Linux CI/host verification.
No .env/real credential changes, server permission changes, commits, pushes or live deployment. Six-page service completion remains a separate implementation gap, not a passed deployment check.

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
