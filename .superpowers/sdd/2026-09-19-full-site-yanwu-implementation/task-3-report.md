# Task 3 — Yanwu workspaces

Base: `bd3305ed40406d6a65687024b85c6c20c217f3c6`; branch `codex/history-theme-system`.
Scope: presentation, owned stylesheet migration, isolated component fixtures and two explicitly approved shared-host adaptations. No features/core business logic, API routes, schema, migration, CI, dependencies, secrets, database or production changes.

## Result and layout

- **09 TournamentList:** editorial opening and join station, separate creation row, open room ledger with real capacity. Narrow rows retain title → capacity → action order. Date selection has a visible control boundary; guest gate, preview, calendar, paging and existing callbacks remain.
- **10 TournamentDetail / MatchArchivePanel:** room title/code/identity/capacity header, deadline band, paper management and lineup sections, paired strength/preference statistics. Owner/member/visitor and actual red/blue identity remain driven by feature data. Own-lane and team text use readable semantic foregrounds.
- **11 MatchWorkspace:** paper review workbench and section hierarchy, with original six screenshot categories, human OCR review, record revision/confirmation and submitted read-only behavior. The same semantic player table remains on mobile; no duplicate mock/mobile data model.
- **12 TacticBoard:** display heading, focused paper toolbar/stage/sidebar and named keyboard-focusable resource scroller. Real map artwork, image crop, SVG dimensions, pointer geometry and normalized coordinate editor remain unchanged. Missing map uses the existing honest coordinate-grid path with semantic colors.
- **15 CombatWall:** editorial media/text rows and compact latest/refresh toolbar, with 44px title-link target. Existing publisher, pagination and upload components are preserved.
- **16 CombatPostDetail:** large review title, retained dark native-video surface, paper article/comment separators. Failed-video retry gets a readable media foreground; no custom player or changed media API.
- **17 MonitorDashboard:** connection strip, paper module summaries and named local resource/log scrolling. Existing EventSource/check/resource APIs, timers and permission logic are unchanged.

Owned match/tactic/combat/monitor/lobby rules moved from `globals.css` / `arena.css` into `src/web/styles/yanwu-workspaces.css`, imported once by RootLayout after public styles. Shared generic feature/table rules stay shared. Only eight workspace media/map/table/review semantic tokens were added. Production callbacks were preserved; new and substantively rewritten JSX/test blocks use readable structure.

## RED → GREEN evidence

1. `node tests/e2e/yanwu-workspaces.mjs` initially exited 1 on the actual 320px room-code control: **77.05 × 25.5px**, below the required 44px height. The same rendered geometry assertion now passes, as do real row ordering and player-field containment checks at 320/390px.
2. A declared monitor stream originally ended after its first frame. `node --test tests/e2e/yanwu-host-regression.mjs` with the new SSE test and the old host behavior gave **2 pass / 1 fail** (`declared SSE must not end after its initial message`). Optional `keepOpen` now applies only to explicitly handled `text/event-stream`; initial frame, continued connection, client abort and host close pass. Default `response.end`, unknown 503 and violation recording remain.
3. The actual ToastProvider in the esbuild host emitted React's non-boolean `jsx` warning. A real-Toast browser regression first gave **3 pass / 1 fail**. With parent-approved compilation handling of the exact `src/web/components/ui/Toast.tsx` file, only `<style jsx>` becomes `<style>`; CSS text, Toast and Portal code remain intact. The test verifies no console/page error and the 320px `left/right:12px; align-items:stretch` rule. Host final result: **4/4 pass**. This is a test-host styled-jsx adaptation, not a Next production-build verification.
4. Once the host warning was resolved, the unchanged human-factor assertions exposed a real **168 × 28px** combat title link. In-place `min-height:44px` corrected it; the original suite then passed without filtering console output or relaxing assertions.

Sampled composed-background contrast passes for room own-role/lineups and dark-media failure/retry text. Minimum recorded ratio: **5.0355590969897115:1**. This is a named-selector sample, not exhaustive WCAG certification.

## Verification

Executed with local Node **26.2.0** and Microsoft Edge:

| Command | Result |
| --- | --- |
| `node tests/e2e/yanwu-workspaces.mjs` | PASS; 14 baseline records, seven widths, 33 total manifest records |
| `node --test tests/e2e/yanwu-host-regression.mjs` | PASS; 4/4 including SSE lifecycle and real Toast |
| `YANWU_CONTRACT=human-factors-regression node tests/e2e/yanwu-workspace-contracts.mjs` | PASS; original console, 44px targets, labels, focus, 12px text, reduced-motion, keyboard and canonical 63% → 0.63 payload assertions |
| `YANWU_CONTRACT=room-archive-regression node tests/e2e/yanwu-workspace-contracts.mjs` | PASS; member/manager/global-admin at 1280/390/320, own-first/archive gate/BETA/own tactics/denied state |
| `YANWU_CONTRACT=tactic-layer-regression node tests/e2e/yanwu-workspace-contracts.mjs` | PASS; 1440/390/320 layout, ordinary red/blue teammate, map present/missing, empty/read-only, layer selection/draft/metadata/refresh/denied contracts |
| `npm run check:architecture` | PASS |
| `npm run typecheck` | PASS, including after final JSX readability edits |
| `npm run test:core` | PASS |
| `npm run lint` | PASS; 0 errors, 18 existing `no-img-element` warnings |
| `git diff --check` | PASS; ordinary LF/CRLF notices only |

Architecture/core used precise escalation because sandbox `tsx` bootstrap failed in `os.userInfo` with ENOMEM before project execution. Human-factor screenshots required precise escalation after an EPERM writing its existing `.cache/test-artifacts` output. Local test-video encoding used the approved existing encoder. No environment/dependency changes were made. Native Node TS emits the existing MODULE_TYPELESS_PACKAGE_JSON notice; no package metadata was changed to suppress it.

