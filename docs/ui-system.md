# 王者演武堂 — UI 系统文档

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
              ┌────────────┼────────────┐
              │            │            │
         globals.css   ui-config.ts  components
         (CSS变量)     (行为决策)    (Header/Dock/...)
```

**核心原则**：样式和行为分离。CSS 变量管颜色/圆角/阴影，`ui-config.ts` 管导航方式/Dock/汉堡菜单。

---

## 一、UI 配置文件

`src/themes/ui-config.ts` — 整个 UI 系统的唯一决策点。每个主题是一个完整的独立 UI 环境。

```ts
interface UIConfig {
  name: string;
  headerNav: "full" | "compact";    // Header 导航栏样式
  mobileNav: "hamburger" | "dock";  // 手机端导航方式
  dock: boolean;                    // 是否显示底部 Dock
  headerHeight: number;             // Header 高度
}

const UI_CONFIG = {
  yanwu: {
    name: "演武",
    headerNav: "full",        // 全高 Header + 金线动画
    mobileNav: "hamburger",   // 手机用汉堡菜单
    dock: false,              // 无 Dock
    headerHeight: 56,
  },
  alternate: {
    name: "厚玻璃",
    headerNav: "compact",     // 紧凑 Header（34px 毛玻璃）
    mobileNav: "dock",        // 手机用 Dock
    dock: true,               // 桌面+手机都有 Dock
    headerHeight: 34,
  },
};
```

### 使用方式

```tsx
const { theme } = useTheme();
const ui = getUIConfig(theme);

// 不再写 if (theme === "alternate")，而是：
if (ui.dock) { /* 显示 Dock */ }
if (ui.mobileNav === "hamburger") { /* 显示汉堡菜单 */ }
if (ui.headerNav === "compact") { /* 紧凑 Header 样式 */ }
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

## 六、关键文件索引

| 文件 | 说明 |
|------|------|
| `src/themes/ui-config.ts` | UI 行为决策（导航/Dock/汉堡） |
| `src/themes/ThemeProvider.tsx` | Hash 切换 + hashchange 监听 |
| `src/app/globals.css` | 全部 CSS 变量 + 双主题样式规则 |
| `src/app/layout.tsx` | 根布局 + 内联脚本防 FOUC |
| `src/components/layout/Header.tsx` | 顶部导航（三模式：#1桌面/#2桌面/手机） |
| `src/components/layout/Dock.tsx` | 底部导航栏（#2 专属） |
| `src/app/m/layout.tsx` | 移动端独立布局 |
| `tailwind.config.ts` | Tailwind token → CSS 变量映射 |
| `docs/themes/README.md` | 双主题设计文档（CSS 变量完整表） |

---

## 七、添加第三套主题

只需三步：

1. `globals.css` 加 `[data-theme="新主题"]` CSS 变量块
2. `ui-config.ts` 加 `新主题: { headerNav, mobileNav, dock, headerHeight }`
3. `ThemeProvider.tsx` 的 `HASH_THEME_MAP` 加 `"#3": "新主题"`

所有组件自动适配，不需要改任何组件代码。
