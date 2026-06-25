# 王者演武堂 — 双主题设计文档

## 概述

项目采用 hash 驱动的双主题架构，通过 URL `#1` / `#2` 切换，CSS 变量全隔离。移动端通过 UA 检测自动跳转 `/m` 路由，两套主题各有独立的桌面/移动端适配。

## 切换方式

| 方式 | 说明 |
|------|------|
| URL hash | `#1` = 演武主题，`#2` = 厚玻璃主题，无 hash 默认 `#1` |
| 链接保持 | Dock 和 Header 所有内部链接自动携带当前 hash，不会丢失主题 |
| 移动端 | UA 检测 → 自动 307 到 `/m` 路由，手机版有独立布局 |

---

## 一、演武主题 `#1` — 暗金琉璃

### 设计理念
致敬王者荣耀竞技氛围。深色石板基底搭配暖铜金点缀，低对比度、低饱和度，长时间使用不刺眼。卡片采用琉璃质感（顶部微亮反光 + 内阴影），营造铠甲般的厚重感。

### CSS 变量
```css
:root, [data-theme="yanwu"] {
  /* 基底 */
  --bg-root: #161920;       /* 石板灰底 */
  --bg-nav: #1b1e27;        /* 导航栏 */
  --bg-card: #242833;        /* 卡片背景 */
  --bg-card-glass: linear-gradient(180deg,
    rgba(255,255,255,0.04) 0%, #242833 30%);  /* 琉璃渐变 */
  --bg-hover: #2d3240;       /* 悬停 */
  --bg-input: #2a2f3b;       /* 输入框 */

  /* 边框 */
  --border: rgba(255,255,255,0.08);
  --border-light: rgba(255,255,255,0.05);
  --border-top: rgba(255,255,255,0.1);
  --border-gold: rgba(168,144,104,0.12);

  /* 文字 */
  --text: #e0e3ea;           /* 正文 */
  --text-secondary: #b0b4be; /* 次要 */
  --text-muted: #777b88;     /* 弱化 */

  /* 强调色 — 暖铜金 */
  --gold: #a89068;
  --gold-light: #c0b090;
  --gold-dim: #807050;

  /* 功能色 */
  --red: #cc6666;
  --blue: #6898cc;
  --green: #78b878;

  /* 圆角 — 锐利 */
  --radius-sm: 6px;
  --radius: 6px;
  --radius-lg: 8px;
}
```

### 视觉特征
- **基调**: 深灰基底（`#161920`），暖铜金点缀
- **卡片**: 琉璃质感，顶部 4% 白色反光 + 0.04 内阴影
- **按钮**: 金色渐变 `gold-light → gold → gold-dim`，hover 亮度 +8%
- **圆角**: 6-8px，棱角分明
- **Header**: 56px 高，底部金线呼吸动画
- **导航**: 桌面 Header 内置，手机靠 Dock
- **光晕**: 三颗暖金色模糊光球，18-22s 缓慢漂移
- **Dock**: 桌面不显示，手机显示暗色玻璃 Dock

### 适用场景
桌面端主力主题。适合长时间浏览、赛事管理、分队操作。

---

## 二、厚玻璃主题 `#2` — macOS Dock 风格

### 设计理念
借鉴 macOS Dock 的毛玻璃美学。浅色基底 + 高透玻璃卡片 + 多层阴影 + backdrop-filter 模糊。强调轻盈、通透、现代感。蓝色替代金色作为强调色。

