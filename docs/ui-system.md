# 王者演武堂 — UI 系统文档 V1.0.1

## 架构概览

```
                    ┌──────────────┐
                    │   URL hash   │
                    │  #1 / #2     │
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │ ThemeProvider │  → data-theme="yanwu|alternate"
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │ ThemeLayout  │  → 根据 theme 选择组件
                    └──┬────────┬──┘
                       │        │
              ┌────────▼──┐  ┌──▼──────────┐
              │  yanwu/    │  │  alternate/  │
              │  Header    │  │  Header      │
              │  (无Dock)  │  │  Dock        │
              └───────────┘  └──────────────┘
                           │
                      globals.css
                 (CSS变量 + 主题样式)
```

**核心原则**：两个主题完全独立，各自有自己的组件文件，互不干扰。CSS 变量管颜色/圆角/阴影，组件文件管布局和交互。

---

## 一、组件分离架构（V1.0.1 重构）

```
src/components/layout/
  ThemeLayout.tsx          ← 决策点：根据 theme 选择 #1 或 #2 组件
  yanwu/
    Header.tsx             ← #1 专属 Header（全高金线+导航+汉堡，无Dock判断）
  alternate/
    Header.tsx             ← #2 专属 Header（紧凑蓝白+导航，无汉堡判断）
    Dock.tsx               ← #2 专属 Dock（毛玻璃导航，无主题判断）
```

**关键变化**：旧架构用 `ui-config.ts` 的 `if/else` 在一个 Header 里判断两种主题，导致条件交织、修 A 坏 B。新架构每个主题写死自己的组件，完全隔离。`ThemeLayout` 只做一件事：

```tsx
export function ThemeLayout({ children }) {
  const { theme } = useTheme();
  return (
    <>
      {theme === "alternate" ? <AlternateHeader /> : <YanwuHeader />}
      <main className="main-content">{children}</main>
      {theme === "alternate" && <Dock />}
    </>
  );
}
```

---

## 二、两套 UI 环境

### 演武 `#1` — 官网风格

| 层级 | 桌面 | 手机 |
|------|------|------|
| **Header** | 56px 全高，金线呼吸动画，品牌名大字金色 | 44px，品牌名缩小但仍为金色 |
| **导航** | Header 内：`首页 | 赛事大厅 | 英雄图鉴` | 汉堡菜单展开 |
| **Dock** | 无 | 无 |
| **特色** | 暗金琉璃卡片、暖铜金强调色、6px 圆角 | 同桌面风格 |

**设计语言**：致敬王者荣耀官网。厚重、沉稳、竞技感。

### 厚玻璃 `#2` — Dock 风格

| 层级 | 桌面 | 手机 |
|------|------|------|
| **Header** | 34px 紧凑，半透白毛玻璃，品牌名小字灰色 | 同桌面 |
| **导航** | Header 内 + 底部 Dock | 底部 Dock |
| **Dock** | 显示（毛玻璃 40px blur） | 显示（同桌面） |
| **特色** | 浅底蓝调、卡片 backdrop-filter blur、16px 大圆角、多层柔和阴影 | 同桌面，模糊稍强（16px） |

**设计语言**：借鉴 macOS Dock。轻盈、通透、现代。

---

## 三、组件行为矩阵

### Header

| 条件 | #1 桌面 | #1 手机 | #2 桌面 | #2 手机 |
|------|---------|---------|---------|---------|
| 高度 | 56px | 44px | 34px | 34px |
| 金线动画 | ✓ | ✓ | ✗ | ✗ |
| 导航链接 | ✓ | ✗ | ✓ | ✗ |
| 汉堡菜单 | ✗ | ✓ | ✗ | ✗ |
| 品牌字 | 大字金色 | 中字金色 | 小字灰色 | 小字灰色 |
| 用户头像 | 金渐变 | 金渐变 | 蓝底 | 蓝底 |

### Dock

| 条件 | #1 | #2 |
|------|----|----|
| 桌面 | ✗ | ✓ |
| 手机 | ✗ | ✓ |
| 样式 | — | 毛玻璃 blur(40px)，白底半透 |

### 卡片 (.card)

| 属性 | #1 | #2 |
|------|----|----|
| 背景 | 渐变琉璃 `rgba(255,255,255,0.04)→#242833` | 半透白 `rgba(255,255,255,0.62)` |
| 模糊 | 无 | blur(8px) 桌面 / blur(16px) 手机 |
| 圆角 | 6px | 16px |
| 阴影 | 内高光 + 外阴影 | 多层柔和阴影 + 底部投影伪元素 |
| 顶部边框 | 亮线 `rgba(255,255,255,0.1)` | 亮线 `rgba(255,255,255,0.7)` |

### 按钮

| 属性 | #1 | #2 |
|------|----|----|
| btn-primary 渐变 | 金色 `gold-light→gold→gold-dim` | 蓝色 `#66a4f8→#4488f0→#2563d8` |
| btn-primary 圆角 | 6px | 20px |
| btn-primary 阴影 | 暗影 `rgba(0,0,0,0.12)` | 蓝影 `rgba(68,136,240,0.15)` |
| btn-subtle hover | `var(--bg-hover)` | `rgba(0,0,0,0.03)` |

---

## 四、移动端 /m 路由

