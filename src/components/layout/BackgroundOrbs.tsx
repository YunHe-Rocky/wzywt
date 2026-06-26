"use client";

import { useEffect, useRef } from "react";

// 三颗光球的屏幕标称位置（百分比）
const ORB_POSITIONS = [
  { x: 0.78, y: 0.15 },
  { x: 0.12, y: 0.78 },
  { x: 0.50, y: 0.45 },
];

export function BackgroundOrbs() {
  const gyroRef = useRef<{ a: number; b: number; g: number; t: number }>({ a: 0, b: 0, g: 0, t: 0 });
  const shakeRef = useRef(0);

  useEffect(() => {
    let mx = 0.5;
    let my = 0.5;

    function update() {
      const root = document.documentElement;
      root.style.setProperty("--orb-mx", String(mx));
      root.style.setProperty("--orb-my", String(my));

      // 驱赶：鼠标到光球的方向 → 光球反向逃逸（柔和渐变）
      for (let i = 0; i < ORB_POSITIONS.length; i++) {
        const orb = ORB_POSITIONS[i];
        const dx = mx - orb.x;
        const dy = my - orb.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        // 平滑力曲线：距离 0 → 力最大0.35，距离 0.6 → 力趋近0
        const force = dist < 0.01 ? 0 : 0.35 / (1 + dist * 8);
        const repelX = dist > 0.001 ? (dx / dist) * force : 0;
        const repelY = dist > 0.001 ? (dy / dist) * force : 0;
        root.style.setProperty(`--orb-repel-x-${i + 1}`, String(repelX));
        root.style.setProperty(`--orb-repel-y-${i + 1}`, String(repelY));

        // 接近度（距离越近值越高，用于 blur/opacity）
        const prox = Math.max(0, 1 - dist / 0.55);
        root.style.setProperty(`--orb-prox-${i + 1}`, String(prox));
      }

      // 陀螺仪抖动强度
      root.style.setProperty("--orb-shake", String(shakeRef.current));
    }

    function onMouse(e: MouseEvent) {
      mx = e.clientX / window.innerWidth;
      my = e.clientY / window.innerHeight;
      update();
    }

    function onTouch(e: TouchEvent) {
      if (e.touches.length > 0) {
        mx = e.touches[0].clientX / window.innerWidth;
        my = e.touches[0].clientY / window.innerHeight;
        update();
      }
    }

    function onOrientation(e: DeviceOrientationEvent) {
      const prev = gyroRef.current;
      const now = {
        a: e.alpha ?? 0,
        b: e.beta ?? 0,
        g: e.gamma ?? 0,
        t: Date.now(),
      };
      // 计算陀螺仪变化速率 → 抖动强度
      const dt = Math.max((now.t - prev.t) / 1000, 0.016);
      const da = Math.abs(now.a - prev.a) / dt;
      const db = Math.abs(now.b - prev.b) / dt;
      const dg = Math.abs(now.g - prev.g) / dt;
      const shake = Math.min(1, (da + db + dg) / 600);
      shakeRef.current = shake;
      gyroRef.current = now;

      // 陀螺仪倾斜 → 驱赶方向
      if (e.gamma !== null && e.beta !== null) {
        const g = Math.max(-45, Math.min(45, e.gamma ?? 0));
        const b = Math.max(-45, Math.min(45, e.beta ?? 0));
        mx = (g + 45) / 90;
        my = (b + 45) / 90;
        update();
      }
    }

    update();
    document.addEventListener("mousemove", onMouse, { passive: true });
    document.addEventListener("touchmove", onTouch, { passive: true });
    if (typeof window !== "undefined" && "ondeviceorientation" in window) {
      window.addEventListener("deviceorientation", onOrientation);
    }
    return () => {
      document.removeEventListener("mousemove", onMouse);
      document.removeEventListener("touchmove", onTouch);
      window.removeEventListener("deviceorientation", onOrientation);
      const root = document.documentElement;
      root.style.removeProperty("--orb-mx");
      root.style.removeProperty("--orb-my");
      root.style.removeProperty("--orb-shake");
      for (let i = 1; i <= 3; i++) {
        root.style.removeProperty(`--orb-repel-x-${i}`);
        root.style.removeProperty(`--orb-repel-y-${i}`);
        root.style.removeProperty(`--orb-prox-${i}`);
      }
    };
  }, []);

  return (
    <div className="bg-orbs-container" aria-hidden="true">
      <div className="bg-orb bg-orb--1"><div className="bg-orb-inner" /></div>
      <div className="bg-orb bg-orb--2"><div className="bg-orb-inner" /></div>
      <div className="bg-orb bg-orb--3"><div className="bg-orb-inner" /></div>
    </div>
  );
}
