# 王者演武堂 — UI 系统文档 V2.0.1

## 架构概览

```
                    ┌──────────────┐
                    │   URL hash   │
                    │  #1 / #2     │
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │ ThemeProvider │  → data-theme="yanwu" | 无 (默认 #2)
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │ ThemeLayout  │  → 全屏/非全屏路由分发
                    └──┬────────┬──┘
                       │        │
              ┌────────▼──┐  ┌──▼──────────┐
              │  Header    │  │  Dock       │
              │ (双主题)   │  │ (#2 常驻)   │
              └───────────┘  └──────────────┘
                           │
                      globals.css
                 (CSS变量 + 主题样式)
```

**核心原则**：两套主题共享同一个 Header 组件，通过 `data-theme` CSS 选择器隔离视觉样式。Dock 仅在 #2 主题显示。CSS 变量管颜色/圆角/阴影。

---

## 一、当前组件架构

```
src/web/components/layout/
  ThemeLayout.tsx          ← 路由分发：全屏路径 vs 标准布局
  Header.tsx               ← 单 Header 组件（双主题适配）
  BackgroundOrbs.tsx       ← 三颗动态光球（支持 prefers-reduced-motion）
  CursorLighting.tsx       ← 鼠标跟随效果
  PageEntrance.tsx         ← 页面入场动画包装器
  alternate/
    Dock.tsx               ← #2 专属底部导航
```

### ThemeLayout 路由逻辑

```tsx
const FULLSCREEN_PATHS = ["/login", "/register", "/admin", "/debug"];
// 全屏路径：无 Header/Dock，仅 main content
// 标准路径：LoginReveal + Header + main + Dock
```

### Header 组件

单文件 `Header.tsx`，同时适配两套主题。通过 `pathIsM` 判断移动端路由前缀，通过 `isMobile` (window.innerWidth ≤ 768) 判断移动端视口。

| 元素 | 通用 | #1 样式 | #2 样式 |
|------|------|---------|---------|
| 品牌名 | "王者演武堂" + 版本号 | 大字金色 | 小字灰色 |
| 导航链接 | 无（仅后台入口） | — | — |
| 用户头像 | 图片/首字母回退 | 蓝色底 | 蓝色底 |
| 登录入口 | `?` 圆按钮 | — | 36px 蓝色半透明 |
| 用户菜单 | 下拉（头像+修改密码+注销） | 暗色玻璃 | 白色毛玻璃 blur(28px) |

---

## 二、两套 UI 环境

### 演武 `#1` — 官网风格

| 层级 | 桌面 | 手机 |
|------|------|------|
| **Header** | 56px 全高，金线呼吸动画 | 44px，品牌名缩小 |
| **导航** | 无文字链接（功能入口在 Dock/页面内） | 同桌面 |
| **Dock** | 无 | 无 |
| **特色** | 暗金琉璃卡片、暖铜金强调色、6px 圆角 | 同桌面风格 |

### 厚玻璃 `#2` — 默认主题

| 层级 | 桌面 | 手机 |
|------|------|------|
| **Header** | 34px 紧凑，半透白毛玻璃 blur(10px) | 32px |
| **导航** | 底部 Dock | 底部 Dock |
| **Dock** | 显示（毛玻璃 blur(40px)） | 显示 |
| **特色** | 浅底蓝调、16px 大圆角、多层柔和阴影 | 同桌面 |

---

## 三、组件行为矩阵

### Header

| 条件 | #1 桌面 | #1 手机 | #2 桌面 | #2 手机 |
|------|---------|---------|---------|---------|
| 高度 | 56px | 44px | 34px | 32px |
| 金线动画 | ✓ | ✓ | ✗ | ✗ |
| 品牌字 | 大字金色 | 中字金色 | 小字灰色 | 小字灰色 |
| 版本号 | 金色边框标签 | 金色边框标签 | 金色边框标签 | 金色边框标签 |
| 登录按钮 | ? 蓝底图标 | ? 蓝底图标 | ? 蓝底图标 (36px) | ? 蓝底图标 (36px) |

### Dock

| 条件 | #1 | #2 |
|------|----|----|
| 桌面 | ✗ | ✓ |
| 手机 | ✗ | ✓ |
| 一级导航 | — | 首页 / 赛事 / 图鉴(二级弹出) / 我的 |
| 二级导航 | — | 英雄 / 装备（图鉴子菜单） |
| 样式 | — | 毛玻璃 blur(40px)，白底半透 |
| 无障碍 | — | 图鉴按钮 aria-label + aria-expanded，子菜单关闭时 tabIndex={-1} |

### 卡片 (.card)

