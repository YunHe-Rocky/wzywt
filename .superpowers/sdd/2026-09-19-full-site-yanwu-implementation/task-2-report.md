# Task 2 — public pages implementation report

Date: 2026-09-19. Branch: `codex/history-theme-system`. Base: `2c2190b7d401b45984f28ac57d651449e18a72ad`.

## Scope and actual page mapping

Implemented the approved paper-white / ink-green / cinnabar editorial direction in the real mounted components, not replacement screenshot mockups. Existing feature/API contracts remain unchanged.

| Family | Standard / mobile route | Mounted component | Layout delivered |
| --- | --- | --- | --- |
| 01 | `/`, `/m` | HomePage | Left editorial heading, right landscape; heading-first mobile composition; first room featured with two compact open rows; compact catalogs and editorial updates |
| 02 | `/login`, `/m/login` | AuthForm login | Paper form, shared 武 seal, readable labels, labelled password controls, restrained exit transition |
| 03 | `/register`, `/m/register` | AuthForm register | Same identity system, full security-question and confirmation fields |
| 04 | `/me`, `/m/me` | MePage and mounted editors | Serif account heading, open sections, identity form, rank controls, shrinkable lane content and aligned 44px reorder controls |
| 05 | `/heroes`, `/m/heroes` | HeroGrid | Open filters, serif card names, readable lane/class ink colors |
| 06 | `/heroes/105`, `/m/heroes/105` | HeroDetailView | Compact portrait beside identity on mobile, readable statistics, skills and named skin fallback |
| 07 | `/equipment`, `/m/equipment` | EquipmentPage | Open equipment rows with explicit detail links, price/stats/passives retained |
| 08 | `/equipment/1136`, `/m/equipment/1136` | EquipmentDetailPage | Serif entity title, paper statistics and passive sections |
| 13 | `/changelog`, `/m/changelog` | ChangelogPage | Date/title directory rows and clear reading hierarchy |
| 14 | `/changelog/版本更新`, `/m/changelog/版本更新` | ChangelogDetailPage | Reading column and TOC, semantic padded tables with local overflow, visible list markers |

Loading and 404 are supplementary states, not extra baseline families. The unused HeroPowerEditor and unchanged HeroPortrait were not artificially mounted or edited. ActiveThemeCard still hides when no valid theme data exists; no invented historical content was added.

## Implementation boundaries

- Public styles have one owner, `src/web/styles/yanwu-public.css`; corresponding legacy home/auth/catalog/profile/editorial rules were removed from arena.css/globals.css. Root layout adds one stylesheet import. No new `!important` override layer.
- Shared PageHeading's font-family/weight was minimally corrected with explicit controller authorization; Header logic was not modified. Tokens add only named deeper purple/lane colors; no shared palette replacement or core role/color constant mutation.
- Actual room codes/counts/copy/view links, join/create entry points, announcement expansion, news retry, auth/reset validation, redirect safety, session confirmation, profile permissions/save payloads, hero forms/skins and article semantics remain in the mounted product flows.
- Login's old GlassShatter invocation becomes a short card fade; safe redirect handling remains. Reduced-motion is immediate, including preference changes during the transition. Recovery modal restores focus and cleans up its focus timer.
- Original approved `.planning/2026-09-19-full-site-redesign/ink-landscape-v1.png` is unchanged. Existing sharp produced `public/art/yanwu-ink.webp` (1440×960, quality 84, 133628 bytes). `public/art/yanwu-ink.md` records provenance. Mobile artwork uses local edge fading to merge into the paper.
- No DB, schema, server, business protocol, dependencies, CI, deployment, production or remote Git changes. Parent's modified implementation plan and unrelated untracked documents remain untouched and unstaged.

## TDD: observed RED and GREEN

Command (PowerShell, explicit local Node):

```powershell
& 'D:/node-v26.2.0-win-x64/node.exe' tests/e2e/yanwu-public.mjs
```

