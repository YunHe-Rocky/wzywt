"use client";

import { useEffect, useRef } from "react";

const SELECTOR = ".card, .card-interactive";

interface CardCache {
  el: HTMLElement;
  cx: number;
  cy: number;
  hw: number;
  hh: number;
}

export function CursorLighting() {
  const rafRef = useRef<number>(0);
  const cacheRef = useRef<CardCache[]>([]);
  const dirtyRef = useRef(true);

  useEffect(() => {
    // 手机/平板/无悬停设备直接跳过
    if (window.matchMedia("(any-hover: none)").matches) return;
    // 用户偏好减少动画
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const root = document.documentElement;
    const isMobile = window.innerWidth <= 768;
    let mx = window.innerWidth / 2;
    let my = window.innerHeight / 2;
    let vw = window.innerWidth;
    let vh = window.innerHeight;

    // 重建位置缓存（仅在滚动/resize/DOM变化时调用）
    function rebuildCache() {
      const els = Array.from(document.querySelectorAll<HTMLElement>(SELECTOR));
      cacheRef.current = [];
      for (const el of els) {
        const r = el.getBoundingClientRect();
        // 完全离屏的跳过
        if (r.bottom < -60 || r.top > vh + 60 || r.right < -60 || r.left > vw + 60) continue;
        cacheRef.current.push({
          el,
          cx: r.left + r.width / 2,
          cy: r.top + r.height / 2,
          hw: Math.max(r.width / 2, 1),
          hh: Math.max(r.height / 2, 1),
        });
      }
      dirtyRef.current = false;
    }

    rebuildCache();

    // 滚动/缩放时标记缓存失效
    let scrollTimer: ReturnType<typeof setTimeout>;
    function onScroll() {
      dirtyRef.current = true;
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(rebuildCache, 100);
    }
    function onResize() {
      vw = window.innerWidth; vh = window.innerHeight;
      dirtyRef.current = true;
      rebuildCache();
    }

    const observer = new MutationObserver(() => {
      dirtyRef.current = true;
      setTimeout(rebuildCache, 50);
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: false });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);

    // 应用效果（纯读缓存，不触发重排）
    const rotMul = isMobile ? 0.7 : 1;
    function apply(c: CardCache) {
      const dx = (mx - c.cx) / c.hw;
      const dy = (my - c.cy) / c.hh;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const t = Math.min(1, 1 / Math.max(0.4, dist * 0.5));

      const rx = (-dy * 1.5 * t * rotMul).toFixed(1);
      const ry = (dx * 2 * t * rotMul).toFixed(1);
      c.el.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`;

      const shX = (dx * 4 * t).toFixed(0);
      const shY = (3 + Math.abs(dy) * 2 * t).toFixed(0);
      const a = (0.03 + t * 0.05).toFixed(3);
      c.el.style.setProperty(
        "box-shadow",
        `inset 0 1px 0 rgba(255,255,255,0.5), ${shX}px ${shY}px 2px rgba(0,0,0,${a}), ${(parseInt(shX) * 1.5).toFixed(0)}px ${(parseInt(shY) + 4).toFixed(0)}px 8px rgba(0,0,0,${a})`,
        "important"
      );
    }

    let pending = false;
    function updateAll() {
      if (pending) return;
      pending = true;
      rafRef.current = requestAnimationFrame(() => {
        pending = false;
        root.style.setProperty("--cursor-x", mx + "px");
        root.style.setProperty("--cursor-y", my + "px");
        if (dirtyRef.current) rebuildCache();
        const cache = cacheRef.current;
        for (let i = 0; i < cache.length; i++) apply(cache[i]);
      });
    }

    // 桌面全速，移动/平板半速节流
    let lastMouseTime = 0;
    const MOUSE_THROTTLE = isMobile ? 32 : 16;
    function onMouse(e: MouseEvent) {
      const now = performance.now();
      if (now - lastMouseTime < MOUSE_THROTTLE) { mx = e.clientX; my = e.clientY; return; }
      lastMouseTime = now;
      mx = e.clientX; my = e.clientY;
      updateAll();
    }
    document.addEventListener("mousemove", onMouse, { passive: true });
    updateAll();

    return () => {
      observer.disconnect();
      clearTimeout(scrollTimer);
      cancelAnimationFrame(rafRef.current);
      document.removeEventListener("mousemove", onMouse);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      for (const c of cacheRef.current) {
        c.el.style.transform = "";
        c.el.style.boxShadow = "";
      }
      root.style.removeProperty("--cursor-x");
      root.style.removeProperty("--cursor-y");
    };
  }, []);

  return null;
}
