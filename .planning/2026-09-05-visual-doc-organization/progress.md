# Progress

## 2026-09-05

- Loaded and followed `ui-ux-pro-max` and `planning-with-files` for this redesign and repository organization task.
- Inventoried the dirty worktree, root files, `docs/` tree, planning history and path references without altering existing product work.
- Ran the mandatory design-system search. Its generated glass/gaming direction was rejected as contextually inconsistent; retained the dense-dashboard, focus, contrast, responsive and reduced-motion constraints.
- Established a new isolated active plan so the legacy root planning files can later be filed under `.planning/`.
- Current focus: inspect the actual global tokens and match components, then implement the record-sheet hierarchy before moving documents.

- Rebuilt the match archive into a restrained tournament record sheet and removed the English eyebrow labels from the archive workflow.
- Added a non-scrolling 375px player-record layout while keeping one semantic table and all existing labels, draft persistence and business actions.
- Classified every documentation file and repaired live repository references; moved legacy root planning records under .planning/ without deleting history.
- Early git diff --check, TypeScript and Markdown renderer checks passed. Added explicit mobile no-horizontal-scroll and adaptive-row assertions; full validation is in progress.
- Final npm run check PASS, including architecture, typecheck, core, worker, auth, Markdown, next-stage, connection, scheduler, task-fence, API, draft, mobile-route and deployment coverage.
- Final production build PASS on Next.js 15.5.23 with 42 static pages; lint is 0 errors and 17 pre-existing no-img-element warnings.
- Final production-browser human-factors regression PASS at 375px and 1440px: no document overflow, undersized or unnamed controls, unlabeled fields, invisible focus, sub-12px text, residual reduced-motion animation or console errors.
- Browser regression now also asserts the mobile match panel has no internal horizontal overflow and that player rows use the adaptive grid. The first two runs correctly caught a 36px statistic input and 11px labels; both defects were fixed before acceptance.
- All local Markdown links resolve, no live old documentation paths remain, docs root contains only README.md, root Markdown is reduced to six conventional project files, git diff --check passes, and task-owned port 8017 is free.
- Visual inspection completed for the generated mobile and desktop match screenshots. Test artifacts remain under .cache/test-artifacts/human-factors-regression.
