# Findings

## 2026-08-31 baseline

- 用户要求全项目再次优化，尤其关注最新功能；“人体规范”按人因/人机工程与无障碍规范执行。
- 已完成的历史计划包括 V2.1 全面重构、新增比赛归档/战报/战术板，以及 V2.2 动态资源调度；本轮不重写历史计划。
- 历史证据只用于定位高风险入口，不视为当前验收；必须重新运行浏览器与构建验证。
- UI/UX 基线：普通文本对比度目标 4.5:1；触控目标至少 44x44；移动正文 16px；交互不可依赖 hover/颜色；表单需可见标签、就近错误和恢复路径；支持键盘、焦点与 reduced-motion。
- 已知最新 UI 重点：比赛结果响应式表格、截图证据渐进披露、战术地图时钟/阶段/绘制流程、战报视频、资源监控状态。
- 当前 `main` 与 `origin/main` 对齐；本轮开始前除规划指针和新规划目录外没有其他 dirty 改动。
- 权威架构确认 Web 层不得直接 `fetch()`，视觉/交互留在 `src/web`，业务状态与 API 封装留在 `src/features`；弹层层级必须使用语义 `--layer-*` token。
- 最新三个产品提交依次集中于：比赛归档/战报/战术板（`46721b3`）、V2.2 资源调度监控（`4cd7714`）、战术板成员隐私与同阵营配色（`59e83b4`，提交标题误写 Navo 但实际改动属于本项目）。
- 全站样式主要集中在 `src/app/globals.css`；最新业务 UI 主要为 `MatchArchivePanel.tsx`、`MatchWorkspace.tsx`、`CombatWall.tsx`、`CombatPostDetail.tsx`、`TacticBoard.tsx` 与 `/monitor`。
- 现有浏览器回归覆盖较多，但本轮仍需重新检查公共组件和新功能的键盘/焦点/触控尺寸/文本缩放/reduced-motion，而不只检查无溢出和 console error。
- `docs/ui-system.md` 记录的响应式基线与当前实现有漂移：文档称页面根级横向 padding 只由 `main-content` 提供，但 `/m` layout 又加了 `px-3 pt-3`；需在浏览器中确认是否造成重复 gutter。
- 根布局在 `html/body` 上强制 `overflow-x: hidden`，这会掩盖页面级溢出来源；验收脚本应检测 `scrollWidth` 与越界元素，而不能只看是否出现滚动条。
- 全局输入默认 `font-size: 14px`，iOS/移动端可能触发聚焦缩放，也低于本轮 16px 人因基线；现有大量 8-13px 辅助文案和 28-40px 控件需按语义逐项分类，不能机械全局放大。
- UI 系统文档仍描述双主题/hash 切换，但当前 `ThemeProvider` 固定 `yanwu`；这属于文档/实现漂移，不在未确认产品意图前恢复旧主题。
- 本地设计系统查询把“游戏”机械匹配为高拟真 3D，并明确标注性能差、可访问性不足；本轮拒绝该风格建议，保留现有演武主题，采用其可用的人因检查项（对比度、焦点、reduced-motion、375/768/1024/1440 响应式）。

## 2026-08-31 latest-feature source audit, first pass