| 属性 | #1 | #2 |
|------|----|----|
| 背景 | 渐变琉璃 | 45% 白底 + 毛玻璃 |
| 模糊 | 无 | blur(6px) 桌面 / blur(10px) 手机 |
| 圆角 | 6px | 16px |
| 阴影 | 内高光 + 外阴影 | 多层柔和阴影 + inset 高光 |
| 顶部边框 | `rgba(255,255,255,0.1)` | `rgba(255,255,255,0.7)` |
| hover | 边框变亮 | 上浮 1px + 蓝边 |

### 按钮

| 属性 | #1 | #2 |
|------|----|----|
| btn-primary 渐变 | 金色 `gold-light→gold→gold-dim` | 蓝色 `#66a4f8→#4488f0→#2563d8` |
| btn-primary 圆角 | 6px | 20px |
| btn-subtle | 透明 hover 亮底 | 透明 hover 暗底 |

---

## 四、弹窗系统

所有弹窗均支持无障碍特性：

| 弹窗 | 用途 | ARIA | 焦点管理 | Esc |
|------|------|------|----------|-----|
| SecurityQuestionModal | 修改密码 | role="dialog" + aria-modal | ✓ 自动聚焦 + 陷阱 | ✓ |
| DeleteAccountModal | 注销账户 | role="dialog" + aria-modal | — | — |
| CalendarModal | 日期时间选择 | role="dialog" + aria-modal | — | ✓ |
| AuthForm 忘记密码 | 找回密码 | role="dialog" + aria-modal | ✓ 自动聚焦 + 陷阱 | ✓ |
| Toast | 消息通知 | role="alert" | — | — |

### 弹窗样式

| 属性 | #1 | #2 |
|------|----|----|
| 背景 | `var(--bg-card)` 暗色 | `rgba(255,255,255,0.78)` + blur(20px) |
| 遮罩 | `rgba(0,0,0,0.5)` | `rgba(0,0,0,0.25)` + blur(4px) |
| 辉光 | 金色 radial | 蓝色 radial |
| 边框 | `var(--border-gold)` | 白色半透 `rgba(255,255,255,0.7)` |

---

## 五、移动端 /m 路由

`src/middleware.ts` — UA 检测移动设备 → 307 重定向到 `/m`：

```
用户手机访问 /heroes → 307 → /m/heroes
桌面访问 /heroes → 正常渲染
根路径 / → /m（不经过 /m/ 多余跳转）
```

`/m` 下所有页面通过 re-export 共享主路由的页面组件：
```ts
// src/app/m/me/page.tsx
export { default } from "@/app/me/page";
```

---

## 六、CSS 变量体系

所有视觉属性通过 CSS 变量定义，`:root` 为 #2 默认主题，`[data-theme="yanwu"]` 覆盖为 #1 暗色主题。

| 变量 | #1 值 | #2 值 | 用途 |
|------|-------|-------|------|
| `--bg-root` | `#161920` | `#efeff2` | 页面背景 |
| `--bg-nav` | `#1b1e27` | `rgba(255,255,255,0.5)` | 导航背景 |
| `--bg-card` | `#242833` | `rgba(255,255,255,0.45)` | 卡片背景 |
| `--bg-input` | `#2a2f3b` | `rgba(255,255,255,0.55)` | 输入框 |
| `--text` | `#e0e3ea` | `#111111` | 正文 |
| `--text-secondary` | `#b0b4be` | `#444444` | 次要文字 |
| `--text-muted` | `#777b88` | `#777777` | 弱化文字 |
| `--gold` | `#a89068` | `#4488f0` | 强调色 |
| `--gold-light` | `#c0b090` | `#66a4f8` | 亮强调 |
| `--gold-dim` | `#807050` | `#2563d8` | 暗强调 |
| `--radius-sm` | `6px` | `14px` | 小圆角 |
| `--radius` | `6px` | `16px` | 默认圆角 |
| `--radius-lg` | `8px` | `20px` | 大圆角 |
| `--red` | `#cc6666` | `#e05555` | 危险色 |
| `--blue` | `#6898cc` | `#4488f0` | 蓝色 |
| `--green` | `#78b878` | `#55b855` | 绿色 |

---

## 七、动画系统

| 动画 | 用途 | 关键帧 |
|------|------|--------|
| `stagger-item-in` | 列表错峰入场 | opacity + translateY，0.15s 间隔 |
| `page-enter-alt` | #2 页面切换 | translateY(20px) → 弹性回弹 → 归位 |
| `page-enter-yanwu` | #1 页面切换 | translateY(16px) → 归位 |
| `slide-up` | 下拉/弹窗入场 | translateY(12px) → 归位 |
| `toast-in/out` | Toast 滑入/滑出 | translateX(12px) ↔ 归位 |
| `shimmer` | 骨架屏闪烁 | background-position 左右循环 |
| `glow-pulse` | 金线呼吸 | opacity 0.5 ↔ 1 |
| `orb-float-1/2/3` | 光球漂移 | 大幅 translate + scale |
| `orb-breathe` | 光球呼吸 | brightness + saturate 循环 |
| `glass-burst` | 登录碎裂 | translate + rotate + opacity → 飞散 |
| `crack-line-in` | 裂纹扩散 | stroke-dashoffset → 0 |

