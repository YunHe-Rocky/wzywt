"use client";

import { useState } from "react";

type EffectName = "dissolve" | "curtain" | "armor" | "ink" | "crack";

const EFFECTS: { id: EffectName; label: string; desc: string }[] = [
  { id: "dissolve", label: "金焰崩解", desc: "金焰粒子从中心扩散飘散" },
  { id: "curtain",  label: "帷幔拉开", desc: "卡片从中线裂开向两侧滑出" },
  { id: "armor",    label: "碎甲散落", desc: "裂成暗色金属片向下坠落" },
  { id: "ink",      label: "墨染扩散", desc: "暗色墨迹从中心扩散吞噬卡片" },
  { id: "crack",    label: "金纹崩裂", desc: "金色裂纹蔓延后炸裂成碎片" },
];

// ========== 粒子生成器 ==========

function dissolveParticles(count: number, w: number, h: number) {
  const cx = w / 2, cy = h / 2;
  return Array.from({ length: count }, (_, i) => {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * Math.max(w, h) * 0.7;
    return {
      id: i, x: cx + Math.cos(angle) * 8, y: cy + Math.sin(angle) * 8,
      size: 2 + Math.random() * 5,
      dx: Math.cos(angle) * dist * (0.5 + Math.random()),
      dy: Math.sin(angle) * dist * (0.5 + Math.random()) - 40,
      delay: Math.random() * 0.3, duration: 1.2 + Math.random() * 0.8,
      opacity: 0.5 + Math.random() * 0.5,
    };
  });
}

function armorShards(cols: number, rows: number, w: number, h: number) {
  const cw = w / cols, ch = h / rows;
  const shards: any[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      shards.push({
        id: r * cols + c,
        x: c * cw, y: r * ch, w: cw + 2, h: ch + 2,
        dx: (Math.random() - 0.5) * 200,
        dy: 150 + Math.random() * 300,
        rotation: (Math.random() - 0.5) * 360,
        delay: Math.random() * 0.12 + r * 0.03,
        duration: 0.9 + Math.random() * 0.6,
      });
    }
  }
  return shards;
}

function crackShards(cols: number, rows: number, w: number, h: number) {
  const cw = w / cols, ch = h / rows;
  const cx = w / 2, cy = h / 3;
  const shards: any[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const fx = c * cw + cw / 2, fy = r * ch + ch / 2;
      const dx = fx - cx, dy = fy - cy;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const speed = 0.5 + Math.random();
      shards.push({
        id: r * cols + c,
        x: c * cw, y: r * ch, w: cw + 2, h: ch + 2,
        dx: (dx / dist) * speed * (100 + Math.random() * 180),
        dy: (dy / dist) * speed * (60 + Math.random() * 100),
        rotation: (Math.random() - 0.5) * 720,
        delay: Math.random() * 0.08 + r * 0.02,
        duration: 1.0 + Math.random() * 0.7,
      });
    }
  }
  return shards;
}

// ========== 效果组件 ==========

function DissolveEffect({ w, h }: { w: number; h: number }) {
  const [ps] = useState(() => dissolveParticles(80, w, h));
  return (
    <>
      {ps.map(p => (
        <div key={p.id} style={{
          position: "absolute", left: p.x, top: p.y,
          width: p.size, height: p.size, borderRadius: "50%",
          background: `radial-gradient(circle, rgba(192,176,144,${p.opacity}) 0%, rgba(168,144,104,${p.opacity * 0.4}) 60%, transparent 100%)`,
          boxShadow: `0 0 ${p.size * 3}px rgba(168,144,104,${p.opacity * 0.5})`,
          animation: `effect-dissolve ${p.duration}s ease-out ${p.delay}s both`,
          ["--dx" as string]: `${p.dx}px`, ["--dy" as string]: `${p.dy}px`,
        }} />
      ))}
      <div style={{
        position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)",
        width: 8, height: 8, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(192,176,144,0.9), transparent 80%)",
        boxShadow: "0 0 60px rgba(168,144,104,0.8), 0 0 120px rgba(168,144,104,0.4)",
        animation: "effect-flash 1.8s ease-out both",
      }} />
    </>
  );
}