Initial pre-UI run exited 1 at `approved local ink landscape is the home illustration`: actual `/art/arena.webp`, expected `/art/yanwu-ink.webp`. The existing CTA geometry happened to pass; the suite now also asserts mobile landscape begins after the heading and first-screen CTA position. Subsequent concrete REDs included:

- `no page overflow: 04-mobile`: lane reorder button right edge 418px at a 390px viewport; corrected shrinkable lane/button columns and removed old conflicting widths.
- `.hero-card-copy span 坦克: 2.36`: actual computed foreground/background contrast; fixed web-only semantic ink mapping, retaining role/class labels and distinct hues.
- `closing password recovery restores its trigger focus`: corrected modal cleanup/focus restoration; regression now passes.

Final full browser result: exit 0, `PASS: Yanwu public pages; 20 baseline records and seven widths.` This is isolated real-component browser integration, not DB/server E2E. Every run removes stale success manifests first and writes fresh success evidence only after all assertions pass.

Other final commands use `$env:PATH='D:/node-v26.2.0-win-x64;'+$env:PATH`:

| Command | Observed result |
| --- | --- |
| `npm run typecheck` | Exit 0, `tsc --noEmit` |
| `npm run check:architecture` | Exit 0, `Architecture boundaries are valid, including AST imports, client/server separation, and API route data-access debt.` |
| `npm run test:core` | Exit 0, `Core, hero lane, calendar, tournament, and announcement tests passed.` |
| `npm run lint` | Exit 0, 0 errors / 18 `@next/next/no-img-element` warnings; no rules suppressed |
| `git diff --check` | Exit 0; Git emits normal LF/CRLF notices |

Sandbox tsx bootstrap initially failed with `uv_os_get_passwd` / ENOMEM before project execution. Architecture/core were then run with scoped escalation and passed. Edge likewise used scoped local-browser permission. Node emits a MODULE_TYPELESS_PACKAGE_JSON notice for its native TS fixture import; no package-type/dependency change was made to silence it.

## Browser coverage and artifacts

All ten families checked at 1440×900, 390×844, 320×812, 375×812, 768×1024, 812×375 and 1024×768. Full suite writes 56 manifest records, exactly 20 baseline records (10 desktop/mobile pairs); mobile long images are separate `fullPageFile` values, not extra baseline records.

Paths:

- Gallery: `D:/WorkSpace/王者演武堂/test-results/yanwu-public/index.html`
- Manifest: `D:/WorkSpace/王者演武堂/test-results/yanwu-public/manifest.json`
- Verification: `D:/WorkSpace/王者演武堂/test-results/yanwu-public/verification.json`
- Baselines: `D:/WorkSpace/王者演武堂/test-results/yanwu-public/{01,02,03,04,05,06,07,08,13,14}-{desktop,mobile}.png`
- Corresponding mobile long images: `{family}-mobile-full.png` when below-fold content exists.
- Text enlargement: `D:/WorkSpace/王者演武堂/test-results/yanwu-public/01-text-200-observed.png`

All twenty pagepair images were opened for visual inspection during iteration; final profile pair was opened again after the last control adjustment. Controller independently inspected all ten pairs and requested refinements now incorporated: faded landscape edges; compact room grid; auth seal; profile heading and column alignment; image-present gallery fixtures and visible missing-skin labels; article table/list semantics; equipment title and darker semantic text.

Normal hero/equipment baselines use explicit local SVG test-only illustrative media with visible TEST FIXTURE / 角色示意 / 装备示意 labels; they are not official artwork or product fallback assets. Missing-image cases are supplemental. Article baseline contains normal text/list/table content; deliberately missing editorial image is supplementary. Gallery labels the media and distinguishes viewport vs full-page images; a fixed Dock appearing midway in a full-page composite is not its on-screen position.

