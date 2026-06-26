"use client";

import { useEffect, useRef } from "react";

const ORB_POSITIONS = [
  { x: 0.78, y: 0.15 },
  { x: 0.12, y: 0.78 },
  { x: 0.50, y: 0.45 },
];

export function BackgroundOrbs() {
  const containerRef = useRef<HTMLDivElement>(null);
  const gyroRef = useRef<{ a: number; b: number; g: number; t: number }>({ a: 0, b: 0, g: 0, t: 0 });
  const shakeRef = useRef(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let mx = 0.5;
    let my = 0.5;
    let rafId: number | null = null;

    function update() {
      el.style.setProperty("--orb-mx", String(mx));
      el.style.setProperty("--orb-my", String(my));

      for (let i = 0; i < ORB_POSITIONS.length; i++) {
        const orb = ORB_POSITIONS[i];
        const dx = mx - orb.x;
        const dy = my - orb.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const force = dist < 0.01 ? 0 : 0.5 / (1 + dist * 4);
        const repelX = dist > 0.001 ? (dx / dist) * force : 0;
        const repelY = dist > 0.001 ? (dy / dist) * force : 0;
        el.style.setProperty(`--orb-repel-x-${i + 1}`, String(repelX));
        el.style.setProperty(`--orb-repel-y-${i + 1}`, String(repelY));
        const prox = Math.max(0, 1 - dist / 0.55);
        el.style.setProperty(`--orb-prox-${i + 1}`, String(prox));
      }

      el.style.setProperty("--orb-shake", String(shakeRef.current));
      rafId = null;
    }

    function scheduleUpdate() {
      if (rafId === null) rafId = requestAnimationFrame(update);
    }

    function onMouse(e: MouseEvent) {
      mx = e.clientX / window.innerWidth;
      my = e.clientY / window.innerHeight;
      scheduleUpdate();
    }

    function onTouch(e: TouchEvent) {
      if (e.touches.length > 0) {
        mx = e.touches[0].clientX / window.innerWidth;
        my = e.touches[0].clientY / window.innerHeight;
        scheduleUpdate();
      }
    }

    function onOrientation(e: DeviceOrientationEvent) {
      const prev = gyroRef.current;
      const now = { a: e.alpha ?? 0, b: e.beta ?? 0, g: e.gamma ?? 0, t: Date.now() };
      const dt = Math.max((now.t - prev.t) / 1000, 0.016);
      const da = Math.abs(now.a - prev.a) / dt;
      const db = Math.abs(now.b - prev.b) / dt;
      const dg = Math.abs(now.g - prev.g) / dt;
      shakeRef.current = Math.min(1, (da + db + dg) / 600);
      gyroRef.current = now;

      if (e.gamma !== null && e.beta !== null) {
        mx = (Math.max(-45, Math.min(45, e.gamma)) + 45) / 90;
        my = (Math.max(-45, Math.min(45, e.beta)) + 45) / 90;
        scheduleUpdate();
      }
    }

    scheduleUpdate();
    document.addEventListener("mousemove", onMouse, { passive: true });
    document.addEventListener("touchmove", onTouch, { passive: true });
    if (typeof window !== "undefined" && "ondeviceorientation" in window) {
      window.addEventListener("deviceorientation", onOrientation);
    }
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      document.removeEventListener("mousemove", onMouse);
      document.removeEventListener("touchmove", onTouch);
      window.removeEventListener("deviceorientation", onOrientation);
    };
  }, []);

  return (
    <div ref={containerRef} className="bg-orbs-container" aria-hidden="true">
      <div className="bg-orb bg-orb--1"><div className="bg-orb-inner" /></div>
      <div className="bg-orb bg-orb--2"><div className="bg-orb-inner" /></div>
      <div className="bg-orb bg-orb--3"><div className="bg-orb-inner" /></div>
    </div>
  );
}