function CurtainEffect({ w, h }: { w: number; h: number }) {
  return (
    <>
      <div style={{
        position: "absolute", left: 0, top: 0, width: "50%", height: "100%",
        background: "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, #242833 30%)",
        border: "1px solid rgba(255,255,255,0.08)", borderTop: "1px solid rgba(255,255,255,0.1)",
        borderRadius: "6px 0 0 6px", overflow: "hidden",
        animation: "effect-curtain-left 1.2s ease-in-out 0.1s both",
      }}>
        <div style={{ position: "absolute", top: "50%", right: 0, width: 2, height: 60, background: "linear-gradient(180deg, transparent, #a89068, transparent)", opacity: 0.6 }} />
      </div>
      <div style={{
        position: "absolute", right: 0, top: 0, width: "50%", height: "100%",
        background: "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, #242833 30%)",
        border: "1px solid rgba(255,255,255,0.08)", borderTop: "1px solid rgba(255,255,255,0.1)",
        borderRadius: "0 6px 6px 0", overflow: "hidden",
        animation: "effect-curtain-right 1.2s ease-in-out 0.1s both",
      }}>
        <div style={{ position: "absolute", top: "50%", left: 0, width: 2, height: 60, background: "linear-gradient(180deg, transparent, #a89068, transparent)", opacity: 0.6 }} />
      </div>
      {/* 中缝金光 */}
      <div style={{
        position: "absolute", left: "50%", top: "20%", height: "60%",
        width: 2, transform: "translateX(-50%)",
        background: "linear-gradient(180deg, transparent, #c0b090, #a89068, #c0b090, transparent)",
        animation: "effect-fade-out 1.5s ease-out 0.1s both",
      }} />
    </>
  );
}

function ArmorEffect({ w, h }: { w: number; h: number }) {
  const [shards] = useState(() => armorShards(8, 5, w, h));
  return (
    <>
      {shards.map(s => (
        <div key={s.id} style={{
          position: "absolute", left: s.x, top: s.y, width: s.w, height: s.h,
          animation: `effect-armor ${s.duration}s ease-in ${s.delay}s both`,
          ["--dx" as string]: `${s.dx}px`, ["--dy" as string]: `${s.dy}px`, ["--rot" as string]: `${s.rotation}deg`,
        }}>
          <div style={{
            width: "100%", height: "100%",
            background: "linear-gradient(160deg, #2d3240 0%, #1b1e27 60%, #242833 100%)",
            border: "1px solid rgba(168,144,104,0.15)",
            boxShadow: "0 2px 4px rgba(0,0,0,0.3)",
          }} />
        </div>
      ))}
    </>
  );
}

function InkEffect({ w, h }: { w: number; h: number }) {
  return (
    <div style={{
      position: "absolute", inset: -20,
      background: "radial-gradient(ellipse at center, #0d0f14 0%, #161920 40%, transparent 70%)",
      animation: "effect-ink 1.8s ease-out both",
    }} />
  );
}