Behavior assertions cover actual search inputs; room copy; announcement expansion; independent home/news retry; catalog menu Escape; login password visibility and HTTP submit; registration custom security question; three-step reset with exact token/password payload; rejected session confirmation; failed login/register; visitor redirect with zero protected resource requests; successful profile values and lane-reorder HTTP save; failed profile save; actual image preprocessing then failed avatar upload; hero form switching and skin localStorage. Empty/error/loading/long/no-skins/no-stats/no-TOC/missing-image, loading and 404 captures are supplementary.

Computed style contrast is sampled on hero role/class labels, hero stats, equipment price/attributes, detail stats and article inline code against composed paper backgrounds. All sampled normal text is ≥4.5:1; minimum recorded ratio is 4.575791300910108. This is a named selector audit, not a claim of exhaustive page-wide WCAG conformance.

## Scaling evidence and limits

- **CSS scale at 768px:** home, hero detail, article and profile long cases use `document.body.style.zoom = "2"` at 768×1024. No horizontal page overflow; supplementary screenshots are recorded. This is a CSS-scale layout simulation, not browser chrome zoom and not a DPR claim.
- **390px text-size simulation:** initial computed font sizes are doubled for headings, body text and controls (`h1,h2,h3,p,span,strong,small,a,button,input,label,select`). Home result: viewport 390, scrollWidth 390, overflow `[]`; screenshot is recorded and visually inspected. It wraps into a much longer layout without observed clipping. This one representative case is an observation, not all-page text-scale certification.
- Earlier `body zoom:2` at a 390px viewport effectively constrained layout to 195 CSS px and exposed shared navigation crowding; that is below the approved 320px minimum and is not reported as a pass or silently relabelled real browser zoom. Shared Header zoom follow-up remains Task5's boundary; no Header logic was expanded here.
- Browser native 200% zoom, WebKit/Firefox, physical devices and a real Next production build are **not verified** by this Task2 suite. Only local Microsoft Edge/Chromium is available. Full build/combined suite remains later integration work.

## Exact reusable fixture/host handoff for Tasks 3/4

Reuse `startYanwuHost` from `tests/e2e/yanwu/host.mjs`; it derives RootLayout CSS order. Keep final assertions `host.violations === []`, unhandled page errors `[]`, unexpected external requests `[]`. Unknown APIs return null to the host so they fail, never blanket-success.

`tests/e2e/yanwu/public-entry.tsx` mounts real pages inside ThemeProvider / ToastProvider / ThemeLayout and routes using the test-only routing shim. `public-navigation.tsx` re-exports useRouter/usePathname/useSearchParams and explicitly supplies id/slug parameters. It currently declares equipment id `1136`, hero id `105`, slug `版本更新`; new workspace/admin suites must provide their own actual declared params, not rely on these literals.

`public-auth.tsx` is a **render identity** hook alias, reading initial-document `?role=guest|user&case=...`; guest returns null, otherwise the fictional user in `public-fixtures.ts`. Identity does not mutate when router redirects drop query labels. It does not model all admin identities and should be extended in test-only modules for Task3/4. Baseline only `/me` uses user; other public families use guest.

Crucially, the host's default auth shim is not sufficient for real form behavior. This suite explicitly aliases `@/features/auth/client/api` back to `src/features/auth/client/api.ts`, while only `@/features/auth/client` is aliased for rendering identity. Thus login/register/reset/getCurrentUser execute actual feature HTTP code against method/path-specific handlers, and failed session confirmation is genuinely exercised. Mutation bodies are consumed, recorded and asserted. Keep raw API response bodies verbatim, no invented envelope.

`public-fixtures.ts` exports fictional rooms/hero/formHero/heroes/equipment/equipmentDetail/entries/markdown/user and `fixtureImage`. `public-resources.tsx` aliases only `@/features/resource-scheduler/client`, returning resource data/version envelopes and named loading/error/empty/retry cases. It is intentionally a resource boundary fixture, **not a lease/SSE scheduler test**. Unknown lazy resource names throw. Actual detail hooks and profile HTTP paths run normally. A declared `/api/heroes/watch` connected stream permits the actual component subscription, but scheduler restart/reconnect lifecycle is not certified here.

