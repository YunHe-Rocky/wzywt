"use client";

import { useEffect, useState } from "react";
import { useTheme } from "@/themes/ThemeProvider";
import { useSearchParams } from "next/navigation";

// ── #1 首页入场：暗幕淡出 + 金焰浮现 ──
function YanwuEntrance({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<"cover" | "fade" | "done">("cover");

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("fade"), 50);
    const t2 = setTimeout(() => setPhase("done"), 250);
    const t3 = setTimeout(onDone, 300);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onDone]);

  if (phase === "done") return null;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 999, pointerEvents: "none",
      background: "radial-gradient(ellipse at 50% 40%, rgba(22,25,32,0.95) 0%, #0d0f14 100%)",
      opacity: phase === "fade" ? 0 : 1,
      transition: "opacity 0.4s ease-out",
    }}>
      {/* 中心金焰余韵 */}
      <div style={{
        position: "absolute", left: "50%", top: "42%", transform: "translate(-50%, -50%)",
        width: 60, height: 60,
        background: "radial-gradient(circle, rgba(168,144,104,0.15), transparent 70%)",
        borderRadius: "50%",
        opacity: phase === "fade" ? 0 : 0.6,
        transition: "opacity 0.3s",
      }} />
    </div>
  );
}

// ── #2 首页入场：玻璃余韵 ──
function GlassEntrance({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<"frost" | "fade" | "done">("frost");

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("fade"), 100);
    const t2 = setTimeout(() => setPhase("done"), 800);
    const t3 = setTimeout(onDone, 900);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onDone]);

  if (phase === "done") return null;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 999, pointerEvents: "none",
      background: "rgba(255,255,255,0.6)",
      backdropFilter: phase === "fade" ? "blur(0px)" : "blur(16px)",
      WebkitBackdropFilter: phase === "fade" ? "blur(0px)" : "blur(16px)",
      opacity: phase === "fade" ? 0 : 1,
      transition: "opacity 0.5s ease-out, backdrop-filter 0.5s ease-out",
    }} />
  );
}

export function LoginReveal() {
  const { theme } = useTheme();
  const searchParams = useSearchParams();
  const from = searchParams.get("_from");
  const [done, setDone] = useState(from !== "login");

  if (done) return null;

  return theme === "alternate"
    ? <GlassEntrance onDone={() => setDone(true)} />
    : <YanwuEntrance onDone={() => setDone(true)} />;
}
