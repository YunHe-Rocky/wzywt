# Full-site Yanwu UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the approved paper/ink/vermilion design to all 26 page families and their mobile routes, including navigation, opening animation, states and screenshot evidence.

**Architecture:** Keep existing feature contracts and business state. Replace the visual layer at its current ownership points; use one semantic token system and shared responsive shells. Test actual components with database-free esbuild/Playwright hosts; all fixtures stay under tests.

**Tech Stack:** Next.js 15, React 18, TypeScript, Tailwind/PostCSS, Playwright, esbuild. Existing Node >=24, no added runtime dependency.

**Spec:** `docs/superpowers/specs/2026-09-19-full-site-yanwu-design.md` (user approved 2026-09-19).

## Global Constraints

- 不启动数据库、不迁移 schema、不访问生产、不修改部署/CI或服务器进程。
- 在 `codex/history-theme-system` 当前目录开发，保留用户其他未跟踪文档；不推送、合并或部署。
- 新布局、视觉与交互放 `src/web`；不得直接 fetch、查 Prisma/Redis、调整爬虫或分队算法。
- 使用一个主题身份 `yanwu` 和一套语义 token，不新增主题切换器、URL hash 换肤或每页独立配色。
- 主要控件至少 44×44 CSS px；普通文本对比度至少 4.5:1，大字至少 3:1；状态不只依赖颜色。
- 320px 无页面级水平溢出，不用在 html/body/main 上裁切来掩盖。
- 历史主题仍是 UI-only：保存、发布、正式反馈等未接通能力保持禁用及解释。
- 不引入新动画依赖、远程字体或全站截图生产接口。测试夹具只存在测试宿主中，正式构建不可读到测试身份/假数据开关。
- Formal page coverage is the spec's numbered 01–26 matrix, 52 desktop/mobile entries. Debug families and extra states are supplementary, not substitutes.
- No unrelated dependency, feature, API, schema or deployment changes. Preserve selective prefetch, auth redirects, resource leases, OCR/manual confirmation, permissions, and source provenance.
- Tests-first for behavior changes: record RED against current implementation, GREEN after changes. Visual acceptance checks rendered geometry/contrast/interaction and screenshots, not source string presence.
- All paths below are repository-relative. Worktree is `D:/WorkSpace/王者演武堂`; Node `D:/node-v26.2.0-win-x64/node.exe`; browser `C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`.

## Execution and Review

Each task receives its own brief, report and diff package, implements sequentially, then passes an independent spec-and-quality review. Parent may do read-only discovery and verification in parallel. Commit only task-owned files after focused tests; no broad git add. Preserve artifacts until final review and user screenshot handoff; no workspace deletion.

Task reports must include actual red/green commands and outputs, modified files, known limitations and screenshot locations. All hosts bind `127.0.0.1`, close server/browser in finally, and reject unmocked API/external requests. Use a generated exact HTML navigation response to isolate host-injected scripts as in existing history UI regression, without suppressing application errors.

### Task 1: Shared paper-ink foundation, navigation and lightweight opening

**Files**

- Modify: `src/app/layout.tsx`, `src/app/globals.css`, `src/app/template.tsx`, `tailwind.config.ts`.
- Modify: `src/web/styles/arena.css`, `src/web/styles/arena-motion.css`, `src/web/styles/arena-glass.css` (compatibility-only after removing obsolete visual rules).
- Modify: `src/web/components/layout/{Header,ThemeLayout,PageEntrance}.tsx`, `src/web/components/layout/alternate/Dock.tsx`, `src/web/components/arena/{ArenaIntro,ArenaIcon}.tsx`, `src/web/components/home/LoginReveal.tsx`, `src/web/animation.ts` when required for one animation owner.
- Create: `src/web/styles/yanwu-tokens.css` as the only theme color/font/radius/layout token authority.
- Create: `tests/e2e/yanwu/{host.mjs,routing-shim.tsx,auth-shim.tsx,foundation-entry.tsx}`, `tests/e2e/yanwu-foundation.mjs`.
- Modify legacy motion/glass regression assertions only where replaced visuals change expected behavior; retain old files and functional checks.

**Interfaces**

