# 王者演武堂 UI 系统 V2.2.1

本文记录当前实现，而不是历史主题方案。视觉、布局和交互改动必须同时服从本文件与 `docs/code-architecture.md`；发生冲突时，以架构文档为准。

## 1. 当前架构

```text
ThemeProvider（固定 data-theme="yanwu"）
  └─ ThemeLayout
      ├─ 全屏路由：main-content--fullscreen
      └─ 标准路由：Header → main-content/page-shell → Dock
```

- 当前只有一个启用主题：`yanwu`。不得依据 URL hash 切换或恢复历史双主题。
- `ThemeLayout` 只负责全屏/标准布局分流；`/login`、`/register`、`/admin`、`/debug` 为全屏路由。
- `Header`、`Dock` 和页面内容共用语义层级 token：`--layer-sticky`、`--layer-dock`、`--layer-overlay`、`--layer-modal`、`--layer-popover`、`--layer-toast`。
- 页面 UI 位于 `src/web`，请求与客户端状态位于 `src/features/*/client`，`src/app` 只做路由适配。

## 2. 人因与无障碍基线

- 所有主要按钮、导航、菜单项、表单控件和图标操作的命中区至少为 44×44 CSS px。
- 移动输入字号至少 16px，避免聚焦时页面缩放；操作标签和表头原则上不低于 12px。
- 键盘焦点必须可见；不能只用 hover、颜色或精确拖动表达关键操作。
- 状态颜色必须同时配套文字，例如“连接已断开”“检查失败”“已释放”。
- 表单使用可见 `label`，异步动作提供 pending/disabled、成功、失败原因和恢复路径。
- 危险或不可逆动作必须确认；对话框支持初始安全焦点、Tab 圈闭、Escape、忙碌期保护和关闭后焦点返回。
- `prefers-reduced-motion: reduce` 下禁用装饰动画和大幅过渡，功能不能依赖动画完成。
- 不在 `html/body/main` 隐藏或裁剪横向溢出。宽表、时间轴等由明确、可聚焦、带说明的局部滚动区域承载。

## 3. 布局系统

### Header

| 项目 | 桌面 | 手机 |
|---|---:|---:|
| 高度 | 52px | 48px |
| 品牌 | 王者演武堂 + 版本号 | 同桌面，保留可读字号 |
| 主导航 | 赛事、登录后演武动态 | 窄屏隐藏“赛事”，保留演武动态 |
| 用户入口 | 至少 44×44px | 至少 44×44px |
| 用户菜单 | 点外部或 Escape 关闭，焦点返回触发按钮 | 同桌面 |

### Dock

- 一级导航：首页、赛事、图鉴、我的；图鉴二级导航：英雄、装备。
- `nav` 使用“底部导航”可访问名称，当前项使用 `aria-current="page"`。
- 图鉴按钮使用 `aria-expanded` 与 `aria-controls`；二级菜单关闭时不进入 Tab 顺序。
- 导航目标至少 44×44px；Dock 自身包含 `safe-area-inset-bottom`，页面同时预留底部 clearance。
- 路由预取和 pending 反馈不得阻止键盘与 reduced-motion 用户完成导航。

### 页面壳

- `main-content` 是唯一全局横向 gutter 和底部 Dock clearance 所有者；`/m` layout 不再重复添加 padding。
- 页面使用 `page-shell`，按内容选择 `page-shell--narrow`（720px）、`--medium`（960px）或 `--wide`（1200px）。
- 全屏画布使用 `main-content--fullscreen`，自行管理内部留白。
- 最低回归视口：375×812 手机、812×375 横屏、1440×900 桌面。

## 4. 视觉 token

| Token | 当前值/语义 |
|---|---|
| `--bg-root` | `#efeff2`，页面底色 |
| `--bg-card` / `--bg-card-glass` | 半透明白色卡片 |
| `--bg-input` | 输入与内嵌面板背景 |
| `--text` | `#111111`，主要文字；禁止使用未定义的 `--text-primary` |
| `--text-secondary` | `#444444`，次要文字 |
| `--text-muted` | `#777777`，非关键元数据 |
| `--gold` | `#4488f0`，主要强调色（历史命名保留） |
| `--red` | 危险、失败 |
| `--green` | 成功、健康 |
| `--radius-sm/radius/radius-lg` | 14/16/20px |
| `--layout-gutter` | `clamp(16px, 3vw, 32px)` |
| `--layout-bottom-clearance` | Dock 高度 + 底部安全区 |

正文颜色只使用已定义 token。对比度目标为 WCAG AA：普通文本至少 4.5:1，大字至少 3:1。

## 5. 通用组件

### 按钮与焦点

- `.btn-primary`：主操作；`.btn-danger`：危险操作；`.btn-ghost`：次级边框操作；`.btn-subtle`：低强调操作。
- 四类按钮统一最小高度 44px；disabled 必须同时降低视觉强调并禁止重复提交。
- 链接、按钮、表单、`summary`、tab 和可聚焦滚动区统一使用 `:focus-visible` 焦点环。

### 对话框

| 组件 | 角色 | 关键行为 |
|---|---|---|
| `ConfirmDialog` | `alertdialog` | 默认聚焦取消、Tab 圈闭、Escape、焦点返回、busy 保护 |
| `SecurityQuestionModal` | `dialog` | 可见标签、首字段焦点、Tab 圈闭、请求失败恢复 |
| `DeleteAccountModal` | `alertdialog` | 双重确认、可见标签、Tab 圈闭、Escape、失败不误报删除 |
| `CalendarModal` | `dialog` | 日期/时间键盘操作与移动端滚动面板 |

