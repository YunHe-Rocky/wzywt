"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export default function PageTemplate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(false);
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, [pathname]);

  return (
    <div
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(6px)",
        transition: "opacity 0.15s ease-out, transform 0.18s ease-out",
      }}
    >
      {children}
    </div>
  );
}