`yanwu-public.mjs`'s `open(route,width,height,role,scenario)` is a useful pattern: fresh context/session, intro-seen flag, reduced motion, explicit image routing, pageerror collection. It fulfills only the same-origin document with the host's exact HTML to avoid observed local AdGuard HTTP script injection; real compiled JS/CSS/API still use the host. No external-domain exception was added for AdGuard. The only allowed external failure is declared `game.gtimg.cn` fallback imagery; other external attempts remain failures. Test images never reach production source paths.

Supported named cases include default, empty, error, loading, long, news-error, missing-image, no-skins, no-stats, no-toc and missing-session. `YANWU_FAMILY=05` is a development-only baseline filter; it deletes stale success files and does not write a passing full manifest, so always run the unfiltered suite for final artifacts. Future suites should follow `artifact-contract.md`, not import mutable fixture state from this suite.

Remaining boundaries: server/DB authorization is not tested here; no live remote artwork fetch; only sampled contrast; no exhaustive cross-product filter combination test; no real production build/native-browser zoom claim. No known Task2 blocker remains for independent review.

## Independent review fix round 1

Fix base: `cd5d4c6752c792f02785286d26d3b4bfd912d62e`. Both Important layout findings reproduced with tests before product changes.

New browser assertions measure real 320px HeroGrid label/action rectangles and all five password inputs across login, register and the actual three-step recovery flow. Password checks use a long fictional value, exercise show/hide, focus End, verify the end selection and internal scrolling, retain a 44px toggle and require at least 8px between its left edge and the input text area. The first test draft used the login id for registration; this setup timeout was corrected to actual `new-password` before collecting the valid RED below.

RED command: `& 'D:/node-v26.2.0-win-x64/node.exe' tests/e2e/yanwu-public.mjs`; exit **1**, `AssertionError: card labels and long password text must not be covered by actions`, with all expected findings:

```text
320px hero form action overlaps 对抗路
login/password text reaches 274, toggle starts 243; needs 8px gap
register/new-password text reaches 274, toggle starts 243; needs 8px gap
register/confirm-password text reaches 274, toggle starts 243; needs 8px gap
reset/forgot-new-password text reaches 262, toggle starts 231; needs 8px gap
reset/forgot-confirm-password text reaches 262, toggle starts 231; needs 8px gap
```

Minimal fixes: HeroGrid's 44px form action now occupies its own normal-flow row under the label content, rather than an absolute overlay. Password-bearing AuthForm inputs use a dedicated `auth-input--password` class with 56px right padding, replacing the ineffective earlier `pr-10`; ordinary text fields are unchanged. No handlers, APIs or business state changed.

GREEN command: the same **unfiltered** `node tests/e2e/yanwu-public.mjs`; exit **0**, `PASS: Yanwu public pages; 20 baseline records and seven widths.` Fresh manifest/verification replace previous success evidence. The suite now has **60 records / 20 baselines**: four new supplementary images (`05-320-form-action.png`, `02-login-long-password.png`, `03-register-long-password.png`, `02-reset-long-password.png`) in `D:/WorkSpace/王者演武堂/test-results/yanwu-public/`. All four were actually opened and visually inspected, as was refreshed `05-mobile.png`. Earlier 56-record totals above describe the pre-review run, not this refreshed result.

Final fix-only checks: `npm run typecheck` with explicit Node26 PATH exited **0** (`tsc --noEmit`); `git diff --check` exited **0** (only normal LF/CRLF notices). Architecture/core/lint were not rerun because this round is confined to the two reviewed display corrections and their browser assertions; the previous results remain separately documented. Existing native-TS package notice remains visible. Scope: AuthForm.tsx, HeroGrid.tsx, yanwu-public.css, yanwu-public.mjs and this report only. Parent plan and unrelated files remain excluded.
