# 王者演武堂 UI 系统 · 峡谷之夜

本文记录 2026-09-06 前端改版后的实现。视觉资料可随产品需求调整，代码分层以 `docs/architecture/code-architecture.md` 为准。

## 1. 当前架构

```text
ThemeProvider（固定 data-theme="yanwu"）
  └─ ThemeLayout
      ├─ 全屏路由：main-content--fullscreen
      └─ 标准路由：ArenaIntro + Header → main-content/page-shell → 移动 Dock
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
| 高度 | 80px | 64–66px |
| 品牌 | 金色盾剑徽记 + 王者演武堂 | 同桌面，紧凑排列 |
| 主导航 | 首页、赛事、英雄、装备、我的；登录后演武动态 | 900px 以下使用底部 Dock；登录后演武动态保留在头像菜单 |
| 用户入口 | 至少 44×44px | 至少 44×44px |
| 用户菜单 | 点外部或 Escape 关闭，焦点返回触发按钮 | 同桌面 |

### Dock

- 仅在宽度 ≤900px 显示。一级导航：首页、赛事、图鉴、我的；图鉴二级导航：英雄、装备。
- `nav` 使用“底部导航”可访问名称，当前项使用 `aria-current="page"`。
- 图鉴按钮使用 `aria-expanded` 与 `aria-controls`；二级菜单关闭时不进入 Tab 顺序。
- 导航目标至少 44×44px；Dock 自身包含 `safe-area-inset-bottom`，页面同时预留底部 clearance。
- 路由预取和 pending 反馈不得阻止键盘与 reduced-motion 用户完成导航。

### 页面壳

- `main-content` 是唯一全局横向 gutter 和底部 Dock clearance 所有者；`/m` layout 不再重复添加 padding。
- 页面使用 `page-shell`，按内容选择 `page-shell--narrow`（720px）、`--medium`（1100px）或 `--wide`（1280px）。
- 全屏画布使用 `main-content--fullscreen`，自行管理内部留白。
- 验证视口：375×812、390×844、768×1024、812×375、1024×768、1440×900。
- 手机 UA 自动中转 `/m` 对应路由，桌面访问 `/m/*` 自动返回标准路由；保留查询参数，静态资源不参与中转。改变窗口宽度时，CSS 立即切换适合的界面，不要求刷新。

## 4. 视觉 token

| Token | 当前值/语义 |
|---|---|
| `--bg-root` | `#080f1b`，深夜蓝页面底色 |
| `--bg-card` / `--bg-card-glass` | `rgba(24,39,57,.58)` / `rgba(29,46,64,.58)` 半透明玻璃面板 |
| `--bg-input` | 输入与内嵌面板背景 |
| `--text` | `#f1f3f4`，主要文字；禁止使用未定义的 `--text-primary` |
| `--text-secondary` | `#c0cdd8`，次要文字 |
| `--text-muted` | `#99adbe`，非关键元数据 |
| `--gold` | `#dcc49a`，香槟金主要强调色 |
| `--red` | 危险、失败 |
| `--green` | 成功、健康 |
| `--radius-sm/radius/radius-lg` | 12/20/26px |
| `--layout-gutter` | 桌面 `clamp(20px, 4vw, 64px)`；手机 18px |
| `--layout-bottom-clearance` | 手机 Dock 高度 + 底部安全区；桌面 36px |

正文颜色只使用已定义 token。对比度目标为 WCAG AA：普通文本至少 4.5:1，大字至少 3:1。

### 首页构图

- 首屏左侧为标题、行动入口与简短说明，右侧为连续峡谷的高地局部，李白站在地图边缘围墙上；不是整张地图的鸟瞰展示。
- 主视觉地图放大，以敌方一塔附近城墙上的人物为取景锚点，人物位于右下方；清晰范围延伸至中路，其余地图渐隐，整张地图外沿不入镜。手机将图像移到上部并靠右裁切，正文与按钮独立排在下部。
- 下方依次为产品能力、公开房间、英雄/装备入口、公告/资讯，所有数据继续走功能层资源调度。
- 公开房间卡片展示人数与加入入口；未登录进入赛事大厅展示登录引导，不申请私有资源租约。
- 本地背景 `public/art/arena.webp` 约 124 KiB，来源和复现说明见同目录 README。

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
- 桌面端保留单一语义表以便双方横向比较；窄屏在同一张表上自适应为逐选手记录网格，不复制数据，也不要求页面或面板横向滚动。

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

- 用户指定恢复原来的玻璃光影与细腻动效：`arena-glass.css` 提供半透明材质、柔和边缘高光与景深；首页、导航、图鉴、赛事和登录页使用同一组材质 token。
- `BackgroundOrbs` 以 CSS 渐变营造低亮度环境光，不读取陀螺仪、不请求设备权限；移动端减少光层，页面隐藏时暂停漂移。
- `CursorLighting` 仅给鼠标所在的卡片写入局部光点坐标；不覆盖组件 transform/box-shadow，不扫描所有卡片，不运行常驻动画循环。滚动、离开窗口、尺寸变化和动态减少动效偏好都会清理光点。
- 手机 Dock 的玻璃选择背景随当前路由、待跳转目标和图鉴展开状态滑动；星光开场、焦点和路由行为沿用现有逻辑。
- 页面淡入不保留 transform containing block，卡片模糊限制在已知展示表面；业务弹窗仍由 body Portal 承载。
- 页面文案使用简短的好友内战语气，保留明确的功能名称与错误恢复入口；减少重复英文标签和宣传口号。


- `ArenaIntro` 是网站实时 Canvas 动画：星点汇聚为盾剑徽记，标题浮现，再淡出首页；全程约 3.1 秒。
- 使用 sessionStorage 每个标签页首次访问标准页面播放一次；页脚提供“重播开场”，右上角可跳过，Escape 同样退出。
- 播放期间锁定背景交互与滚动，结束恢复原有状态及焦点；切到后台提前结束。移动端减少粒子数、限制像素比，卸载清理动画帧与监听器。
- 页面入场淡入上移，卡片悬浮、图标位移与微弱飘浮星点为页面增加层次；装饰不可阻挡点击。
- 功能性过渡一般 150–300ms。`prefers-reduced-motion` 下不播放开场、星点和大幅位移，所有入口仍可用。

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
npm run test:device-routing
npm run test:e2e:arena
```

该回归覆盖手机/桌面的比赛、战术、动态与监控页面，断言 document 无横向溢出、可见控件至少 44px、字段有标签、焦点可见、reduced-motion 生效，并检查比赛 tab、Header 和确认弹窗键盘流程。

数据库写入型 E2E 只能针对明确的隔离数据库运行，不得把生产或未知 `DATABASE_URL` 当测试库。

## 9. 关键文件

| 文件 | 作用 |
|---|---|
| `src/app/globals.css` | 功能布局、人因基线与业务组件样式 |
| `src/web/styles/arena.css` / `arena-motion.css` | 当前视觉 token、响应式主题及动效 |
| `src/web/components/home/HomePage.tsx` | 峡谷首页及资源消费 |
| `src/web/components/arena/ArenaIntro.tsx` | 星光汇聚开场、重播和生命周期管理 |
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
| 峡谷之夜 | 2026-09-06 | 深蓝金色主题、响应式导航、峡谷首屏、共用页面视觉与星光开场 |
| V2.2.1 | 2026-08-31 | 单主题文档纠偏、44px 基线、键盘/弹窗/错误恢复和正式人因回归 |

新增主题属于产品与设计系统变更，必须先更新 `ThemeProvider`、token、布局矩阵和完整回归，不再通过 hash 临时启用。
