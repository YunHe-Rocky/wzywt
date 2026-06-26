"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useTheme } from "@/themes/ThemeProvider";

export default function PageTemplate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { theme } = useTheme();
  const isAlt = theme === "alternate";
  const [visible, setVisible] = useState(false);

  // 每次路径变化：先隐藏 → 下一帧显示 → 触发动画
  useEffect(() => {
    setVisible(false);
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, [pathname]);

  return (
    <div
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : `translateY(${isAlt ? 14 : 10}px)`,
        transition: isAlt
          ? "opacity 0.3s ease-out, transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)"
          : "opacity 0.25s ease-out, transform 0.3s ease-out",
      }}
    >
      {children}
    </div>
  );
}