The primary suite independently exercises real feature HTTP calls: join-preview Enter/Escape, confirmation PUT with 10 player records, tab arrow navigation, submit dialog focus restoration, normalized .35/.45 tactic route PUT, like mutation, delete-dialog focus, monitor immediate-check POST. Fixtures explicitly cover owner/member/visitor/guest, draft/submitted/read-only, empty/error/denied, map missing, hidden post, media failure, monitor resource failure, missing lease and stream error. Both 320 and 390 player checks assert input/select rectangles are inside their actual cells and at least 44px, beyond a page scrollWidth-only test.

## Artifacts and visual inspection

- Gallery: `D:/WorkSpace/王者演武堂/test-results/yanwu-workspaces/index.html`
- Manifest: `D:/WorkSpace/王者演武堂/test-results/yanwu-workspaces/manifest.json`
- Verification: `D:/WorkSpace/王者演武堂/test-results/yanwu-workspaces/verification.json`
- Baselines: `{09,10,11,12,15,16,17}-{desktop,mobile}.png` in that directory.
- Separate mobile long captures: `{family}-mobile-full.png` when needed.
- Supplemental actual single-player viewport: `11-player-fields-viewport.png`.

Desktop uses canonical routes at 1440×900 and full-page capture; mobile uses matching `/m` routes at 390×844 with separate viewport/long captures. Additional dimensions: 320×812, 375×812, 768×1024, 812×375 landscape and 1024×768. Supplementary states do not count toward the 14 baselines. All referenced files exist. A failed or filtered run clears stale success files and cannot emit a full passing manifest.

All seven pairs were actually opened during iteration; parent independently viewed all 14 and the long/player-detail supplements. Final normal-video desktop/mobile and the final 44px-link mobile feed were opened again. Parent feedback on date control boundaries, paired statistics, faction text, tactic H1, compact feed toolbar, dark-media retry and paper article/comments is incorporated.

**Media declaration:** family 15 is the actual product's linked video placeholder, not a playable inline video. Family 16 uses `tests/e2e/yanwu/workspace-video.mp4`: a 5691-byte, two-second silent synthetic H.264 clip with visible `TEST FIXTURE` / `本地复盘测试画面 · 非游戏录像` labels. Generated from a color source, not copied from promotional/game/production footage. Provenance is `workspace-video.md`; committed bytes avoid runtime dependence on FFmpeg. The baseline calls real native `video.play()`, requires `paused === false` and `currentTime > 0`, then pauses for a visible labeled-frame capture. Metadata availability alone is not counted as playback. Media failure remains supplemental.

## Exact fixture / host handoff for Task 4

Reuse `startYanwuHost` from `tests/e2e/yanwu/host.mjs`. RootLayout defines CSS order. Unknown APIs return `null` from the dispatcher and produce host 503 plus violations; do not add broad success fallbacks. Assert zero host violations, unhandled page errors and unexpected external requests. Exceptions from API handlers are not swallowed.

`workspace-entry.tsx` mounts the actual pages inside ThemeProvider / ToastProvider / ThemeLayout. `workspace-navigation.tsx` derives id/matchId/side/postId from the actual pathname. `workspace-auth.tsx` is initial-document render identity only; it does not mutate when navigation drops query labels. The suite separately aliases `@/features/auth/client/api` to **real** `src/features/auth/client/api.ts`; use this exact separation for admin APIs. `workspace-resources.tsx` is the explicit scheduler boundary fixture and throws on unknown resource names.

`workspace-fixtures.ts` exports **`makeMonitorFixture(userId = 1)`** → `{ userId, leaseId, resources, events }`. `leaseId` is `workspace-monitor-${userId}`. Resources are fresh clones and include scope/state, leases/loads/sharedLoads/cacheHits/staleHits/evictions, version/loadedAt/expiresAt/idleSince, lastError and **loadErrors**. Events include the actual `connected` and `monitor-check` wire shapes. Use a fresh factory result for each admin case, and choose the correct document-scoped identity. Test data is fictional with fixed timestamps.

Normal monitor GET `/api/heroes/watch` returns those frames with `contentType:'text/event-stream', keepOpen:true`; the real component reaches “实时连接正常” and enables its immediate-check button. `connection-error` deliberately returns 204; `lease-error` returns a resource-hook error and no lease; `error` fails `/api/admin/resources`. These are distinct supplemental states, not substitutes for the connected baseline. The host SSE regression covers abort and close resource release, not Redis/scheduler restart/reconnect production semantics.

`yanwu-workspace-contracts.mjs` is only a launcher for the three existing supported HTTP-fixture suites using this same real component entry; it does not introduce a second mock UI. Those legacy suites retain their original HTTP fixtures and assertion logic; the new strict primary suite is separate. Same-origin document fulfillment uses the exact host HTML to avoid observed local AdGuard injection while real bundle/CSS/API requests remain on the host. No external-domain whitelist was added.

## Explicit boundaries / remaining verification

No real Next server/build, database authorization, OCR provider, storage/media service, production SSE scheduler, deployment or live external asset access was run. Next production build and combined full-site evidence remain Task 5. Only local Edge/Chromium was available: no Firefox/WebKit, physical-device or native-browser-200%-zoom claim. Upload progress/cancel/timeout, all correction/objection mutation permutations and hero/equipment selection subpanels were preserved but not fully replayed in this task's primary suite. Existing native video controls and deletion confirmation remain; no business authorization was weakened for screenshots. Shared host adaptations are test-only and precisely bounded.

Parent plan changes and unrelated untracked planning/history documents are excluded from the scoped commit. No known failing assertion remains in the executed Task 3 checks; independent review is the next gate.
