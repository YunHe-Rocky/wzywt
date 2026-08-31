# 王者演武堂全项目人因优化计划

## Goal

在保持现有产品主题、业务流程、架构边界和数据兼容性的前提下，重点优化最新加入的比赛归档、战报/视频、战术板与资源监控功能，并系统修复全项目的人因工程、移动触控、无障碍、响应式、反馈与容错问题。

## Interpretation

- 将用户所说的“人体规范”解释为人因/人机工程与无障碍规范。
- 优先级依次为：可完成任务、可读/可触达、错误恢复、移动端适配、视觉一致性、性能感知。
- 不做与问题无关的品牌重设计，不把复杂业务逻辑移入 `src/app` 或 `src/web`。

## Constraints

- 服从 `docs/code-architecture.md` 的 `app/web -> features -> core/lib` 依赖方向。
- 保留工作区内全部用户改动；不覆盖已完成的 V2.1/V2.2 计划。
- 触控目标原则上不小于 44x44 CSS px，相邻目标保持可避免误触的间距。
- 正文移动端原则上不小于 16px；交互不能只依赖 hover、颜色或精确手势。
- 表单必须有可见标签、就近错误、异步状态和可恢复路径；弹层必须可关闭、可键盘操作并管理焦点。
- 动效遵循 150-300ms 的功能性反馈并支持 `prefers-reduced-motion`。

## Phases

- [completed] Phase 1：恢复上下文，完整读取架构/设计系统，盘点 Git 与最新功能入口
- [completed] Phase 2：运行 UI/UX 设计系统查询并建立人因审计基线
- [completed] Phase 3：浏览器审计桌面、375px 手机、横屏、键盘、焦点、控制台与关键任务流
- [completed] Phase 4：优先修复最新功能的高风险人因、无障碍与响应式问题
- [completed] Phase 5：统一全项目公共组件、布局、表单、弹层、状态反馈与 reduced-motion
- [completed] Phase 6：补充回归测试并运行 architecture/typecheck/core/domain/lint/build
- [completed] Phase 7：重新进行 production 浏览器验收，记录未覆盖范围与残余风险

## Acceptance Criteria

- 最新功能在桌面、375px 竖屏与常见横屏尺寸上无页面级横向溢出，核心内容不被固定导航遮挡。
- 关键交互可通过键盘完成；焦点可见，弹层有可靠退出路径，图标按钮具有可访问名称。
- 主要触控目标达到 44x44 CSS px 或具有等效命中区域，不出现仅 hover 可发现的关键动作。
- 异步提交有 pending/disabled/success/error 反馈，错误信息说明原因与恢复动作。
- 颜色不是状态唯一载体，正文与控件对比度达到 WCAG AA 的合理目标。
- reduced-motion 下不依赖大幅动画完成任务；页面缩放与文本放大不被禁用。
- 架构、类型、核心/领域测试、lint、production build 与新增 UI 回归均给出新鲜 PASS/FAIL 证据。

## Errors Encountered

| Error | Attempt | Resolution |
|---|---:|---|
| Managed sandbox helper could not apply deny-read ACLs on the Chinese workspace path | 1 | Used narrowly scoped elevated read commands for skill/context inspection; no unrelated files or processes were touched |
| The first multi-file apply_patch could not read the existing active-plan pointer | 1 | Retried new planning files separately before changing the pointer |
| PowerShell batch invocation stripped the multi-line apply_patch argument twice | 2 | Invoked the same apply_patch backend through ProcessStartInfo.ArgumentList, preserving the patch exactly |
| Webapp skill Python runtime has no `playwright` module | 1 | Use the repository's pinned Node Playwright and existing Chrome-based harness without installing new dependencies |
| Baseline audit timed out after opening the authenticated Header menu | 2 | Root cause was a role/name locator invalidated when the label changed from open to close; switched to a stable aria-label suffix selector |
| Image viewer could not read screenshots under the Chinese workspace path | 1 | Copied only the selected read-only artifacts to the approved ASCII visualization directory for inspection |
| Image viewer also failed on the approved ASCII visualization copy | 2 | Continue with Playwright DOM/computed-style evidence and retain screenshots for user inspection; do not claim model-side visual QA |
| Second helper-run audit timed out waiting 60s for the first dynamic page | 1 | Switch to an observable PTY dev server, inspect compile output, then run the audit against the confirmed-ready process |
| Windows helper reported the server stopped but port 8001 remained owned by PID 25940 | 1 | Verified the 10:29 test-owned cmd/Next/start-server ancestry, stopped only the matching Next parent, and confirmed port 8001 free |
| Planning update contained an empty findings hunk and apply_patch rejected it | 1 | Removed the empty hunk and recorded findings with real added lines in the retry |
| A CSS patch listed adjacent hunks out of source order and apply_patch could not find the second line | 1 | Reordered hunks to match the file and retried without changing scope |
| First formal human-factors E2E sampled dialog initial focus after a fixed 50ms and failed while Escape/focus-return passed | 1 | Replaced the timing assumption with a bounded 1s wait for the actual cancel-button focus; the assertion remains strict |
| Bounded focus wait failed again, proving the dialog implementation never focused cancel on first portal mount | 2 | Root cause: ConfirmDialog effect ran before newly mounted FeaturePortal content had refs; keep the portal mounted while closed and toggle only its children |
| Production build rejected `for (const module ...)` in the monitor hook under Next's no-assign-module-variable rule | 1 | Rename the local loop binding to `moduleName`; keep the rule enabled and rerun the full build |
| Production E2E sampled focus return immediately after the dialog became hidden, before its requestAnimationFrame cleanup | 1 | Use the same strict bounded wait for the trigger to become active; do not mark pass unless focus is actually restored |
