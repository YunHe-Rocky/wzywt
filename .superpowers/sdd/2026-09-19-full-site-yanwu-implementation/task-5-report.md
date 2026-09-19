# Task 5 report — whole-site evidence and final verification

## Delivered

- Added an explicit 26-family route/component matrix and strict 52-baseline validator. Missing families, duplicate baselines, wrong routes/components/viewports/sources, and missing or empty image files fail instead of being omitted.
- Added the `test:e2e:yanwu` orchestrator. It removes only the three suite success manifests, accepts them only after fresh successful child exits, runs independent browser suites at at most two-way concurrency, then writes the formal gallery, manifest, and verification summary.
- Aligned the Dock's visible and accessible destination name to `演武`, preserving the existing destination, prefetch behavior, pending state, and routing.
- Closed the opening lifecycle integration defect: a standard pathname change unmounts the active intro, precisely restores scroll/inert/focus state, does not replay automatically, and retains manual replay on the destination.
- Added the missing natural completion, background visibility, exact restoration, existing-modal replay suppression, and same-context desktop/mobile/desktop navigation checks. Four fresh intro frames are supplemental evidence.
- Mounted the three actual debug components in the isolated fixture host, moved their legacy animations/orbs out of global production CSS into scoped debug CSS, retained owned orientation-listener cleanup, and verified all six standard/mobile debug routes at 320 px without page clipping.
- Updated the maintained UI-system document and preserved the provisional `preview.html` link alongside the formal gallery.

## TDD evidence

- Manifest RED: the focused test initially failed with `ERR_MODULE_NOT_FOUND` for `yanwu/manifest.mjs`. GREEN: 6/6, including missing-family, duplicate-baseline, missing-file rejection, and per-segment URL encoding for `%2F`, `#`, and spaces.
- Dock RED: the rendered link exposed `aria-label="赛事"` while its visible text was `演武`. GREEN: exact visible and accessible name are both `演武`.
- Intro route RED: during an active opening, `/` to `/heroes` still had one intro, hidden overflow, and inert main after the route event. GREEN: the dialog detaches within the focused bound, overflow/inert are restored, no automatic replay occurs, and manual replay still works.
- Debug RED: the actual `/debug/login-effect` component overflowed the 320 px viewport. GREEN: all three real debug components and their `/m` mirrors have their exact headings and no page-level horizontal overflow; no root overflow clipping is used.

## Fresh verification

All required checks completed with exit code 0 on Node 26:

- `npm run check:architecture`
- `npm run typecheck`
- `npm run test:core`
- `npm run lint` — 0 errors; 18 existing `img` warnings
- `npm run test:mobile-routes` — 29 route families
- `npm run test:device-routing`
- `npm run test:auth-redirect`
- `npm run test:history-theme:core` — 45/45
- `npm run build` with the documented explicit local dummy configuration — compiled in 10.6 s and generated 48/48 static pages; no real `.env`, database initialization, migration, or production connection
- `npm run test:e2e:yanwu` — host 4/4, foundation, public, workspaces, admin, history UI, human-factor, room-archive, and tactic-layer coverage; final result `26 families, 52 baseline records`
- `node --test tests/e2e/yanwu/manifest.test.mjs` — 6/6 after the fresh browser artifacts existed
- Focused `file://` resolution/stat audit — all 212 gallery `href`/`src` references resolve to existing files
- Final real-Edge `file://` gallery QA — 26 articles, 52 decoded baseline images, 160 non-empty links, 390 px document/viewport width, zero page errors and external requests

The first restricted combined run stopped when the retained human-factor suite could not overwrite its own existing `.cache/test-artifacts/.../mobile-match.png` (`EPERM`). The same exact contract passed with focused local permission, and the final full combined run then passed with fresh manifests. This was an execution-environment file-write restriction, not a waived product assertion.

## Artifacts and boundary

- Formal gallery: `test-results/yanwu-full-site/index.html`
- Provisional gallery retained: `test-results/yanwu-full-site/preview.html`
- Machine-readable index: `test-results/yanwu-full-site/manifest.json`
- Verification summary: `test-results/yanwu-full-site/verification.json`
- Formal gallery links encode each filename segment, so literal percent escapes, `#`, spaces, and non-ASCII filenames remain addressable under `file://` without changing directory separators. The focused `--gallery-only` render refreshed only `index.html` after this review fix and preserved the successful browser manifest/verification timestamps.
- Baseline: exactly 26 families / 52 desktop and mobile records. Intro, debug, history, loading/error/permission/dialog, and other states remain supplemental and do not count toward 52.
- Root separately opened every 26 desktop/mobile pair and the six debug captures. Sources are explicitly `isolated-component-fixture`.

Actual Next runtime/start/hydration smoke was **NOT RUN**. The browser evidence does not claim real server/database authorization or production E2E. Only local Microsoft Edge/Chromium was available; Safari/WebKit and native browser zoom were not verified.
