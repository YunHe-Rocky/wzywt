"use client";

import { useState } from "react";

const PALETTES = [
  {
    name: "当前（蓝紫系）",
    colors: ["#4488f0", "#6068f0", "#3898d8"],
  },
  {
    name: "暖日落",
    colors: ["#ff6b6b", "#ffa07a", "#ffeaa7"],
  },
  {
    name: "极光",
    colors: ["#00b894", "#74b9ff", "#a29bfe"],
  },
  {
    name: "糖果撞色",
    colors: ["#ff7675", "#00cec9", "#fdcb6e"],
  },
  {
    name: "紫金",
    colors: ["#e17055", "#6c5ce7", "#fdcb6e"],
  },
  {
    name: "深海",
    colors: ["#0077b6", "#00b4d8", "#90e0ef"],
  },
];

export default function OrbColorDemo() {
  const [selected, setSelected] = useState(0);
  const p = PALETTES[selected];

  return (
    <div style={{
      minHeight: "100vh", background: "#efeff2",
      display: "flex", flexDirection: "column",
      alignItems: "center", padding: "24px 16px",
    }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: "#333", margin: "0 0 4px" }}>
        #2 光球配色预览
      </h1>
      <p style={{ fontSize: 13, color: "#888", margin: "0 0 20px" }}>
        点击切换配色，晃动鼠标看光球互动效果
      </p>

      {/* 色板选择 */}
      <div style={{ display: "flex", gap: 6, marginBottom: 24, flexWrap: "wrap", justifyContent: "center" }}>
        {PALETTES.map((pal, i) => (
          <button key={i} onClick={() => setSelected(i)} style={{
            padding: "8px 14px", fontSize: 12, fontWeight: i === selected ? 800 : 500,
            border: i === selected ? "2px solid #333" : "1px solid #ddd",
            borderRadius: 12, cursor: "pointer",
            background: i === selected ? "#fff" : "transparent",
            color: "#333",
          }}>
            <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
              {pal.colors.map(c => (
                <span key={c} style={{
                  width: 14, height: 14, borderRadius: "50%",
                  background: c, display: "inline-block",
                  border: "1px solid rgba(0,0,0,0.1)",
                }} />
              ))}
              <span style={{ marginLeft: 4 }}>{pal.name}</span>
            </span>
          </button>
        ))}
      </div>

      {/* 光球预览区 */}
      <div id="orb-preview" style={{
        width: "100%", maxWidth: 500, height: 400,
        background: "#efeff2", borderRadius: 16, overflow: "hidden",
        position: "relative",
        border: "1px solid rgba(0,0,0,0.06)",
        boxShadow: "0 4px 24px rgba(0,0,0,0.04)",
      }}>
        {/* Orb 1 - 右上 */}
        <div style={{
          position: "absolute",
          width: 300, height: 300,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${p.colors[0]} 0%, ${p.colors[0]}88 35%, transparent 70%)`,
          filter: "blur(50px)", opacity: 0.7,
          top: "-20%", right: "-15%",
        }} />
        {/* Orb 2 - 左下 */}
        <div style={{
          position: "absolute",
          width: 240, height: 240,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${p.colors[1]} 0%, ${p.colors[1]}88 35%, transparent 70%)`,
          filter: "blur(45px)", opacity: 0.65,
          bottom: "-15%", left: "-10%",
        }} />
        {/* Orb 3 - 中间 */}
        <div style={{
          position: "absolute",
          width: 200, height: 200,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${p.colors[2]} 0%, ${p.colors[2]}88 35%, transparent 70%)`,
          filter: "blur(40px)", opacity: 0.6,
          top: "35%", left: "45%",
        }} />

        {/* 模拟卡片 */}
        <div style={{
          position: "absolute", top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          width: "70%", padding: 20,
          background: "rgba(255,255,255,0.45)",
          backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
          borderRadius: 16,
          border: "1px solid rgba(255,255,255,0.6)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.5), 0 4px 16px rgba(0,0,0,0.04)",
          textAlign: "center",
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#4488f0", marginBottom: 4 }}>
            王者演武堂
          </div>
          <div style={{ fontSize: 12, color: "#888" }}>
            {p.name} · {p.colors[0]} {p.colors[1]} {p.colors[2]}
          </div>
        </div>
      </div>
    </div>
  );
}