- `MatchArchivePanel` 的胜方侧标为 `aria-hidden`，但状态/比分有文字，因此没有只靠颜色；不过服务器枚举值直接展示为英文，需统一为中文可理解状态。
- `MatchWorkspace` 的数据分类用了 `role=tablist/tab`，但缺少 roving tabindex、方向键切换和 `aria-controls` 关系；当前每个 tab 都进入 Tab 顺序，语义不完整。
- 比赛结果表用独立可聚焦横向滚动 region、caption、表头与移动提示，基础方向正确；需要浏览器确认 200% 文本缩放、焦点可见和 sticky 单元格不会遮挡。
- 新功能多个异步动作共用一个 `busy` 字符串，能避免一部分重复提交，但需确认所有按钮、文件上传与编辑状态都在进行中一致禁用，并在错误/抛出时恢复。
- 战术板为拖动/点击 SVG，同时提供“精确坐标”键盘替代路径；但 SVG 本身不可聚焦，工具说明没有显式关联，路线键盘替代仍较隐蔽。
- 战术板删除图层、路线、点位均立即执行，没有确认或撤销；其中删除图层是高影响操作，应增加明确确认，路线/点位至少提供确认或可恢复反馈。
- 战术板阶段、工具和跟随状态已有 `aria-current`/`aria-pressed`，资源状态也包含文字，未只依赖颜色；但 `REVIEW OPEN`/`TEAM PRIVATE` 等英文状态应本地化。
- `details/summary` 用于渐进披露是合适方向，但其命中高度、焦点样式和移动端可发现性仍需 CSS/浏览器验证。
- 比赛档案的“数据异议”和“超管纠错”依赖 placeholder 充当字段说明，缺少可见 `label`/字段分组；评论输入也只有 placeholder，违反表单基线。
- “正式提交并锁定”、动态永久删除、图层删除和评论删除均为高影响/不可逆动作，但当前没有确认或撤销。优先给永久提交、动态删除和图层删除增加确认；短内容删除也应至少确认。
- Combat 点赞、审核、删除、评论删除没有统一 pending 防重；网络较慢时可以重复触发。评论提交有 busy，但点赞/管理操作没有。
- `/monitor` 是最新 V2.2 功能，但大量 React 视图和请求逻辑直接写在 `src/app/monitor/page.tsx`，与“app 只做路由适配、web 负责渲染、feature client 封装 HTTP”的权威架构不一致。
- 监控页使用大量 11-13px 内联字号、720px 表格和颜色化英文状态；资源表没有 caption/独立可聚焦滚动 region，轮询失败被静默吞掉，空资源和无权限状态也缺少清晰恢复提示。
- Header 主导航最小高度约 36px、登录入口 36x36、用户菜单按钮约 28-32px；Dock 主/子入口均为 40x40，均低于 44px 触控基线。Dock 标签为 9px，Header 品牌/版本为 10-11px，移动可读性不足。
- Header 用户菜单没有 Escape 关闭、焦点回收或显式菜单关联；鼠标点外部关闭存在，但键盘流程不完整。
- Dock 容器不是语义 `nav`，二级菜单按钮缺少 `aria-controls`，底部 padding 没有直接包含 safe-area inset；虽有主内容 clearance，Dock 自身仍可能贴近手势区。
- Toast 已用 `aria-live`/`role=alert|status`，但正文颜色引用未定义的 `--text-primary`，错误自动消失且没有手动关闭；移动端固定 top/right 也需确认不与 Header/系统区域冲突。
- 补充 UX 查询把“不可逆动作确认、44x44、8px 间距、可见焦点、移动键盘、异步按钮防重”列为高优先级；Next.js 查询也要求把 Client Component 下推，进一步支持把 `/monitor` 页面抽成 Web 叶组件。
- 全局移动端已有 `input/select/textarea { font-size: 16px }`，因此“移动输入自动缩放”已被覆盖；真正问题是桌面和通用按钮命中高度仍不足，不能把输入字号风险误报为当前移动缺陷。
- 通用 `.btn-primary/.btn-danger` 只有 10px 纵向 padding，`.btn-subtle` 只有 6px；大量链接/按钮实际不足 44px。新功能虽对部分按钮单独补到 44px，但 `.text-action` 36px、战术播放 42px、预设 36px、summary 38px、资源表按钮 30px、toolbar 42px 仍不达标。
- 最新 CSS 中 `.match-result-table` 与 Toast 都引用未定义的 `--text-primary`；需要统一回现有 `--text` token，避免浏览器回退到不可控继承色。
- 现有 CSS 只有少量组件显式 `:focus-visible`，通用按钮、链接、Dock、Header 菜单没有统一焦点环；这比 hover 细节优先级更高。
- 移动端全局 `table { display:block; overflow-x:auto }` 与新功能自己的滚动 wrapper 叠加，可能形成双层滚动；应改为由显式表格容器负责，而不是全局改变所有表格布局。
- `html/body overflow-x:hidden` 加 `main-content overflow-x:clip` 会把越界内容裁掉而非帮助用户访问；实现修复后至少应移除 main 的裁剪并用回归脚本定位任何真正越界。
- Webapp skill 所在 Python 环境未安装 Playwright；仓库已固定 Node Playwright 1.61.1，并有成熟的本机 Chrome 回归脚本，因此本轮使用 Node API 作为兼容替代，仍遵循 network-idle、DOM reconnaissance、console/page error 和截图流程。
- 既有 `next-stage-regression.mjs` 会在当前 `DATABASE_URL` 指向的数据库创建/删除大量 fixture；在未确认是隔离库前不直接运行。先使用浏览器路由 fixture 做无写入的人因审计，数据库链路留给安全的隔离环境验证。
- 既有新功能 E2E 主要验证业务链、无页面横向溢出和控制台；没有验证 44px 命中尺寸、焦点顺序、Escape/确认对话框、200% 文本缩放或 reduced-motion，正是本轮需要补足的覆盖。

## 2026-08-31 browser baseline summary

