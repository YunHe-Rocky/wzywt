# 王者演武堂 — 双主题设计文档

## 概述

项目采用 hash 驱动的双主题架构，CSS 变量全隔离。桌面端和移动端各有独立布局，UA 检测自动跳转。两套主题功能完全相同，仅视觉差异。

## 切换方式

| 方式 | 说明 |
|------|------|
| URL hash | `#1` = 演武主题，`#2` = 厚玻璃主题，无 hash 默认 `#1` |
| 链接保持 | Dock 和 Header 所有内部链接自动携带当前 hash |
| 移动端 | UA 检测 → 自动 307 到 `/m` 路由 |

---

## 一、演武主题 `#1` — 暗金琉璃

### 设计理念
深色石板基底搭配暖铜金点缀，低对比度、低饱和度，长时间使用不刺眼。卡片琉璃质感（顶部微亮反光 + 内阴影）。

### CSS 变量
```css
:root, [data-theme="yanwu"] {
  --bg-root: #161920;
  --bg-nav: #1b1e27;
  --bg-card: #242833;
  --bg-card-glass: linear-gradient(180deg, rgba(255,255,255,0.04) 0%, #242833 30%);
  --bg-hover: #2d3240;
  --bg-input: #2a2f3b;

  --border: rgba(255,255,255,0.08);
  --border-light: rgba(255,255,255,0.05);
  --border-top: rgba(255,255,255,0.1);

  --text: #e0e3ea;
  --text-secondary: #b0b4be;
  --text-muted: #777b88;

  --gold: #a89068;
  --gold-light: #c0b090;
  --gold-dim: #807050;

  --red: #cc6666;
  --blue: #6898cc;
  --green: #78b878;

  --radius-sm: 6px;
  --radius: 6px;
  --radius-lg: 8px;
}
```

### 视觉特征
- **基调**: 深灰 `#161920`，暖铜金点缀
- **卡片**: 琉璃渐变 + 玻璃阴影
- **按钮**: 金色渐变，6px 圆角，hover 上浮 + 加深阴影
- **Header**: 56px，底部金线呼吸动画
- **Dock**: 仅移动端显示，暗色玻璃
- **光晕**: 暖金/琥珀色，18-22s 漂移

---

## 二、厚玻璃主题 `#2` — 毛玻璃风格

### 设计理念
浅色基底 + 半透明玻璃卡片 + backdrop-filter 模糊 + 多层柔和阴影。蓝色强调色。圆角更大更柔和。

### CSS 变量
```css
[data-theme="alternate"] {
  --bg-root: #efeff2;
  --bg-nav: rgba(255,255,255,0.5);
  --bg-card: rgba(255,255,255,0.45);
  --bg-hover: rgba(255,255,255,0.55);
  --bg-input: rgba(255,255,255,0.55);

  --border: rgba(255,255,255,0.6);
  --border-light: rgba(255,255,255,0.3);
  --border-top: rgba(255,255,255,0.7);

  --text: #1a1a1a;          /* 加深，提高玻璃卡片上可读性 */
  --text-secondary: #555555;
  --text-muted: #888888;

  --gold: #4488f0;          /* 变量名保持 gold，值改为蓝色 */
  --gold-light: #66a4f8;
  --gold-dim: #2563d8;

  --red: #e05555;
  --blue: #4488f0;
  --green: #55b855;

  --radius-sm: 14px;
  --radius: 16px;
  --radius-lg: 20px;
}
```

### 卡片玻璃效果
```css
[data-theme="alternate"] .card {
  background: rgba(255,255,255,0.62);        /* 较高不透明度，文字清晰 */
  backdrop-filter: blur(8px);                /* 桌面端轻度模糊 */
  border: 1px solid rgba(255,255,255,0.6);
  border-bottom: 1px solid rgba(0,0,0,0.08);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.5),
    0 1px 2px rgba(0,0,0,0.04),
    0 4px 8px rgba(0,0,0,0.05),
    0 8px 24px rgba(0,0,0,0.04),
    0 16px 48px rgba(0,0,0,0.02);
}
/* 移动端：稍强模糊 */
@media (max-width: 768px) {
  [data-theme="alternate"] .card {
    backdrop-filter: blur(16px);
  }
}
```

### 视觉特征
- **基调**: 浅灰 `#efeff2`，蓝色点缀
- **卡片**: 62% 不透明 + 8px 模糊，文字清晰
- **按钮**: 蓝色渐变，14-20px 圆角，阴影 + hover 上浮
- **Header**: 34px 简约栏，半透模糊
- **Dock**: 桌面 + 移动端常驻，毛玻璃 40px 模糊
- **光晕**: 蓝/紫/青色

---

## 三、布局对照

| 元素 | 演武 #1 | 厚玻璃 #2 |
|------|---------|-----------|
| 背景色 | `#161920` | `#efeff2` |
| 正文色 | `#e0e3ea` | `#1a1a1a` |
| 强调色 | 暖铜金 | 系统蓝 |
| 卡片背景 | 渐变琉璃 | 62% 白 + 8px 模糊 |
| 按钮圆角 | 6px | 14-20px |
| Header | 56px | 34px（桌面） |
| Dock | 仅移动端 | 常驻 |
| 光晕色 | 暖金/琥珀 | 蓝/紫/青 |

## 四、关键文件

| 文件 | 说明 |
|------|------|
| `src/themes/ThemeProvider.tsx` | hash 切换 + hashchange 监听 |
| `src/app/globals.css` | CSS 变量 + 双主题样式 |
| `src/app/layout.tsx` | 内联脚本防 FOUC |
| `src/components/layout/Dock.tsx` | 底部导航（#1 仅移动，#2 常驻） |
| `src/components/layout/Header.tsx` | 顶部导航（三模式） |
| `src/components/layout/BackgroundOrbs.tsx` | 动态光晕 |
| `tailwind.config.ts` | Tailwind token → CSS 变量 |