function CrackEffect({ w, h }: { w: number; h: number }) {
  const [shards] = useState(() => crackShards(10, 6, w, h));
  const [lines] = useState(() =>
    Array.from({ length: 15 }, (_, i) => ({
      id: i, x1: Math.random() * w, y1: Math.random() * h,
      x2: Math.random() * w, y2: Math.random() * h,
    }))
  );
  return (
    <>
      {/* 金纹裂纹 */}
      <svg style={{ position: "absolute", inset: 0, width: w, height: h, overflow: "visible" }}>
        {lines.map(l => (
          <line key={l.id} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
            stroke="#c0b090" strokeWidth="1.5" opacity="0.8"
            style={{ animation: `effect-crack-glow 0.4s ease-out ${l.id * 0.03}s both` }} />
        ))}
      </svg>
      {shards.map((s, i) => (
        <div key={s.id} style={{
          position: "absolute", left: s.x, top: s.y, width: s.w, height: s.h,
          animation: `effect-burst ${s.duration}s ease-out ${s.delay + 0.3}s both`,
          ["--dx" as string]: `${s.dx}px`, ["--dy" as string]: `${s.dy}px`, ["--rot" as string]: `${s.rotation}deg`,
        }}>
          <div style={{
            width: "100%", height: "100%",
            background: "linear-gradient(160deg, #242833 0%, #1b1e27 100%)",
            border: "1px solid rgba(168,144,104,0.3)",
            boxShadow: "0 0 4px rgba(168,144,104,0.2)",
          }} />
        </div>
      ))}
      {/* 裂心金光 */}
      <div style={{
        position: "absolute", left: "50%", top: "40%", transform: "translate(-50%, -50%)",
        width: 4, height: 4, borderRadius: "50%",
        background: "radial-gradient(circle, #c0b090, transparent 60%)",
        boxShadow: "0 0 80px rgba(168,144,104,0.6)",
        animation: "effect-flash 0.8s ease-out 0.3s both",
      }} />
    </>
  );
}

// ========== 主页面 ==========