- Consumes real `ThemeLayout({children})`, `ThemeProvider({children})`, `ToastProvider({children})`, `Header`, `Dock`, `ArenaIntro`.
- Preserves `replayArenaIntro(): void`, storage `yanwu:intro-seen:v1`, replay event `yanwu:replay-intro` and all navigation/auth interfaces.
- Test helper export: `startYanwuHost({entry, aliases = {}, output}) -> Promise<{baseURL, html, apiRequests, close()}>`; entry is a test TSX path, aliases maps import specifiers to test-module paths. It compiles actual root stylesheet order and serves only bundled JS/CSS/public assets with path validation. `close()` owns only this server.
- Routing shim exports existing Next hooks used by mounted components; navigation uses history and popstate so active states really rerender. No production-only testing props.
- Browser scenarios are selected by test URL query; auth shim reads fixture role but production auth stays unchanged.

- [ ] Write foundation host and behavioral tests first. At 390px, current Dock must fail because personal navigation is duplicated and five rather than four primary slots render; add real menu reachability and layout assertions:

```js
await page.setViewportSize({width:390,height:844});
assert.equal(await page.getByRole('navigation',{name:'主导航'}).isVisible(),false);
assert.equal(await page.getByRole('navigation',{name:'底部导航'}).locator(':scope > a, :scope > button').count(),4);
await page.getByRole('button',{name:'打开图鉴菜单'}).click();
assert.equal(await page.locator('#dock-catalog-menu').getByRole('link',{name:'装备',exact:true}).isVisible(),true);
await page.keyboard.press('Escape');
assert.equal(await page.getByRole('button',{name:'打开图鉴菜单'}).evaluate(el=>el===document.activeElement),true);
```

- [ ] Run `node tests/e2e/yanwu-foundation.mjs`; record the expected behavioral failure before editing product files. Use rendered contrast measurements (text versus actual paper/card surface), primary target geometry and document width as shared-theme regression checks.
- [ ] Replace tokens at their ownership points, remove duplicate legacy root/theme definitions, keep compatibility aliases for existing consumers (e.g. `--gold` points to brand accent while danger/team colors remain separate). Use these explicit values:

```css
:root,[data-theme="yanwu"] {
  --bg-root:#f5f2ea; --bg-card:#fffdf8; --text:#252b28;
  --text-secondary:#515c51; --text-muted:#697064;
  --brand-accent:#a43e32; --brand-ink:#426855; --brand-dock:#29382f;
  --border:#dcdccf; --radius-sm:4px; --radius:8px; --radius-lg:12px;
  --font-display:'Songti SC','SimSun',serif;
}
```

- [ ] Rework shared header/Dock to approved bookmark geometry and four destinations home/tournaments/catalog/combat; personal account only on top. Desktop catalog exposes hero and equipment, full account menu remains. Honor `/m`, roles, prefetch/pending/keyboard and narrow-screen clearance; keep existing accessible names where still accurate.
- [ ] Replace Canvas opening with scoped CSS/SVG stamp/ink line, 1860ms lifetime, one active instance, 420ms static manual replay for reduced motion. Preserve exact original inert/overflow/focus, storage-failure memory fallback, Escape/Tab/skip, visibility/route/unmount cleanup, dynamic reduced-motion changes; skip modal/fullscreen contexts. Do not mix with login reveal.
- [ ] Remove root mounts of old background orbs and cursor lighting. Keep only one route entrance owner, max 300ms and reduced-motion-aware. Use `--layer-*`, not numeric z-index additions. Shared controls use 44px targets and 16px inputs; dialogs remain portals.
- [ ] Run foundation tests covering desktop/mobile, guest/user/admin, menu and focus, auto/replay/skip/unmount/storage/modal/motion cases. Run `npm run check:architecture`, `npm run typecheck`. Capture foundation at 1440/390/320. Commit only the listed touched files and write report.

### Task 2: Home, identity, profile, library and editorial pages

**Files**

