"use client";

import { useEffect, useRef, useState } from "react";

const ORB_POSITIONS = [
  { x: 0.78, y: 0.15 },
  { x: 0.12, y: 0.78 },
  { x: 0.50, y: 0.45 },
];

function hasStoredMotionPermission() {
  try {
    return localStorage.getItem("motion-permission") === "granted";
  } catch {
    return false;
  }
}

export function BackgroundOrbs() {
  const containerRef = useRef<HTMLDivElement>(null);
  const gyroRef = useRef<{ a: number; b: number; g: number; t: number } | null>(null);
  const shakeRef = useRef(0);
  const [needsMotionPermission, setNeedsMotionPermission] = useState(false);

  useEffect(() => {
    const el = containerRef.current!;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setNeedsMotionPermission(false);
      return;
    }

    const root = document.documentElement;
    const orientationApi = typeof DeviceOrientationEvent === "undefined"
      ? null
      : DeviceOrientationEvent as typeof DeviceOrientationEvent & {
        requestPermission?: () => Promise<"granted" | "denied">;
      };
    setNeedsMotionPermission(
      typeof orientationApi?.requestPermission === "function"
      && !hasStoredMotionPermission(),
    );
    let mx = 0.5;
    let my = 0.5;
    let targetX = 0.5;
    let targetY = 0.5;
    let rafId: number | null = null;

    function update() {
      mx += (targetX - mx) * 0.14;
      my += (targetY - my) * 0.14;
      shakeRef.current *= 0.88;

      el.style.setProperty("--orb-mx", String(mx));
      el.style.setProperty("--orb-my", String(my));

      for (let i = 0; i < ORB_POSITIONS.length; i++) {
        const orb = ORB_POSITIONS[i];
        const dx = mx - orb.x;
        const dy = my - orb.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const force = dist < 0.01 ? 0 : 0.55 / (1 + dist * 3.5);
        const repelX = dist > 0.001 ? (dx / dist) * force : 0;
        const repelY = dist > 0.001 ? (dy / dist) * force : 0;
        el.style.setProperty(`--orb-repel-x-${i + 1}`, String(repelX));
        el.style.setProperty(`--orb-repel-y-${i + 1}`, String(repelY));
        const prox = Math.max(0, 1 - dist / 0.55);
        el.style.setProperty(`--orb-prox-${i + 1}`, String(prox));
      }

      el.style.setProperty("--orb-shake", String(shakeRef.current));
      const shadowX = (mx - 0.5) * 12;
      const shadowY = 6 + (my - 0.5) * 8;
      root.style.setProperty("--glass-shadow-x", `${shadowX.toFixed(2)}px`);
      root.style.setProperty("--glass-shadow-y", `${shadowY.toFixed(2)}px`);
      root.style.setProperty("--glass-shadow-far-x", `${(shadowX * 1.6).toFixed(2)}px`);
      root.style.setProperty("--glass-shadow-far-y", `${(shadowY + 7).toFixed(2)}px`);
      root.style.setProperty("--glass-highlight-x", `${(-shadowX * 0.12).toFixed(2)}px`);

      rafId = null;
      if (
        Math.abs(targetX - mx) > 0.001
        || Math.abs(targetY - my) > 0.001
        || shakeRef.current > 0.005
      ) {
        scheduleUpdate();
      }
    }

    function scheduleUpdate() {
      if (rafId === null) rafId = requestAnimationFrame(update);
    }

    function onMouse(e: MouseEvent) {
      targetX = e.clientX / window.innerWidth;
      targetY = e.clientY / window.innerHeight;
      scheduleUpdate();
    }

    function angularDelta(current: number, previous: number) {
      const delta = Math.abs(current - previous) % 360;
      return Math.min(delta, 360 - delta);
    }

    function onOrientation(e: DeviceOrientationEvent) {
      const prev = gyroRef.current;
      const now = { a: e.alpha ?? 0, b: e.beta ?? 0, g: e.gamma ?? 0, t: Date.now() };
      if (prev) {
        const dt = Math.max((now.t - prev.t) / 1000, 0.016);
        const velocity = (
          angularDelta(now.a, prev.a)
          + angularDelta(now.b, prev.b)
          + angularDelta(now.g, prev.g)
        ) / dt;
        shakeRef.current = Math.max(shakeRef.current, Math.min(1, velocity / 600));
      }
      gyroRef.current = now;

      if (e.gamma !== null && e.beta !== null) {
        targetX = (Math.max(-45, Math.min(45, e.gamma)) + 45) / 90;
        targetY = (Math.max(-45, Math.min(45, e.beta)) + 45) / 90;
        scheduleUpdate();
      }
    }

    scheduleUpdate();
    const finePointer = window.matchMedia("(any-hover: hover) and (pointer: fine)");
    if (finePointer.matches) {
      document.addEventListener("mousemove", onMouse, { passive: true });
    }
    window.addEventListener("deviceorientation", onOrientation, { passive: true });
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      document.removeEventListener("mousemove", onMouse);
      window.removeEventListener("deviceorientation", onOrientation);
      root.style.removeProperty("--glass-shadow-x");
      root.style.removeProperty("--glass-shadow-y");
      root.style.removeProperty("--glass-shadow-far-x");
      root.style.removeProperty("--glass-shadow-far-y");
      root.style.removeProperty("--glass-highlight-x");
    };
  }, []);

  async function requestMotionPermission() {
    if (typeof DeviceOrientationEvent === "undefined") return;
    const orientationApi = DeviceOrientationEvent as typeof DeviceOrientationEvent & {
      requestPermission?: () => Promise<"granted" | "denied">;
    };
    if (!orientationApi.requestPermission) return;

    try {
      const permission = await orientationApi.requestPermission();
      if (permission === "granted") {
        try {
          localStorage.setItem("motion-permission", "granted");
        } catch {
          // 无持久化存储时仅保留当前页面授权。
        }
        setNeedsMotionPermission(false);
      }
    } catch {
      // Safari 要求此调用必须来自用户手势，失败时保留按钮供重试。
    }
  }

  return (
    <>
      <div ref={containerRef} className="bg-orbs-container" aria-hidden="true">
        <div className="bg-orb bg-orb--1"><div className="bg-orb-inner" /></div>
        <div className="bg-orb bg-orb--2"><div className="bg-orb-inner" /></div>
        <div className="bg-orb bg-orb--3"><div className="bg-orb-inner" /></div>
      </div>
      {needsMotionPermission && (
        <button
          type="button"
          className="motion-permission-button"
          onClick={requestMotionPermission}
        >
          启用动态光影
        </button>
      )}
    </>
  );
}