### CSS 变量
```css
[data-theme="alternate"] {
  /* 基底 */
  --bg-root: #efeff2;                /* 浅灰底 */
  --bg-nav: rgba(255,255,255,0.5);   /* 半透导航 */
  --bg-card: rgba(255,255,255,0.45); /* 玻璃卡片 */
  --bg-card-glass: rgba(255,255,255,0.45);
  --bg-hover: rgba(255,255,255,0.55);
  --bg-input: rgba(255,255,255,0.55);

  /* 边框 */
  --border: rgba(255,255,255,0.6);
  --border-light: rgba(255,255,255,0.3);
  --border-top: rgba(255,255,255,0.7);
  --border-gold: rgba(94,158,255,0.15);  /* 蓝色 */

  /* 文字 */
  --text: #333333;
  --text-secondary: #777777;
  --text-muted: #aaaaaa;

  /* 强调色 — 系统蓝 */
  --gold: #4488f0;        /* 注意：变量名保持 gold 但值是蓝色 */
  --gold-light: #66a4f8;
  --gold-dim: #2563d8;

  /* 功能色 */
  --red: #e05555;
  --blue: #4488f0;
  --green: #55b855;

  /* 圆角 — 圆润 */
  --radius-sm: 14px;
  --radius: 16px;
  --radius-lg: 20px;
}
```

### 卡片玻璃效果（!important 硬覆盖）
```css
[data-theme="alternate"] .card {
  background: rgba(255,255,255,0.45) !important;
  backdrop-filter: blur(28px) !important;
  border: 1px solid rgba(255,255,255,0.6);
  border-bottom: 1px solid rgba(0,0,0,0.08);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.5),   /* 顶部高光 */
    0 1px 2px rgba(0,0,0,0.04),
    0 4px 8px rgba(0,0,0,0.05),
    0 8px 24px rgba(0,0,0,0.04),
    0 16px 48px rgba(0,0,0,0.02);
}
```

### 视觉特征
- **基调**: 浅灰（`#efeff2`），蓝色点缀
- **卡片**: 厚玻璃质感，28px backdrop-filter 模糊，多层柔和阴影 + 底部伪元素投影
- **按钮**: 蓝色渐变，圆角 20px，更圆润
- **圆角**: 14-20px，柔和大圆角
- **Header**: 34px 高简约栏，半透背景 + 模糊
- **Dock**: 始终显示，毛玻璃质感 + 40px 模糊，蓝/金色图标
- **光晕**: 三颗蓝色/紫色/青色光球，20-22s 漂移
- **卡片阴影跟随**: CursorLighting 组件根据鼠标位置动态调整卡片阴影（桌面端）

### 适用场景
移动端主力主题，桌面端可选风格。适合触屏操作、快速浏览。

---

## 三、布局对照

| 元素 | 演武 #1 | 厚玻璃 #2 |
|------|---------|-----------|
| 背景色 | `#161920` 深灰 | `#efeff2` 浅灰 |
| 强调色 | 暖铜金 `#a89068` | 系统蓝 `#4488f0` |
| 卡片风格 | 暗琉璃，顶部微光 | 厚毛玻璃，多层阴影 |
| 按钮圆角 | 6px | 20px |
| Header 高度 | 56px | 34px（桌面）/ 44px（移动） |
| 导航栏 | 桌面 Header 内 | 桌面 Header + Dock |
| Dock | 仅移动端 | 桌面 + 移动端 |
| 光晕颜色 | 暖金/琥珀 | 蓝/紫/青 |
| 滚动条 | 深色 | 浅色 |

## 四、文件分布

| 文件 | 说明 |
|------|------|
| `src/themes/ThemeProvider.tsx` | hash 驱动主题切换，监听 hashchange |
| `src/app/globals.css` | 全部 CSS 变量定义 + 双主题样式规则 |
| `src/app/layout.tsx` | 根布局，内联脚本防闪烁 |
| `src/components/layout/Dock.tsx` | 底部导航栏，双主题适配 |
| `src/components/layout/Header.tsx` | 顶部导航栏，三模式（#1/#2//m） |
| `src/components/layout/BackgroundOrbs.tsx` | 三颗动态光晕 |
| `src/components/layout/CursorLighting.tsx` | #2 专属鼠标跟随阴影 |
| `tailwind.config.ts` | 颜色 token 映射到 CSS 变量 |