- 真实 Chrome + API fixture + reduced-motion 已完成 5 个移动页面、3 个桌面页面和 2 个键盘探针；控制台/page errors 为 0，所有可见控件都有可访问名称，当前焦点样式探针未发现完全无指示的控件，reduced-motion 下残余长动效为 0。
- 手机触控不足 44px：比赛页 19/129、战术板 33/41、战报列表 12/18、战报详情 14/16、监控 9/10；桌面尺寸统计也显示通用控件高度普遍偏小，但触控优先处理移动端。
- 比赛页有 2 个无可见/程序化标签字段，战报详情有 1 个，和源码审计的异议/评论 placeholder-only 问题一致。
- 比赛数据 tab 按 ArrowRight 后焦点未移动；Header 用户菜单按 Escape 后仍保持打开，均为可复现键盘缺陷。
- 手机比赛/战术/监控报告存在越界元素，但比赛宽表和战术资源表可能是显式内部横向滚动的合理结果；需按明细区分容器内滚动与被 `overflow-x:clip` 隐藏的真正页面越界。
- 手机/桌面多页存在大量小于 12px 的可见文字，尤其 Dock、战术资源状态、表头/标签和监控表；需提升操作标签与正文，保留少量非关键技术元数据时也要确保对比度和可放大性。
- 明细确认手机比赛的越界项全部来自可聚焦结果表当前横向滚动位置，战术/监控主要来自显式 720px 内部表格；战术 SVG `<image>` 的负 left 是画布裁切设计。是否存在页面级越界应以 document scrollWidth 为准，不把这些内部内容误修成卡片堆叠。
- Header `yanwu` 覆盖把实际高度压到桌面 34px/手机 32px，是用户菜单 28px、主导航 36px的直接原因；需一起提升 Header 高度和内部命中区，不能只放大按钮造成溢出。
- 既有 `SecurityQuestionModal` 已有 Escape、焦点陷阱和首焦点实现，可抽取为通用 `ConfirmDialog` 模式；`DeleteAccountModal` 反而缺少 role/aria-modal/Escape/焦点管理且 label 未关联，属于全站高风险账户流程，适合一并修复。
- 实施优先级已收敛为：公共 44px/焦点/Header/Dock/Toast -> 新功能表单标签/tab 键盘/状态本地化/不可逆确认 -> 战术板命中区与键盘替代说明 -> V2.2 monitor 抽离到 feature client hook + web 叶组件。

## 2026-08-31 implementation checkpoint

- `/monitor` 现由 `src/app/monitor/page.tsx` 薄适配到 `src/web/MonitorDashboard.tsx`，HTTP/SSE/轮询与资源租约位于 `src/features/monitor/client`；新鲜架构检查确认依赖边界有效。
- 最新功能的不可逆提交/删除统一使用 `ConfirmDialog`，其支持初始取消焦点、Tab 圈闭、Escape、忙碌期保护和关闭后焦点返回；用 ref 稳定回调，避免父组件内联函数导致 effect 反复聚焦。
- 根 `html/body`、移动 layout 和 `main-content` 的横向隐藏/裁剪已移除；`/m` 不再重复注入 gutter，显式宽表仍由其局部可聚焦 region 承载。
- 全局按钮、Header、Dock 和战术板操作面统一到至少 44px；Header 从 34/32px 修正为 52/48px，Dock 自身加入 `safe-area-inset-bottom`。
- 账号注销与改密弹窗已补齐可见关联标签、dialog 语义、焦点管理、Escape、失败恢复和 pending 防重；Toast 改用现有 `--text` token 并增加 44px 手动关闭按钮。
- 监控表与日志提供 caption、独立可聚焦滚动区域、中文资源状态/作用域及非颜色状态文本；轮询/租约错误给出就近恢复说明。
- 修复后基线相较修复前：手机比赛 undersized 19→0、战术 33→0、动态列表 12→0、动态详情 14→0、监控 9→0；无标签字段比赛 2→0、动态详情 1→0；比赛 tab 与 Header Escape 从 false→true。
- 新增正式回归只把 document 宽度作为页面级溢出判据；宽表/SVG viewBox 内部超出仍可出现在元素明细中，但局部 region 可聚焦、可滚动且 document 不溢出。
- production 模式与开发模式均暴露过焦点时序差异；最终断言使用 1 秒有界等待真实 activeElement，而非固定 sleep 或强制 focus，因此仍会在实现未完成焦点迁移时失败。
- 共享 `apiRequest` 会在 TIMEOUT/NETWORK/INVALID_RESPONSE 时抛异常；只在成功/失败响应后手动 `setBusy(false)` 不足以恢复 UI，最新功能所有关键写动作必须使用 `finally`。
