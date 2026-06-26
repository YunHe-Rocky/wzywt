"use client";

import { useEffect, useState } from "react";

interface Shard {
  id: number;
  /** 相对于卡片左上角的像素位置 */
  x: number; y: number;
  w: number; h: number;
  clip: number;
  dx: number; dy: number;
  rotation: number;
  delay: number;
  duration: number;
}

const CLIPS = [
  "polygon(0 0, 100% 0, 0 100%)",
  "polygon(100% 0, 100% 100%, 0 0)",
  "polygon(0 100%, 100% 100%, 0 0)",
  "polygon(100% 0, 100% 100%, 0 100%)",
];

interface Props {
  cardSelector: string;
  onComplete: () => void;
}

type Phase = "crack" | "shatter" | "settle" | "done";

export function GlassShatter({ cardSelector, onComplete }: Props) {
  const [shards, setShards] = useState<Shard[]>([]);
  const [cardRect, setCardRect] = useState<{ left: number; top: number; w: number; h: number } | null>(null);
  const [phase, setPhase] = useState<Phase>("crack");

  useEffect(() => {
    const el = document.querySelector(cardSelector) as HTMLElement;
    if (!el) { onComplete(); return; }

    const rect = el.getBoundingClientRect();
    setCardRect({ left: rect.left, top: rect.top, w: rect.width, h: rect.height });

    // 隐藏原卡片
    el.style.opacity = "0";
    el.style.transition = "opacity 0.15s";

    // 生成碎片
    const cols = 10, rows = 6;
    const cellW = rect.width / cols;
    const cellH = rect.height / rows;
    const fragments: Shard[] = [];
    const cx = rect.width / 2;
    const cy = rect.height / 3; // 爆破中心偏上

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const fx = (c + 0.5) * cellW + (Math.random() - 0.5) * cellW * 0.3;
        const fy = (r + 0.5) * cellH + (Math.random() - 0.5) * cellH * 0.3;
        const fromX = fx - cx;
        const fromY = fy - cy;
        const dist = Math.sqrt(fromX * fromX + fromY * fromY) || 1;
        const speed = 0.4 + Math.random() * 0.8;
        fragments.push({
          id: r * cols + c,
          x: fx - cellW / 2, y: fy - cellH / 2,
          w: cellW + 2, h: cellH + 2,
          clip: (r * 3 + c * 7) % 4,
          dx: (fromX / dist) * speed * (80 + Math.random() * 160),
          dy: (fromY / dist) * speed * (40 + Math.random() * 80) + 120,
          rotation: (Math.random() - 0.5) * 540,
          delay: Math.random() * 0.1 + r * 0.025,
          duration: 1.0 + Math.random() * 0.7,
        });
      }
    }
    setShards(fragments);

    // 阶段时序
    const t1 = setTimeout(() => setPhase("shatter"), 300);
    const maxT = 2.2;
    const t2 = setTimeout(() => {
      setPhase("settle");
      // 恢复原卡片透明度
      if (el) el.style.opacity = "";
    }, 300 + maxT * 1000);
    const t3 = setTimeout(() => { setPhase("done"); onComplete(); }, 300 + maxT * 1000 + 600);

    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [cardSelector, onComplete]);

  if (phase === "done" || !cardRect) return null;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      pointerEvents: "none", overflow: "hidden",
    }}>
      {/* 裂纹：仅在卡片区域内 */}
      {phase === "crack" && (
        <div style={{
          position: "fixed",
          left: cardRect.left, top: cardRect.top,
          width: cardRect.w, height: cardRect.h,
          background: "rgba(255,255,255,0.55)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderRadius: 16,
          border: "1px solid rgba(255,255,255,0.6)",
        }}>
          <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
            {Array.from({ length: 20 }).map((_, i) => {
              const x1 = Math.random() * 100;
              const y1 = Math.random() * 100;
              const x2 = x1 + (Math.random() - 0.5) * 40;
              const y2 = y1 + (Math.random() - 0.5) * 40;
              return (
                <line key={i} x1={`${x1}%`} y1={`${y1}%`} x2={`${x2}%`} y2={`${y2}%`}
                  stroke="rgba(255,255,255,0.7)" strokeWidth="0.8"
                  style={{ animation: `crack-line-in 0.25s ease-out ${i * 0.015}s both` }} />
              );
            })}
          </svg>
        </div>
      )}

      {/* 碎片 */}
      {phase === "shatter" && shards.map(s => (
        <div key={s.id} style={{
          position: "fixed",
          left: cardRect.left + s.x + s.w / 2,
          top: cardRect.top + s.y + s.h / 2,
          width: s.w, height: s.h,
          transform: "translate(-50%, -50%)",
        }}>
          <div style={{
            width: "100%", height: "100%",
            background: "linear-gradient(160deg, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.18) 50%, rgba(255,255,255,0.35) 100%)",
            clipPath: CLIPS[s.clip],
            border: "1px solid rgba(255,255,255,0.6)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.7), 0 0 4px rgba(255,255,255,0.3)",
            animation: `glass-burst ${s.duration}s ease-out ${s.delay}s both`,
            ["--dx" as string]: `${s.dx}px`,
            ["--dy" as string]: `${s.dy}px`,
            ["--rot" as string]: `${s.rotation}deg`,
          }} />
        </div>
      ))}
    </div>
  );
}