`src/middleware.ts` — UA 检测移动设备 → 307 重定向到 `/m`：

```
用户手机访问 /heroes → 307 → /m/heroes
桌面访问 /heroes → 正常渲染
```

`/m` 下所有页面通过 re-export 共享主路由的页面组件：
```ts
// src/app/m/me/page.tsx
export { default } from "@/app/me/page";
```

`/m` 有独立 layout（`src/app/m/layout.tsx`），覆盖根 layout 的部分样式。

---

## 五、CSS 变量体系

所有视觉属性通过 CSS 变量定义，两套主题变量在 `:root` / `[data-theme="alternate"]` 中完全隔离。

| 变量 | #1 值 | #2 值 | 用途 |
|------|-------|-------|------|
| `--bg-root` | `#161920` | `#efeff2` | 页面背景 |
| `--bg-card` | `#242833` | `rgba(255,255,255,0.45)` | 卡片背景 |
| `--bg-input` | `#2a2f3b` | `rgba(255,255,255,0.55)` | 输入框 |
| `--text` | `#e0e3ea` | `#1a1a1a` | 正文 |
| `--text-secondary` | `#b0b4be` | `#555555` | 次要文字 |
| `--text-muted` | `#777b88` | `#888888` | 弱化文字 |
| `--gold` | `#a89068` | `#4488f0` | 强调色 |
| `--gold-light` | `#c0b090` | `#66a4f8` | 亮强调 |
| `--gold-dim` | `#807050` | `#2563d8` | 暗强调 |
| `--radius-sm` | `6px` | `14px` | 小圆角 |
| `--radius` | `6px` | `16px` | 默认圆角 |
| `--radius-lg` | `8px` | `20px` | 大圆角 |

---

## 六、Header CSS 类对照

| 类名 | 用途 | 定义位置 |
|------|------|----------|
| `.header-bar` | #2 紧凑 Header 容器（半透白 + blur） | `@layer components` + `[data-theme="alternate"]` 覆盖 |
| `.header-inner` | #1 全高 Header 内部 flex 容器（max-w-1200px） | `@layer components` |
| `.header-inner-alt` | #2 紧凑 Header 内部 flex 容器（max-w-100%） | `@layer components` |
| `.header-brand` | 品牌名链接 | `@layer components` |
| `.header-glow` | #1 底部金线呼吸动画 | `@layer components` |
| `.nav-link` | 桌面导航链接 | `@layer components` |

> **注意**：`header-inner-alt` 是 v1.0.1 后期补上的，之前遗漏导致 #2 Header 布局塌缩。

---

## 七、常见问题

### #2 Header 导航不可用
- 检查 `header-inner-alt` 类是否存在于 `globals.css`
- 检查 `ui.headerNav === "compact"` 是否正常返回

### 桌面 #1 出现汉堡菜单
- 检查 `isMobile` 是否为 `true`（屏幕宽度检测异常）
- 检查 `ui.mobileNav` 是否为 `"hamburger"`

### 命格英雄在图鉴消失
- 同步脚本可能覆盖了 `mingge` 字段 → 已修复：只在爬虫检测到命格时才更新
- 过滤器按 `minggeName` 隐藏命格形态，不按 ID

---

## 八、版本历史

| 版本 | 日期 | 主要变更 |
|------|------|----------|
| V1.0.0 | 2026-06-24 | 初始版本，双主题架构 |
| V1.0.1 | 2026-06-25 | UI Config 系统、命格系统、爬虫升级、移动端 /m 路由、Dock 常驻 |

---

## 九、关键文件索引

| 文件 | 说明 |
|------|------|
| `src/components/layout/ThemeLayout.tsx` | 主题路由：根据 theme 选 Header + Dock |
| `src/components/layout/yanwu/Header.tsx` | #1 专属 Header |
| `src/components/layout/alternate/Header.tsx` | #2 专属 Header |
| `src/components/layout/alternate/Dock.tsx` | #2 专属 Dock |
| `src/themes/ThemeProvider.tsx` | Hash 切换 + hashchange 监听 |
| `src/app/globals.css` | 全部 CSS 变量 + 双主题样式规则 |
| `src/app/layout.tsx` | 根布局 + 内联脚本防 FOUC |
| `src/app/m/layout.tsx` | 移动端独立布局 |
| `tailwind.config.ts` | Tailwind token → CSS 变量映射 |
| `docs/themes/README.md` | 双主题设计文档（CSS 变量完整表） |

---

## 十、添加第三套主题

1. `globals.css` 加 `[data-theme="新主题"]` CSS 变量块
2. `src/components/layout/新主题/Header.tsx` 创建新 Header
3. `ThemeLayout.tsx` 加一个 `theme === "新主题"` 分支（可选 Dock）
4. `ThemeProvider.tsx` 的 `HASH_THEME_MAP` 加 `"#3": "新主题"`

---

## 十一、版本历史

| 版本 | 日期 | 主要变更 |
|------|------|----------|
| V1.0.0 | 2026-06-24 | 初始版本，双主题架构，ui-config 条件决策 |
| V1.0.1 | 2026-06-25 | **组件分离重构**：YanwuHeader / AlternateHeader 独立文件，ThemeLayout 路由。命格系统、爬虫升级、移动端 /m 路由、Dock 常驻 #2 |
