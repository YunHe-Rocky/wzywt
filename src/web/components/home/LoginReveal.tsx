"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

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
      position: "fixed", inset: 0, zIndex: "var(--layer-transition)", pointerEvents: "none",
      background: "rgba(255,255,255,0.6)",
      backdropFilter: phase === "fade" ? "blur(0px)" : "blur(16px)",
      WebkitBackdropFilter: phase === "fade" ? "blur(0px)" : "blur(16px)",
      opacity: phase === "fade" ? 0 : 1,
      transition: "opacity 0.5s ease-out, backdrop-filter 0.5s ease-out",
    }} />
  );
}

export function LoginReveal() {
  const searchParams = useSearchParams();
  const from = searchParams.get("_from");
  const [done, setDone] = useState(from !== "login");

  if (done) return null;

  return <GlassEntrance onDone={() => setDone(true)} />;
}