export default function LoginEffectDemo() {
  const [effect, setEffect] = useState<EffectName>("dissolve");
  const [phase, setPhase] = useState<"idle" | "playing" | "done">("idle");
  const [key, setKey] = useState(0);
  const cardW = 420, cardH = 420;

  function trigger() {
    setPhase("playing");
    setTimeout(() => setPhase("done"), 2200);
  }

  function reset() {
    setPhase("idle");
    setKey(k => k + 1);
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "#161920",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: "40px 20px",
    }}>
      <div className="bg-orbs-container" aria-hidden="true">
        <div className="bg-orb bg-orb--1" />
        <div className="bg-orb bg-orb--2" />
        <div className="bg-orb bg-orb--3" />
      </div>

      <div style={{ position: "relative", zIndex: 1 }}>
        {/* 标题 */}
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#c0b090", margin: "0 0 4px", letterSpacing: 2 }}>
            #1 演武 · 登录过渡效果预览
          </h1>
          <p style={{ fontSize: 13, color: "#777b88", margin: 0 }}>
            切换下方效果类型 → 点击登录按钮触发
          </p>
        </div>

        {/* 效果选择器 */}
        <div style={{
          display: "flex", gap: 6, marginBottom: 24,
          justifyContent: "center", flexWrap: "wrap",
        }}>
          {EFFECTS.map(e => (
            <button key={e.id} onClick={() => { reset(); setEffect(e.id); }}
              disabled={phase === "playing"}
              style={{
                padding: "8px 16px", fontSize: 12, fontWeight: effect === e.id ? 800 : 500,
                border: effect === e.id ? "1px solid #a89068" : "1px solid rgba(255,255,255,0.08)",
                borderRadius: 6, cursor: phase === "playing" ? "not-allowed" : "pointer",
                background: effect === e.id ? "rgba(168,144,104,0.12)" : "transparent",
                color: effect === e.id ? "#c0b090" : "#777b88",
                opacity: phase === "playing" ? 0.5 : 1,
              }}>
              {e.label}
            </button>
          ))}
        </div>

        {/* 效果说明 */}
        <div style={{
          textAlign: "center", marginBottom: 20,
          fontSize: 12, color: "#777b88",
          maxWidth: 400, margin: "0 auto 20px",
        }}>
          {EFFECTS.find(e => e.id === effect)?.desc}
        </div>

        {/* 卡片区域 */}
        <div key={key} style={{ width: cardW, height: cardH, position: "relative" }}>
          {/* 登录卡片 */}
          <div style={{
            width: "100%", height: "100%",
            background: "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, #242833 30%)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderTop: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 6,
            boxShadow: "0 1px 0 rgba(255,255,255,0.04) inset, 0 2px 8px rgba(0,0,0,0.15)",
            padding: "36px 32px",
            display: "flex", flexDirection: "column",
            opacity: phase !== "idle" ? 0 : 1,
            transition: "opacity 0.15s",
            position: "relative", overflow: "hidden",
          }}>
            <div style={{
              position: "absolute", top: -40, left: "50%", transform: "translateX(-50%)",
              width: 200, height: 80,
              background: "radial-gradient(ellipse, rgba(168,144,104,0.1), transparent)",
              pointerEvents: "none",
            }} />
            <h2 style={{ fontSize: 24, fontWeight: 800, color: "#c0b090", textAlign: "center", margin: "0 0 4px", letterSpacing: 2 }}>登录</h2>
            <p style={{ fontSize: 13, color: "#777b88", textAlign: "center", margin: "0 0 20px" }}>重返演武战场</p>

            <div style={{ background: "#2a2f3b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: "10px 14px", marginBottom: 12, fontSize: 13, color: "#555" }}>召唤师名称</div>
            <div style={{ background: "#2a2f3b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: "10px 14px", marginBottom: 20, fontSize: 13, color: "#555" }}>·············</div>

            <button onClick={trigger} disabled={phase !== "idle"} style={{
              width: "100%", padding: "14px",
              background: "linear-gradient(180deg, #c0b090 0%, #a89068 50%, #807050 100%)",
              border: "none", borderRadius: 6, color: "#fff",
              fontSize: 15, fontWeight: 700, cursor: phase !== "idle" ? "not-allowed" : "pointer",
              letterSpacing: 2,
              boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
              opacity: phase !== "idle" ? 0.5 : 1,
            }}>登  录</button>

            <div style={{ textAlign: "center", marginTop: 20 }}>
              <span style={{ fontSize: 13, color: "#807050" }}>没有账号？前往注册</span>
            </div>
            <div style={{ position: "absolute", bottom: 0, left: "5%", right: "5%", height: 1, background: "linear-gradient(90deg, transparent, rgba(168,144,104,0.25), transparent)" }} />
          </div>

          {/* 效果层 */}
          <div style={{ position: "absolute", inset: 0, overflow: "visible", pointerEvents: "none" }}>
            {phase === "playing" && effect === "dissolve" && <DissolveEffect w={cardW} h={cardH} />}
            {phase === "playing" && effect === "curtain" && <CurtainEffect w={cardW} h={cardH} />}
            {phase === "playing" && effect === "armor" && <ArmorEffect w={cardW} h={cardH} />}
            {phase === "playing" && effect === "ink" && <InkEffect w={cardW} h={cardH} />}
            {phase === "playing" && effect === "crack" && <CrackEffect w={cardW} h={cardH} />}
          </div>
        </div>

        {/* 模拟首页 */}
        {phase === "done" && (
          <div style={{ maxWidth: 500, margin: "24px auto 0", animation: "slide-up 0.5s ease-out 0.2s both" }}>
            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: "#c0b090", letterSpacing: 2, margin: "0 0 4px" }}>王者演武堂</h2>
              <p style={{ fontSize: 13, color: "#b0b4be", margin: 0 }}>5V5 内战分队 · 公平竞技</p>
            </div>
            <div className="card" style={{ padding: 18, marginBottom: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#c0b090", marginBottom: 6 }}>📢 系统公告</div>
              <div style={{ fontSize: 13, color: "#b0b4be" }}>欢迎来到王者演武堂</div>
            </div>
            <div className="card" style={{ padding: 18 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#c0b090", marginBottom: 6 }}>🏠 公开房间</div>
              <div style={{ fontSize: 13, color: "#b0b4be" }}>暂无公开房间</div>
            </div>
          </div>
        )}

        {phase === "done" && (
          <div style={{ textAlign: "center", marginTop: 16 }}>
            <button onClick={reset} style={{
              padding: "8px 20px", background: "transparent",
              border: "1px solid rgba(168,144,104,0.2)", borderRadius: 6,
              color: "#807050", cursor: "pointer", fontSize: 13, fontWeight: 600,
            }}>重新演示</button>
          </div>
        )}
      </div>
    </div>
  );
}
