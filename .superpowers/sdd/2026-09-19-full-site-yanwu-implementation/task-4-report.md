# Task 4 — nine administration pages

Date: 2026-09-19. Branch: `codex/history-theme-system`.
Base: `0d116f2573d44ac92a9aad87a2634e3214a0f7b0`.

## Delivered scope

All nine real page families 18–26 mount inside the actual ThemeProvider, ToastProvider, ThemeLayout and AdminShell. Server layouts and authorization are unchanged. Desktop has the nine-destination paper rail; mobile has one labelled management-menu button, hidden/non-tabbable collapsed navigation, Escape focus return and automatic close on link navigation or browser history.

| Family | Real component | Presentation |
| --- | --- | --- |
| 18 | AdminDashboard | Open statistic bands and editorial management/recent-post sections |
| 19 | AdminUsersPage | Named, focusable local table; account/status/actions; administrator rows keep no destructive controls |
| 20 | AdminTournamentsPage | Room ledger, semantic status labels, local table scrolling and original deletion confirmation |
| 21 | CombatPostManager | Paper filter form, open content rows and original moderation confirmation |
| 22 | AnnouncementManager | Shared table and paper editor/preview; original publishing and save calls |
| 23 | HistoryThemeStudio | Paper workbench and responsive reading previews; sources, dates, nature and reconstruction boundaries retained |
| 24 | AdminHeroesPage | Lane filters, labelled main-lane select, secondary-lane pressed states and per-row save/error feedback |
| 25 | MonitorDashboard | Actual Task 3 view inside AdminShell, container spacing only; real feature EventSource and check call |
| 26 | AdminSettingsPage | Grouped source form and sync progress; load error with explicit retry instead of an empty editable form |

`admin.css` was replaced in place, not supplemented with a second theme. Existing history rules were edited in place. Announcement scoped layout CSS moved into the admin stylesheet, avoiding another host-only styled-jsx transform. Shared tokens and monitor view/style ownership were retained. Buttons have 44px minimum height; actual inputs/selects use 16px text. Tables retain semantic headers/captions and named local overflow areas. No body/html overflow clipping was added.

History remains UI-only: no save/publish API was created, source safety and owner-specific runtime drafts remain in their original implementation, and disabled actions keep explanations. Culture/solemn sample text is explicitly design prose, not historical claims. Normal studio baselines show its own unsaved initial state; supplementary reading examples are filled through real controls.

## Explicitly approved shared error fix

The real `useAuth.logout()` ignored `ApiResult.ok`, so HTTP 503 still cleared identity and navigated to login. Controller approved the precise extension beyond the original display file list: check `result.ok` and throw a controlled retry error. Its actual mounted public Header caller now catches failures, retains its menu, shows an alert and disables the pending button. AdminShell's existing catch now receives HTTP failures. Successful identity-change dispatch and login navigation are unchanged. Unmounted legacy AdminSidebar/MobileAdminLayout were not refactored.

## Observed RED → GREEN

- Initial `node tests/e2e/yanwu-admin.mjs`: exit 1, `mobile admin navigation must start collapsed`, actual `true`, expected `false`, against the real original AdminShell at 320px.
- Error probe (`YANWU_RED=errors`): exit 1 with both `HTTP503 logout must retain admin identity and show retry error` and `settings load failure must show an error instead of an empty editable form`.
- Hero-table mobile check found page scroll width 392 at viewport 390. Actual offending nodes were two absolutely positioned `sr-only` labels outside the table's containing block. Positioning the local scroll wrapper contains them without hiding page overflow.
- Parent visual review identified danger-button text overridden by shared button rules. Computed-color RED observed `rgb(81, 92, 81)` instead of `rgb(143, 29, 20)`; scoped `.admin-workspace .admin-danger` now passes.
- Two intermediate timeouts were exact accessible-name selectors (hero select and announcement label/helper text), not successful runs. Hero select received an explicit descriptive label; announcement test selects its actual textbox name. Final full runs exercise both real save payloads.

## Verification and artifacts

Commands used local Node 26.2.0 and Microsoft Edge:

