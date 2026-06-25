"use client";

import { useEffect } from "react";
import { useTheme } from "@/themes/ThemeProvider";

export function CursorLighting() {
  const { theme } = useTheme();

  useEffect(() => {
    if (theme !== "alternate") return;

    const root = document.documentElement;
    let mx = window.innerWidth / 2;
    let my = window.innerHeight / 2;

    function apply(el: HTMLElement) {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = (mx - cx) / (rect.width / 2);
      const dy = (my - cy) / (rect.height / 2);
      const dist = Math.sqrt(dx * dx + dy * dy);
      const t = Math.min(1, 1 / Math.max(0.3, dist * 0.5));

      const shX = dx * 5 * t;
      const shY = 4 + Math.abs(dy) * 3 * t;
      const a = 0.04 + t * 0.08;

      el.style.transform = `rotateX(${-dy * 2 * t}deg) rotateY(${dx * 3 * t}deg)`;
      // 用 !important priority 覆盖 CSS 静态阴影，实现动态光照
      el.style.setProperty(
        "box-shadow",
        [
          `inset 0 1px 0 rgba(255,255,255,0.5)`,
          `${shX}px ${shY}px 3px rgba(0,0,0,${(0.03 + t * 0.04).toFixed(3)})`,
          `${shX}px ${shY + 3}px 10px rgba(0,0,0,${a.toFixed(3)})`,
          `${(shX * 1.5).toFixed(0)}px ${(shY + 8).toFixed(0)}px 24px rgba(0,0,0,${(a * 0.6).toFixed(3)})`,
        ].join(", "),
        "important"
      );
    }

    function updateAll() {
      root.style.setProperty("--cursor-x", mx + "px");
      root.style.setProperty("--cursor-y", my + "px");

      document
        .querySelectorAll<HTMLElement>(
          ".card, .card-red, .card-blue, .card-interactive, .header-bar, [style*=\"var(--bg-card)\"], [style*=\"var(--bg-card-glass)\"]"
        )
        .forEach(apply);
    }

    function onMouse(e: MouseEvent) {
      mx = e.clientX;
      my = e.clientY;
      updateAll();
    }

    function onTouch(e: TouchEvent) {
      if (e.touches.length > 0) {
        mx = e.touches[0].clientX;
        my = e.touches[0].clientY;
        updateAll();
      }
    }

    function onOrientation(e: DeviceOrientationEvent) {
      if (e.gamma !== null && e.beta !== null) {
        const g = Math.max(-45, Math.min(45, e.gamma));
        const b = Math.max(-45, Math.min(45, e.beta));
        mx = ((g + 45) / 90) * window.innerWidth;
        my = ((b + 45) / 90) * window.innerHeight;
        updateAll();
      }
    }

    document.addEventListener("mousemove", onMouse, { passive: true });
    document.addEventListener("touchmove", onTouch, { passive: true });

    if ("ondeviceorientation" in window) {
      window.addEventListener("deviceorientation", onOrientation);
    }

    // 初始
    updateAll();

    return () => {
      document.removeEventListener("mousemove", onMouse);
      document.removeEventListener("touchmove", onTouch);
      window.removeEventListener("deviceorientation", onOrientation);
      root.style.removeProperty("--cursor-x");
      root.style.removeProperty("--cursor-y");
    };
  }, [theme]);

  return null;
}