`.modal-card` 必须限制为视口可见高度并允许内部纵向滚动，不能让操作按钮落到屏幕外。

### Toast

- 成功/加载使用 `role="status"`，错误使用 `role="alert"`。
- Toast 自动消失，同时提供至少 44px 的“关闭提示”按钮；计时器在 Provider 卸载时清理。
- 正文使用 `--text`，移动端左右各保留 12px 安全空间。

### 表格

- 表格必须有 `caption`、`th scope`，宽表外层使用可聚焦 region 和移动滑动说明。
- 禁止表格与外层容器同时横向滚动；新功能表格固定由 `.match-result-table-wrap`、`.tactic-resource-table-wrap` 或 `.data-table-wrap` 承载。
- sticky 表头/首列不能遮住键盘焦点或造成页面级横向溢出。

## 6. 最新功能约束

### 比赛归档与复核

- 六类数据 tab 使用 roving tabindex，支持方向键、Home/End，并通过 `aria-controls` 关联 tabpanel。
- OCR/比赛/一致性状态显示中文可读文字；比分和十人数据仍由服务端再次核验。
- 异议与超管纠错字段使用可见标签；“正式提交并锁定”必须经过 `ConfirmDialog`。
- 结果宽表保留为局部横向滚动，不压缩成无法比较的卡片。

### 演武动态

- 发布、点赞、评论、审核和删除统一防重复提交并提供失败恢复。
- 动态和评论永久删除必须确认；点赞按钮使用 `aria-pressed`。
- 视频播放器允许原生控制，正文和评论保留换行语义。

### 战术板

- SVG 拖动/点按之外，必须保留精确坐标输入这一键盘替代路径，并用说明文字与画布关联。
- 阶段、工具与跟随状态使用 `aria-current`/`aria-pressed` 和文字，不只用颜色。
- 图层、路线和点位删除必须确认；资源计时、预设、summary、工具栏操作均满足 44px 命中区。
- 资源宽表是局部滚动内容；地图图片超出 SVG viewBox 的裁切属于画布设计，不等于页面溢出。

### 资源监控

- `src/app/monitor/page.tsx` 保持薄适配；Web 视图在 `src/web/MonitorDashboard.tsx`，SSE/轮询/资源租约在 `src/features/monitor/client`。
- 连接、检查和资源生命周期状态使用中文文字；轮询或权限失败显示原因与刷新/登录恢复建议。
- 资源表和日志均为可聚焦滚动区域；日志使用 `role="log"` 和增量播报。

## 7. 动效

功能性动效建议 150–300ms。全局 reduced-motion 规则将动画/过渡压到 0.001ms，并隐藏背景光球、禁用 stagger 和 skeleton 动画。任何新增动效都必须在该模式下保持完整任务能力。

## 8. 验证

```bash
npm run check:architecture
npm run typecheck
npm run test:core
npm run lint
npm run build
```

启动端口 8001 后运行无数据库写入的人因回归：

```bash
npm run test:e2e:human-factors
```

该回归覆盖手机/桌面的比赛、战术、动态与监控页面，断言 document 无横向溢出、可见控件至少 44px、字段有标签、焦点可见、reduced-motion 生效，并检查比赛 tab、Header 和确认弹窗键盘流程。

数据库写入型 E2E 只能针对明确的隔离数据库运行，不得把生产或未知 `DATABASE_URL` 当测试库。

## 9. 关键文件

| 文件 | 作用 |
|---|---|
| `src/app/globals.css` | token、布局、人因基线、响应式与新功能样式 |
| `src/app/layout.tsx` | 根 metadata 与 Provider |
| `src/web/themes/ThemeProvider.tsx` | 固定 `yanwu` 主题 |
| `src/web/components/layout/ThemeLayout.tsx` | 全屏/标准布局分流 |
| `src/web/components/layout/Header.tsx` | 主导航和用户菜单 |
| `src/web/components/layout/alternate/Dock.tsx` | 底部与二级导航 |
| `src/web/components/ui/ConfirmDialog.tsx` | 通用危险操作确认 |
| `src/web/components/ui/Toast.tsx` | 全局状态反馈 |
| `src/web/MatchWorkspace.tsx` | 比赛数据复核 |
| `src/web/TacticBoard.tsx` | 战术时钟、阶段与标注 |
| `src/web/CombatWall.tsx` / `CombatPostDetail.tsx` | 演武动态 |
| `src/web/MonitorDashboard.tsx` | 监控视图 |
| `tests/e2e/human-factors-regression.mjs` | 无数据库写入的人因回归 |

## 10. 版本记录

| 版本 | 日期 | 主要变更 |
|---|---|---|
| V2.0.1 | 2026-07-24 | 基础 ARIA、reduced-motion、响应式页面壳 |
| V2.1 | 2026-08 | 比赛归档、演武动态、战术板 |
| V2.2 | 2026-08 | 动态资源调度与监控 |
| V2.2.1 | 2026-08-31 | 单主题文档纠偏、44px 基线、键盘/弹窗/错误恢复和正式人因回归 |

新增主题属于产品与设计系统变更，必须先更新 `ThemeProvider`、token、布局矩阵和完整回归，不再通过 hash 临时启用。
