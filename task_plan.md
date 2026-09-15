# Local deployment support

## Participation rate percentage fix (2026-09-10)

Approved direction: display and edit participation rate as 0%-100%, while retaining the existing canonical database representation as a 0-1 decimal.

### Participation-rate phases
- Trace recognition, draft, UI, confirmation, correction, and storage paths: complete.
- Add regressions that fail on the current unit mismatch: complete.
- Implement the smallest boundary/presentation conversion: complete.
- Run targeted and repository verification; inspect final diff: complete.

### Participation-rate boundaries
- Preserve the Prisma schema and existing stored records.
- Normalize OCR percentage points at the recognition boundary.
- Keep business/server validation in canonical 0-1 units.
- Do not alter unrelated promotional-video worktree changes.

### Participation-rate errors
- The Superpowers Codex reference path named by the skill is absent in this installation; continued with the available Codex tool instructions.
- Creation of an isolated `.planning/2026-09-10-participation-rate` directory was denied by the workspace sandbox, so this completed root plan receives the new phase as prescribed by the planning skill.
- One exploratory `rg` expression was malformed by PowerShell quoting; useful searches in the same call still completed, and subsequent searches use literal/simple patterns.
- A Windows `rg` glob passed as a path produced OS error 123; subsequent searches target the directory and use `-g` when filtering.
- A later PowerShell-quoted review search repeated the unclosed-regex error; split literal searches verified that recognition stores only JSON and moves the match to `WAITING_CONFIRMATION`, while player stats are created only by confirmation.
- The first combined RED-test patch did not match an exact whitespace context in `scripts/test-next-stage.ts`; it made no changes and was reapplied as smaller exact patches.
- A later multi-file patch reported a missing already-modified OCR assertion after partially applying an earlier file; inspected the actual diff before continuing and applied the remaining files separately.
- Sandboxed `npm run test:next-stage` failed before tests with Windows `uv_os_get_passwd` ENOMEM; the approved outside-sandbox rerun reached the intended assertion.
- Sandboxed browser RED could not create `.cache/test-artifacts`; the first outside-sandbox Chrome launch exited immediately. Switching to installed Edge launched successfully, but the sandboxed Next dev server never reached ready and navigation timed out. The server was stopped; browser verification will use the production build after implementation.
- First typecheck found the intended overloads lacked a union-call signature for `number | string`; added the union overload without changing runtime behavior.
- First OCR contract invocation used the wrong legacy environment variable name and stopped before its assertions; reran with the script-required `OCR_TEST_PYTHON`.
- Sandboxed architecture and draft tests hit the same Windows `uv_os_get_passwd` ENOMEM; approved outside-sandbox reruns passed. The parallel lint process returned no error output but no final exit code, so it is not counted and will be rerun alone.
- First production-server start on port 8011 reported `EADDRINUSE` after the earlier dev attempt; port 8012 started cleanly and is the verification target.
- The human-factors browser run reached and passed the new percentage display, draft, and request-payload assertions, then failed on an unrelated pre-existing 11px `BETA 测试` badge audit. This is not being hidden or fixed in the percentage task; a focused browser regression will provide an independent green exit.
- The first focused browser attempt used Playwright's atomic `fill` against the transformed controlled number input and did not exercise the settled user-edit path; the regression now types through real key events and asserts the value remains stable after the 500 ms draft-save cycle.
- The first correction-form selector also matched the separate dispute-player select. Scoped the selector to the `超管纠错` section; no production selector or markup change was needed.

### Participation-rate verification
- `npm run typecheck`, `npm run check:architecture`, `npm run test:core`, `npm run test:next-stage`, and `npm run test:match-draft`: passed.
- Python-to-TypeScript OCR contract: passed, including 55% -> 0.55 and incomplete-evidence fail-closed behavior.
- `npm run lint`: passed with 0 errors and 18 pre-existing `<img>` warnings.
- `npm run build`: passed; 42/42 static pages generated.
- Focused Edge regression: passed for persisted-data precedence, 65% display, 63% -> 0.63 confirmation, read-only `%` suffix, and 63% -> 0.63 admin correction.
- Final independent review found no remaining blocker. Temporary production server was stopped and its verification port was confirmed closed.

## Promotional video (2026-09-10)

Approved direction: create a roughly 60-second 1920x1080 landscape promotional video for the public website, using real public UI footage, warm and energetic Mandarin narration, original Chinese-percussion/electronic background music, burned-in Chinese captions, and the established navy/gold visual language.

### Video phases
- Capture and inspect current public desktop/mobile website scenes: complete.
- Write the timed Chinese script and shot list: complete.
- Produce narration, original music, motion graphics, and edit: complete.
- Verify playback, duration, resolution, audio, captions, and final frames: complete.

### Video boundaries
- Preserve all existing application and OCR changes; add only standalone promotional-video artifacts.
- Use public website screens and repository-owned brand art; do not use official game soundtrack.
- Do not log in, create rooms, submit forms, or mutate production data.

### Video errors
- Initial combined planning-file patch did not match findings.md context; no partial change was retained, so the files are being updated separately.
- Running the narration script through the bundled PowerShell runtime could not access installed SAPI voices. The current system shell had already enumerated Microsoft Kangkang, so narration will be regenerated in that shell instead of repeating the failing runtime.
- The same voice selection was blocked in the sandboxed system shell. Next attempt changes the condition by running the narrowly scoped local narration script outside the sandbox so SAPI can access the installed voice token.
- The first encoder launch produced a zero-byte output because Python decoded FFmpeg's UTF-8 log as the Windows GBK locale. The render wrapper now decodes logs explicitly as UTF-8 with replacement and will expose any actual encoder error on the next run.
- With readable logs, FFmpeg reported that the mixed narration label was consumed twice by the ducking graph. The narration is now explicitly split into sidechain and final-mix branches before encoding.
- First successful encode passed full audio/video decode and visual timeline inspection, but audio ended at 60.267s while video ended at 60.930s because the sidechain followed the narration stream length. Pad the narration control stream to the full timeline so the music fade continues through the final frame.

### Video verification
- Final MP4: 11,881,174 bytes, H.264/AAC, 1920x1080, 30.000 fps, 60.950 seconds.
- Audio: stereo 48 kHz, decoded duration 60.907 seconds, RMS -17.51 dBFS, peak -0.83 dBFS.
- Full video and audio streams decoded without errors.
- Fresh extracted frames at 1.0s, 45.5s, and 60.0s were visually inspected; the corrected hero montage contains loaded portraits and the final URL remains readable.

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
