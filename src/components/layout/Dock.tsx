"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "@/themes/ThemeProvider";

const NAV = [
  {
    href: "/",
    label: "首页",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
        <polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
    ),
  },
  {
    href: "/tournaments",
    label: "赛事",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 20V10M12 20V4M6 20v-6"/>
      </svg>
    ),
  },
  {
    href: "/heroes",
    label: "英雄",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <circle cx="12" cy="12" r="6"/>
        <circle cx="12" cy="12" r="2"/>
      </svg>
    ),
  },
  {
    href: "/me",
    label: "我的",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
        <circle cx="12" cy="7" r="4"/>
      </svg>
    ),
  },
];

export function Dock() {
  const { theme } = useTheme();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  if (!mounted) return null;

  const isYanwu = theme === "yanwu";
  const accent = isYanwu ? "var(--gold)" : "var(--gold)";
  const accentBg = isYanwu ? "var(--gold-alpha-08)" : "var(--gold-alpha-08)";

  // 检测是否在 /m 路由下，自动适配链接
  const mPrefix = pathname.startsWith("/m") ? "/m" : "";

  const isActive = (href: string) => {
    const fullHref = mPrefix + href;
    if (href === "/") return pathname === mPrefix + "/" || pathname === mPrefix;
    return pathname.startsWith(fullHref);
  };

  const dockBg = isYanwu
    ? "rgba(30,33,42,0.85)"
    : "rgba(255,255,255,0.45)";
  const dockBorder = isYanwu
    ? "1px solid rgba(255,255,255,0.08)"
    : "1px solid rgba(255,255,255,0.6)";
  const dockShadow = isYanwu
    ? "inset 0 1px 0 rgba(255,255,255,0.04), 0 4px 20px rgba(0,0,0,0.4)"
    : "inset 0 1px 0 rgba(255,255,255,0.4), 0 4px 20px rgba(0,0,0,0.06), 0 8px 40px rgba(0,0,0,0.04)";

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center pb-3 pointer-events-none">
      <div
        className="pointer-events-auto flex items-end gap-0.5 px-3 py-1.5 pb-2 rounded-2xl"
        style={{
          background: dockBg,
          backdropFilter: "blur(40px)",
          WebkitBackdropFilter: "blur(40px)",
          border: dockBorder,
          borderBottom: isYanwu ? "1px solid rgba(255,255,255,0.04)" : "1px solid rgba(0,0,0,0.1)",
          boxShadow: dockShadow,
        }}
      >
        {NAV.map((item) => (
          <div key={item.href} className="flex flex-col items-center gap-0.5 px-1.5">
            <Link
              href={mPrefix + item.href}
              className="flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-200"
              style={{
                background: isActive(item.href) ? accentBg : "transparent",
                color: isActive(item.href) ? accent : isYanwu ? "var(--text-muted)" : "#aaa",
              }}
            >
              <span className="scale-[0.82]">{item.icon}</span>
            </Link>
            <span
              className="text-[9px] tracking-wide"
              style={{
                color: isActive(item.href) ? accent : isYanwu ? "var(--text-muted)" : "#bbb",
                fontWeight: isActive(item.href) ? 600 : 400,
              }}
            >
              {item.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
