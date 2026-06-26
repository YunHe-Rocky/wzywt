"use client";

import { useEffect, useState } from "react";

interface Props {
  cardSelector: string;
  onComplete: () => void;
}

type Phase = "hold" | "draw" | "settle" | "done";

export function CurtainDraw({ cardSelector, onComplete }: Props) {
  const [rect, setRect] = useState<{ left: number; top: number; w: number; h: number } | null>(null);
  const [phase, setPhase] = useState<Phase>("hold");

  useEffect(() => {
    const el = document.querySelector(cardSelector) as HTMLElement;
    if (!el) { onComplete(); return; }

    const r = el.getBoundingClientRect();
    setRect({ left: r.left, top: r.top, w: r.width, h: r.height });
    el.style.opacity = "0";

    // 时序：停顿 → 拉开 → 落定
    const t1 = setTimeout(() => setPhase("draw"), 200);
    const t2 = setTimeout(() => setPhase("settle"), 1600);
    const t3 = setTimeout(() => {
      setPhase("done");
      el.style.opacity = "";
      onComplete();
    }, 2000);

    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [cardSelector, onComplete]);

  if (phase === "done" || !rect) return null;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      pointerEvents: "none", overflow: "hidden",
    }}>
      {/* 左半帘 */}
      <div style={{
        position: "fixed",
        left: rect.left, top: rect.top,
        width: rect.w / 2, height: rect.h,
        background: "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, #242833 30%)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderTop: "1px solid rgba(255,255,255,0.1)",
        borderRadius: "6px 0 0 6px",
        boxShadow: "0 1px 0 rgba(255,255,255,0.04) inset",
        overflow: "hidden",
        animation: phase === "draw" ? "curtain-left 1.2s ease-in-out both" : "none",
        transition: phase === "settle" ? "opacity 0.4s" : "none",
        opacity: phase === "settle" ? 0 : 1,
      }}>
        {/* 帘边金线 */}
        <div style={{
          position: "absolute", right: 0, top: "15%", height: "70%", width: 1,
          background: "linear-gradient(180deg, transparent, #a89068, #c0b090, #a89068, transparent)",
          opacity: 0.8,
        }} />
      </div>

      {/* 右半帘 */}
      <div style={{
        position: "fixed",
        left: rect.left + rect.w / 2, top: rect.top,
        width: rect.w / 2, height: rect.h,
        background: "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, #242833 30%)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderTop: "1px solid rgba(255,255,255,0.1)",
        borderRadius: "0 6px 6px 0",
        boxShadow: "0 1px 0 rgba(255,255,255,0.04) inset",
        overflow: "hidden",
        animation: phase === "draw" ? "curtain-right 1.2s ease-in-out both" : "none",
        transition: phase === "settle" ? "opacity 0.4s" : "none",
        opacity: phase === "settle" ? 0 : 1,
      }}>
        <div style={{
          position: "absolute", left: 0, top: "15%", height: "70%", width: 1,
          background: "linear-gradient(180deg, transparent, #a89068, #c0b090, #a89068, transparent)",
          opacity: 0.8,
        }} />
      </div>

      {/* 中缝金光 */}
      <div style={{
        position: "fixed",
        left: rect.left + rect.w / 2 - 1, top: rect.top + rect.h * 0.15,
        width: 2, height: rect.h * 0.7,
        background: "linear-gradient(180deg, transparent, #c0b090, #a89068, #c0b090, transparent)",
        animation: phase === "draw" || phase === "settle" ? "curtain-glow 1.6s ease-out both" : "none",
      }} />

      {/* 帘后微光 — 卡片消失后显示 */}
      {(phase === "draw" || phase === "settle") && (
        <div style={{
          position: "fixed",
          left: rect.left, top: rect.top,
          width: rect.w, height: rect.h,
          background: "radial-gradient(ellipse at center, rgba(168,144,104,0.08) 0%, transparent 70%)",
          animation: "curtain-reveal 1.6s ease-out 0.3s both",
        }} />
      )}
    </div>
  );
}