### 无障碍

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.001ms !important;
    transition-duration: 0.001ms !important;
  }
  .bg-orbs-container { display: none; }
  .stagger-enter > * { opacity: 1; transform: none; animation: none; }
  .skeleton { animation: none; }
}
```

---

## 八、表单系统

### AuthForm — 登录/注册/忘记密码

| 功能 | 说明 |
|------|------|
| 表单语义 | 所有输入框有 id/name/autoComplete |
| 密码显隐 | EyeIcon 切换，aria-label 同步更新 |
| 安全问题 | 8 个预设 + 自定义问题选项 |
| 忘记密码 | 三步流程（用户名→安全答案→新密码），弹窗内完成 |
| 登录动画 | GlassShatter 碎裂过渡 |
| 错误处理 | 红色提示框 + 动画入场 |

### 其他表单

| 组件 | 无障碍特性 |
|------|------------|
| SecurityQuestionModal | id/name + autoComplete + 焦点管理 |
| CalendarModal | Portal 时间选择器 + 日期网格 |
| 装备筛选 | 按钮组切换 + 搜索输入 |

### 响应式布局基线（2026-07-24）

- `main-content` 只负责全局 gutter、底部 Dock/safe-area 空间；页面禁止再次声明根级横向 padding。
- 页面统一使用 `page-shell`，按内容选择 `page-shell--narrow`（720px）、`--medium`（960px）或 `--wide`（1200px）。
- 375px 手机、812×375 横屏、1440×900 桌面为最低回归矩阵；两套主题均不得产生页面级横向滚动。
- 长文目录桌面使用 sticky 侧栏，手机移到正文前并横向滚动；表格在手机端只允许表格容器内部横向滚动。
- 日期时间选择器桌面为日期/时间双栏，手机为可滚动底部面板；小时和分钟使用 44px 行高、中心选中带与「已选」标注的双滚轮，支持触控、鼠标滚轮和键盘方向键。
- Dock 主路由挂载后预取，按下时立即切换视觉状态并显示细进度条；所有图标链接提供 `aria-label`。
- 个人空间英雄选择请求完整英雄库后按当前分路过滤：主分路英雄优先，附属分路英雄随后，其余隐藏；手机使用大面板，桌面根据可用空间向上或向下展开。

---

## 九、关键文件索引

| 文件 | 说明 |
|------|------|
| `src/app/globals.css` | 全部 CSS 变量 + 双主题样式 + 动画关键帧 + reduced-motion (~1310行) |
| `src/app/layout.tsx` | 根布局 + metadata (含 icons/favicon) |
| `src/app/template.tsx` | 页面切换过渡 |
| `src/app/not-found.tsx` | 自定义 404 页面 |
| `src/web/components/layout/ThemeLayout.tsx` | 主题路由：全屏判断 + Header + Dock |
| `src/web/components/layout/Header.tsx` | 单 Header 组件（双主题 CSS 适配） |
| `src/web/components/layout/alternate/Dock.tsx` | 底部 Dock + 二级图鉴子菜单 |
| `src/web/components/layout/BackgroundOrbs.tsx` | 三颗动态光球 |
| `src/web/components/layout/CursorLighting.tsx` | 鼠标跟随光照 |
| `src/web/components/layout/PageEntrance.tsx` | 页面入场 stagger-enter 包装器 |
| `src/web/components/ui/Toast.tsx` | Toast 消息通知 |
| `src/web/components/ui/CalendarModal.tsx` | 响应式日期时间选择弹窗 |
| `src/web/themes/ThemeProvider.tsx` | Hash 切换 + hashchange 监听 |
| `tailwind.config.ts` | Tailwind token → CSS 变量映射 |

---

## 十、版本历史

| 版本 | 日期 | 主要变更 |
|------|------|----------|
| V1.0.0 | 2026-06-24 | 初始版本，双主题架构 |
| V1.0.1 | 2026-06-25 | 组件分离重构、命格系统、爬虫升级、/m 路由、Dock 常驻 |
| V2.0.0 | 2026-07-01 | 后台管理系统、个人空间升级、装备图鉴、英雄属性面板、头像上传 |
| V2.0.1 | 2026-07-24 | SEO 完善(robots/sitemap/favicon/404)、无障碍(ARIA/焦点/键盘)、prefers-reduced-motion、CLS 优化 |

---

## 十一、添加第三套主题

1. `globals.css` 加 `[data-theme="新主题"]` CSS 变量块
2. 需要不同布局时，在 `ThemeLayout` 加条件分支（可选自定义 Dock）
3. `ThemeProvider.tsx` 的 `HASH_THEME_MAP` 加 `"#3": "新主题"`
4. 更新 `tailwind.config.ts` 中对应的 token 映射