- Modify: `src/web/components/home/HomePage.tsx`, `src/web/components/auth/AuthForm.tsx`, `src/web/components/hero/{HeroGrid,HeroDetail,HeroSelect,HeroPortrait}.tsx`, `src/web/components/me/*` only for display, `src/web/components/content/MarkdownContent.tsx`.
- Modify presentation only: `src/app/me/page.tsx`, `src/app/equipment/page.tsx`, `src/app/equipment/[id]/page.tsx`, `src/app/changelog/page.tsx`, `src/app/changelog/[slug]/page.tsx`, `src/app/loading.tsx`, `src/app/not-found.tsx`.
- Create: `src/web/styles/yanwu-public.css`; move matching home/auth/library/editorial rules from arena.css rather than override them twice; add one root import.
- Add optimized asset `public/art/yanwu-ink.webp` with provenance `public/art/yanwu-ink.md` from approved local PNG; preserve source, no new generation required.
- Create: `tests/e2e/yanwu/{public-entry.tsx,public-fixtures.ts}`, `tests/e2e/yanwu-public.mjs`; reuse Task 1 host.

**Interfaces**

- Consume existing feature hooks/API responses verbatim; do not change resource names, request bodies, auth roles or route signatures.
- Render actual page components in the test entry, with complete fixtures at feature/network boundary. Named cases map spec rows 01–08 and 13–14, plus loading/404. Test entry exports no production API.
- Reuse token/host contracts from Task 1. Files owned by Task 1 may only change for removing relocated public style rules and adding the stylesheet import.

- [ ] Add browser cases for actual home, login/register, me, hero list/detail, equipment list/detail, changelog list/detail. Add long names, absent content/images, empty and error fixtures. Assert protected resources stay unrequested for visitors and form fields/filters remain usable.
- [ ] Run `node tests/e2e/yanwu-public.mjs` and capture pre-change failure for approved home layout and image/CTA ordering at mobile. Do not require exact marketing copy in regression tests.

```js
const heading=await page.locator('h1').boundingBox();
const action=await page.getByRole('link',{name:'进入赛事大厅',exact:true}).boundingBox();
assert.ok(action.y>heading.y && action.y+action.height<650);
assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
await page.getByLabel('搜索英雄名称').fill('不存在的测试名称');
assert.equal(await page.getByText('没有找到匹配的英雄',{exact:false}).isVisible(),true);
```

- [ ] Build the approved editorial home rather than recolor the old hero: paper/ink heading, right-weighted painting, real join/create controls, compact culture slot only with valid data, open room list, clear library/content sections. Preserve empty/error/retry/copy/announcement behaviors.
- [ ] Unify identity forms and profile/library/article surfaces with shared typography, compact mobile sections, real data imagery, readable state feedback. Retain existing callbacks/state and all labels. Resolve hardcoded pale-on-paper colors in these pages at source; no broad CSS `!important` patch.
- [ ] Optimize the approved PNG using existing sharp to local WebP, with explicit dimensions and responsive sizing. Image-format conversion is build processing, not a redesigned illustration. Record provenance; do not modify original image.
- [ ] Run public tests at seven spec widths, input/search/menu/password/retry flows, long-title/320px hero stats/200% scale checks. Save screenshot records containing route, role, fixture identity and state. Run architecture/typecheck/core and commit this task's scoped files after report.

### Task 3: Rooms, match archive, tactics, combat and monitoring

**Files**

- Modify presentation: `src/web/components/tournament/{TournamentList,TournamentDetail,HeroPickPanel}.tsx`, `src/web/{MatchWorkspace,MatchArchivePanel,TacticBoard,CombatWall,CombatPostDetail,MonitorDashboard}.tsx`, `src/web/components/match/MatchWorkflowProgress.tsx` and their display subcomponents.
- Create: `src/web/styles/yanwu-workspaces.css`; relocate owned rules out of globals/arena without losing data-table/keyboard/geometry behavior; add root import.
- Create: `tests/e2e/yanwu/{workspace-entry.tsx,workspace-fixtures.ts}`, `tests/e2e/yanwu-workspaces.mjs`; reuse existing complete match/tactic/combat fixtures from human-factors and room regressions where possible.

**Interfaces**

