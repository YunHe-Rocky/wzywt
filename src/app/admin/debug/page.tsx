"use client";

import { useEffect, useState } from "react";

export default function GyroTest() {
  const [gyro, setGyro] = useState({ a: 0, b: 0, g: 0 });
  const [hasEvent, setHasEvent] = useState(false);
  const [permission, setPermission] = useState<string>("unknown");
  const [shake, setShake] = useState(0);

  useEffect(() => {
    // 检查 API 是否存在
    if (typeof DeviceOrientationEvent !== "undefined") {
      setPermission("supported");
    } else {
      setPermission("not-supported");
      return;
    }

    let last = { a: 0, b: 0, g: 0, t: Date.now() };

    function handler(e: DeviceOrientationEvent) {
      setHasEvent(true);
      const now = { a: e.alpha ?? 0, b: e.beta ?? 0, g: e.gamma ?? 0, t: Date.now() };
      setGyro({ a: now.a, b: now.b, g: now.g });

      const dt = Math.max((now.t - last.t) / 1000, 0.016);
      const da = Math.abs(now.a - last.a) / dt;
      const db = Math.abs(now.b - last.b) / dt;
      const dg = Math.abs(now.g - last.g) / dt;
      setShake(Math.min(1, (da + db + dg) / 600));
      last = now;
    }

    // iOS 13+ 需要主动请求权限
    if (
      typeof (DeviceOrientationEvent as any).requestPermission === "function"
    ) {
      setPermission("needs-permission");
    } else {
      window.addEventListener("deviceorientation", handler);
      setPermission("listening");
    }

    return () => {
      window.removeEventListener("deviceorientation", handler);
    };
  }, []);

  function requestPermission() {
    (DeviceOrientationEvent as any)
      .requestPermission()
      .then((state: string) => {
        setPermission(state);
        if (state === "granted") {
          window.addEventListener("deviceorientation", (e: DeviceOrientationEvent) => {
            setHasEvent(true);
            setGyro({ a: e.alpha ?? 0, b: e.beta ?? 0, g: e.gamma ?? 0 });
          });
        }
      })
      .catch(console.error);
  }

  return (
    <div style={{
      minHeight: "100vh", background: "#0a0a14", color: "#e8e8f0",
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", padding: 40, fontFamily: "monospace",
    }}>
      <h1 style={{ fontSize: 20, marginBottom: 24 }}>陀螺仪调试面板</h1>

      <div style={{
        background: "#141428", border: "2px solid #333",
        padding: "24px 32px", borderRadius: 8, minWidth: 300,
        display: "flex", flexDirection: "column", gap: 16,
      }}>
        <Row label="API 状态" value={permission} color={
          permission === "listening" ? "#76ff03" :
          permission === "needs-permission" ? "#ffdb58" :
          permission === "granted" ? "#76ff03" : "#e63946"
        } />
        <Row label="事件触发" value={hasEvent ? "YES" : "NO"} color={hasEvent ? "#76ff03" : "#e63946"} />
        <hr style={{ border: "none", borderTop: "1px solid #333", width: "100%" }} />
        <Row label="alpha (Z轴转)" value={gyro.a.toFixed(1) + "°"} color="#00e5ff" />
        <Row label="beta  (X轴倾)" value={gyro.b.toFixed(1) + "°"} color="#ff4088" />
        <Row label="gamma (Y轴倾)" value={gyro.g.toFixed(1) + "°"} color="#ff6b35" />
        <Row label="抖动强度" value={(shake * 100).toFixed(0) + "%"} color={shake > 0.5 ? "#ff4088" : "#888"} />
      </div>

      {permission === "needs-permission" && (
        <button onClick={requestPermission} style={{
          marginTop: 20, padding: "12px 32px",
          fontSize: 16, fontWeight: 700,
          background: "#ffdb58", color: "#1a1a1a",
          border: "2px solid #1a1a1a", cursor: "pointer",
        }}>
          请求陀螺仪权限 (iOS 13+)
        </button>
      )}

      {/* 光球模拟 */}
      <div style={{
        marginTop: 30, width: 260, height: 260,
        position: "relative", background: "#141428",
        border: "1px solid #333", borderRadius: 8,
        overflow: "hidden",
      }}>
        <div style={{
          width: 80, height: 80, borderRadius: "50%",
          background: "radial-gradient(circle, #ff6b35 0%, transparent 70%)",
          filter: "blur(20px)", opacity: 0.7,
          position: "absolute",
          left: `calc(50% + ${gyro.g * 3}px)`,
          top: `calc(50% + ${gyro.b * 3}px)`,
          transform: "translate(-50%, -50%)",
          transition: "left 0.1s, top 0.1s",
        }} />
        <div style={{
          position: "absolute", bottom: 8, left: 0, right: 0,
          textAlign: "center", fontSize: 10, color: "#666",
        }}>
          倾斜手机 → 光球移动
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 20 }}>
      <span style={{ color: "#888", fontSize: 13 }}>{label}</span>
      <span style={{ color, fontWeight: 700, fontSize: 13 }}>{value}</span>
    </div>
  );
}