| Check | Result |
| --- | --- |
| `node tests/e2e/yanwu-admin.mjs` | PASS; 18 baseline records, seven widths, 30 total records |
| `node tests/e2e/history-theme-ui-regression.mjs` | PASS; original complete history layout/card/source/draft safety assertions retained |
| `npm run check:architecture` | PASS |
| `npm run typecheck` | PASS |
| `npm run test:core` | PASS |
| `npm run lint` | PASS; zero errors, 18 existing img-element warnings |
| `git diff --check` | PASS; normal LF/CRLF notices |

The architecture check initially failed before project execution because sandboxed tsx `os.userInfo` returned ENOMEM; its exact command then passed with scoped escalation. Core used the same known bootstrap workaround. An early replacement patch attempting separate delete/add of admin.css was rejected by automatic review; the safe alternative was a single complete in-place replacement. No file was left deleted. Native Node TS emits the existing MODULE_TYPELESS_PACKAGE_JSON notice; no package metadata or dependency changed.

Gallery: `D:/WorkSpace/王者演武堂/test-results/yanwu-admin/index.html`.
Manifest and verification: the same directory, `manifest.json` and `verification.json`.
Normal page captures: `{18,19,20,21,22,23,24,25,26}-{desktop,mobile}.png`; mobile full-page images are separate `*-mobile-full.png` paths in records.
Supplementary captures include long-name menu, logout/settings load errors, sync completion, four monitor boundary states, and culture/solemn desktop/mobile reading examples. Supplementary full-page captures return scroll to the top before capture so offscreen fixed skip-link positioning does not become a false visible element in the long-image composition. Skip functionality was not hidden or removed.

All nine baseline pairs and culture/solemn/error supplements were actually opened by the implementer; controller independently inspected all baseline pairs and supplements. Desktop is 1440×900, baseline mobile 390×844. Every family also runs 320×812, 375×812, 768×1024, 812×375 and 1024×768 layout/target checks. Contrast sampling measures composed backgrounds for rail labels and account breadcrumb; it is not exhaustive WCAG certification.

Actual interaction coverage: collapsed Tab exclusion, expand nine links, Escape/focus return, link/back close, long administrator name, no public navigation in admin, real HTTP logout failure/success in AdminShell and public Header, settings loading error/save pending/success/reset/sync, user pagination/ban/delete, hero row saving, announcement edit/save, moderation hide and dialog Escape, normal SSE connected state and manual-check POST. Mutation bodies are consumed and independently asserted.

Existing history regression still checks owner mismatch, identity-change clear while mounted/away, Back/Forward draft preservation without synthetic history, refresh/close warning, no local/session draft storage, all content kinds, unsafe links/remote images, nature/date/source boundaries, 45 uncomputed days and disabled publishing. Only stylesheet loading and collapsed-nav access expectations changed.

## Fixture handoff and limits

The admin suite uses `startYanwuHost` unchanged with real `@/features/auth/client` **and** real `@/features/auth/client/api`. Next routing alone is a test shim. API handlers match explicit methods/paths and return raw bodies; unknown traffic fails closed. Each case creates fresh admin data and `makeMonitorFixture(userId)` with matching shell identity, lease id, complete resources including loadErrors, and actual connected/monitor-check frames. Normal SSE uses explicit `keepOpen:true`. The resource hook is an explicit boundary fixture, not production scheduler evidence.

Success manifests are removed before a run and written only after all checks pass. `YANWU_FAMILY` is diagnostic only and cannot write full success evidence. Final assertions require zero unknown host requests, zero unhandled page errors and zero unexpected external requests.

No database, server authorization, production connection, backend/schema, dependencies, CI, deployment, push or merge changed. Full Next production build and combined public/workspace/admin regression remain Task 5. This task does not claim native 200% browser zoom, physical devices, WebKit/Firefox, exhaustive mutation-failure permutations or production SSE scheduler behavior. Existing failure branches are retained; the primary suite specifically verifies reproduced logout/config-loading failures. Parent's implementation-plan edit and unrelated untracked documents are excluded from the commit.