- Consume the existing tournaments/matches/tactics/combat/monitor feature clients and hook signatures unchanged. No changes to API routes, request serializers, leases, locks, OCR decisions or timers.
- Screenshot cases cover spec rows 09–12, 15–17 (7 families). Each main fixture includes real-shape roles, permissions, status and error fields, not permissive `{}` fallbacks.
- Use shared tokens, 900px navigation boundary and Task 1 host; browser fixture handlers must reject unknown API requests.

- [ ] Write actual component regression tests first for room button/seat ordering, member/owner/read-only states, match tab navigation, confirmation restoration, map coordinate alternative, media failure and monitor connection/error. Record RED for old cramped/low-contrast layout using rendered geometry and contrast, not class-name string inspection.

```js
await page.setViewportSize({width:320,height:812});
assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
const button=page.getByRole('button',{name:'正式提交并锁定',exact:true});
await button.click();
const dialog=page.getByRole('alertdialog');
assert.equal(await dialog.isVisible(),true);
await page.keyboard.press('Escape');
assert.equal(await button.evaluate(el=>el===document.activeElement),true);
```

- [ ] Rebuild room list/detail hierarchy with paper rows, visible capacity, deadline, membership and contextual actions; match approved lobby pacing without literal fake room data. Maintain ordering title → seats → action on narrow screens and dedicated admin/member controls.
- [ ] Apply restrained paper workbench layout to match, tactics, combat and monitor. Preserve red/blue data identity and map artwork. Match mobile uses the same semantic table; wide monitoring/resource tables get named local scrolling only. No server-side memory/performance tuning in this task.
- [ ] Retain six screenshot types, OCR confirmation, read-only submissions, objection/correction, upload progress/cancel/failure, video native controls, pagination and deletion confirmation. CSS may not hide controls to pass geometry checks.
- [ ] Run workspace tests across seven widths including landscape and state cases; run existing relevant human-factors contract tests where host supports them, architecture/typecheck/core. Save paired screenshots for all seven families, report and scoped commit.

### Task 4: Nine admin pages and culture/solemn workspace

**Files**

- Modify: `src/web/components/admin/{AdminShell,AdminDashboard,AnnouncementManager,CombatPostManager}.tsx`, `src/web/styles/admin.css`, `src/web/styles/history-theme.css`.
- Modify presentation: `src/app/admin/{users,tournaments,heroes,settings}/page.tsx`; preserve server layouts and authorization.
- Modify display as needed: `src/web/components/history-theme/{HistoryThemeStudio,HistoryThemeEditor,HistoryThemePreview,HistoryThemeDetail,ActiveThemeCard}.tsx`.
- Create: `tests/e2e/yanwu/{admin-entry.tsx,admin-fixtures.ts}`, `tests/e2e/yanwu-admin.mjs`; reuse Task 1 host and Task 3 monitor fixture where appropriate.
- Update: `tests/e2e/history-theme-ui-regression.mjs` stylesheet loading/navigation expectations only if needed for new collapsed mobile shell; preserve safety assertions.

**Interfaces**

- Preserve `AdminShell({userId,username,children})`, AdminIdentityProvider, ADMIN_NAVIGATION, feature clients and all owner-scoped temporary draft behavior.
- Cases cover rows 18–26. `/admin/monitor` mounts real MonitorDashboard inside real AdminShell. History remains unconnected and disabled actions retain their explicit explanations.
- Mobile menu has one visible trigger, `aria-expanded`, named controlled nav, Escape/focus return and automatic close on navigation. Desktop rail retains all nine destinations.

- [ ] Write tests before implementation: mobile collapsed nav must not be keyboard reachable, expand exposes all nine links, route change closes it, long admin name doesn't overflow, save/delete states retain semantic controls. Current always-visible rail must fail the collapse behavior.

```js
const trigger=page.getByRole('button',{name:'管理菜单',exact:true});
assert.equal(await page.getByRole('navigation',{name:'后台导航'}).isVisible(),false);
await trigger.click();
assert.equal(await page.getByRole('navigation',{name:'后台导航'}).getByRole('link').count(),9);
await page.keyboard.press('Escape');
assert.equal(await trigger.evaluate(el=>el===document.activeElement),true);
```

