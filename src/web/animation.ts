// 全局动画预设 — 单点维护，组件引用

import type { CSSProperties } from "react";

// === 缓动曲线 ===

export const EASE_BOUNCE = "cubic-bezier(0.34, 1.56, 0.64, 1)";
export const EASE_OUT = "ease-out";
export const EASE_IN = "ease-in";
export const EASE_SMOOTH = "cubic-bezier(0.4, 0, 0.2, 1)";

// === 常用时长 ===

export const DUR_FAST = "0.12s";
export const DUR_NORMAL = "0.2s";
export const DUR_SLOW = "0.3s";
export const DUR_PAGE = "0.4s";

// === 毛玻璃卡片 ===

export const GLASS_CARD: CSSProperties = {
  background: "rgba(255,255,255,0.5)",
  backdropFilter: "blur(40px)",
  WebkitBackdropFilter: "blur(40px)",
  border: "1px solid rgba(0,0,0,0.06)",
};

export const GLASS_SHADOW_TOP: CSSProperties = {
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.5), 0 1px 3px rgba(0,0,0,0.04), 0 4px 20px rgba(0,0,0,0.04)",
};

export const GLASS_SHADOW_BOTTOM: CSSProperties = {
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.5), 0 -1px 3px rgba(0,0,0,0.04), 0 4px 20px rgba(0,0,0,0.06), 0 8px 40px rgba(0,0,0,0.04)",
};

// === 列表卡片错峰入场 ===

export function cardStagger(index: number, baseDelay: number = 0.015): CSSProperties {
  return {
    animation: `fade-in ${DUR_SLOW} ${index * baseDelay}s ${EASE_OUT} both`,
  };
}

// === 子项错峰出入 ===

export function childStagger(
  index: number,
  delayPerItem: number = 0.05,
): {
  enter: CSSProperties;
  exit: CSSProperties;
  base: CSSProperties;
} {
  const trans = `opacity ${DUR_NORMAL} ${EASE_OUT} ${0.05 + index * delayPerItem}s, transform ${DUR_SLOW} ${EASE_BOUNCE} ${0.05 + index * delayPerItem}s`;
  return {
    enter: { opacity: 1, transform: "translateY(0)", transition: trans },
    exit: { opacity: 0, transform: "translateY(8px)", transition: trans },
    base: { opacity: 0, transform: "translateY(8px)", transition: trans },
  };
}

// === 页面入场 ===

export function pageEnter(stagger: number = 0): CSSProperties {
  return {
    animation: `page-enter-alt ${DUR_PAGE} ${EASE_BOUNCE} ${stagger}s both`,
  };
}

// === 按钮反馈 ===

export const BTN_TRANSITION: CSSProperties = {
  transition: `background ${DUR_FAST}, color ${DUR_FAST}, border-color ${DUR_FAST}`,
};

export const BTN_BOUNCE: CSSProperties = {
  transition: `transform ${DUR_SLOW} ${EASE_BOUNCE}`,
};

export const BTN_PRESS: CSSProperties = {
  transform: "scale(0.82)",
  transition: `transform 0.15s ${EASE_OUT}`,
};

export const BTN_RELEASE: CSSProperties = {
  transform: "scale(1)",
  transition: `transform ${DUR_SLOW} ${EASE_BOUNCE}`,
};

// === Dock 弹出面板 ===

export function dockPanel(isOpen: boolean): CSSProperties {
  return {
    transform: isOpen ? "translateY(0) scale(1)" : "translateY(12px) scale(0.85)",
    opacity: isOpen ? 1 : 0,
    pointerEvents: isOpen ? "auto" : "none",
    transformOrigin: "bottom center",
    transition: `transform 0.35s ${EASE_BOUNCE}, opacity 0.25s ${EASE_OUT}`,
  };
}