- [ ] Implement v4-inspired paper admin workspace, desktop rail/mobile folded menu, clear section headings/stats, uniform tables/forms and empty/error/action feedback. Apply to all nine pages, not just dashboard; preserve business calls and authorization.
- [ ] Rework history studio preview/card/detail into consistent cultural reading; solemn presentation removes festive artwork and gameplay metrics. Preserve every source/date/nature/reconstruction distinction and UI-only indicators; do not add public history route or enable publishing.
- [ ] Run admin tests and existing history UI regression with actual components; verify temporary draft isolation, original sources and no API write leakage. Save nine paired page captures plus culture/solemn, report and scoped commit after architecture/typecheck.

### Task 5: Whole-site evidence, edge cases, documentation and final verification

**Files**

- Create: `tests/e2e/yanwu-full-site.mjs` as orchestrator for Task 1–4 suites, `tests/e2e/yanwu/manifest.mjs` for explicit 26-family matrix and artifact indexing.
- Modify: `package.json` with `test:e2e:yanwu` script, `docs/design/ui-system.md` to document actual new system; preserve existing tests/scripts.
- Generated (ignored): `test-results/yanwu-full-site/{index.html,manifest.json,verification.json,*.png}`.
- Repair only UI and test files touched by Tasks 1–4 when fresh verification finds integration defects; no unrelated fixes.

**Interfaces**

- Each suite emits `{family,route,viewport,role,state,source:'isolated-component-fixture',file}` records and actual test results. Orchestrator combines them only after each suite exits successfully.
- Manifest lists rows 01–26 explicitly, verifies desktop/mobile route pairing and expected component identity. 404, intro and history extra states do not count towards the required 52.

- [ ] Write matrix validation and execute RED before complete artifact collection; missing family or non-existent image must fail, not be dropped.

```js
assert.equal(new Set(records.filter(r=>r.state==='baseline').map(r=>r.family)).size,26);
for(const family of families){
  for(const width of [1440,390]){
    const record=records.find(r=>r.family===family.id&&r.viewport.width===width&&r.state==='baseline');
    assert.ok(record,`Missing ${family.id} at ${width}`);
    assert.ok((await stat(record.file)).size>0);
  }
}
```

- [ ] Collect all 52 page captures with actual components and complete controlled data; additional loading/empty/error/permission/dialog/200% scale/motion states recorded separately. At mobile capture first viewport plus optional full-page image; actual data fixture status stays explicit in gallery.
- [ ] Root visually inspects every page pair and all high-risk extra states, fixing visible defects via implementer/review loop. No collage alone substitutes for individual screenshots; compare against approved v4 visual intent.
- [ ] Run `npm run check:architecture`, `npm run typecheck`, `npm run test:core`, `npm run lint`, `npm run build`, `npm run test:mobile-routes`, `npm run test:device-routing`, `npm run test:auth-redirect`, `npm run test:history-theme:core`, `npm run test:e2e:yanwu` with safe local environment. No DB writes; do not print or use real .env credentials. Build must be run with explicit nonproduction local dummy configuration if env access is possible.
- [ ] Document exact passed/failed/not-run checks. Clearly state isolated component browser verification is not real server/database E2E. Preserve all unchanged legacy behavioral regression coverage and record any visual-only assertion updates.
- [ ] Update UI system documentation with current token, navigation, opening, responsive, state and screenshot contract. Generate gallery with links, provenance, state and viewport, plus summary reports. Scoped commit, independent final review, then provide user screenshots and leave branch unmerged/unpushed.

## Plan Self-Review

- Coverage: Task 1 spec sections 3/4/5; Task 2 rows 01–08/13–14; Task 3 rows 09–12/15–17; Task 4 rows 18–26 and history boundaries; Task 5 full matrix and section 9 evidence.
- Shared files: root layout/styles belong to Task 1, later tasks add imports and relocate only their own page styles sequentially. Host interface is established once in Task 1 and extended by test entries without production mocks.
- Constraints: no database, production, CI, schema or business changes; no new runtime dependency; all screenshots labeled fixture-based.
- Exact-copy test excerpts illustrate the intended user-visible contracts; if an accessible name differs in actual retained UI, use the verified existing name without altering tested behavior and document the adjustment.
