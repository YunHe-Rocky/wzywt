"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { GLASS_CARD, GLASS_SHADOW_TOP, GLASS_SHADOW_BOTTOM, dockPanel, childStagger, BTN_PRESS, BTN_RELEASE } from "@/engine";

const MAIN_NAV = [
  { key: "home", href: "/", label: "首页", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> },
  { key: "tournaments", href: "/tournaments", label: "赛事", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 20V10M12 20V4M6 20v-6"/></svg> },
  { key: "me", href: "/me", label: "我的", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> },
];

const SUB_NAV = [
  { key: "heroes", href: "/heroes", label: "英雄", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg> },
  { key: "equipment", href: "/equipment", label: "装备", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M12 12v0"/><circle cx="12" cy="12" r="1"/></svg> },
];

export function Dock() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [subOpen, setSubOpen] = useState(false);
  const [bounce, setBounce] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!subOpen) return;
    const handler = () => setSubOpen(false);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [subOpen]);

  const toggleSub = (e: React.MouseEvent) => {
    e.stopPropagation();
    setBounce(true);
    setTimeout(() => setBounce(false), 300);
    setSubOpen(!subOpen);
  };

  if (!mounted) return null;

  const mPrefix = pathname.startsWith("/m") ? "/m" : "";
  const href = (path: string) => mPrefix + path;

  const isActive = (path: string) => {
    const full = mPrefix + path;
    if (path === "/") return pathname === mPrefix + "/" || pathname === mPrefix;
    return pathname.startsWith(full);
  };

  const isTujianActive = isActive("/heroes") || isActive("/equipment");

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex flex-col items-center pb-3 pointer-events-none">
      {/* 二级 Dock */}
      <div style={{ display: "flex", justifyContent: "center", width: "100%" }}>
      <div
        className="pointer-events-auto flex items-end gap-0.5 px-3 py-1.5 pb-2 rounded-2xl mb-2"
        onClick={(e) => e.stopPropagation()}
        style={{ ...GLASS_CARD, ...GLASS_SHADOW_TOP, ...dockPanel(subOpen) }}
      >
          {SUB_NAV.map((item, i) => {
            const active = isActive(item.href);
            const stag = childStagger(i, 0.06);
            return (
              <div key={item.key} className="flex flex-col items-center gap-0.5 px-1.5" style={subOpen ? stag.enter : stag.exit}>
                <Link href={href(item.href)} className="flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-200"
                  style={{ background: active ? "var(--gold-alpha-08)" : "transparent", color: active ? "var(--gold)" : "#aaa" }}>
                  <span className="scale-[0.82]">{item.icon}</span>
                </Link>
                <span className="text-[9px] tracking-wide" style={{ color: active ? "var(--gold)" : "#bbb", fontWeight: active ? 600 : 400 }}>
                  {item.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 一级 Dock */}
      <div className="pointer-events-auto flex items-end gap-0.5 px-3 py-1.5 pb-2 rounded-2xl" style={{ ...GLASS_CARD, ...GLASS_SHADOW_BOTTOM }}>
        {MAIN_NAV.slice(0, 2).map((item) => (
          <div key={item.key} className="flex flex-col items-center gap-0.5 px-1.5">
            <Link href={href(item.href)} className="flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-200"
              style={{ background: isActive(item.href) ? "var(--gold-alpha-08)" : "transparent", color: isActive(item.href) ? "var(--gold)" : "#aaa" }}>
              <span className="scale-[0.82]">{item.icon}</span>
            </Link>
            <span className="text-[9px] tracking-wide" style={{ color: isActive(item.href) ? "var(--gold)" : "#bbb", fontWeight: isActive(item.href) ? 600 : 400 }}>
              {item.label}
            </span>
          </div>
        ))}

        {/* 图鉴 */}
        <div className="flex flex-col items-center gap-0.5 px-1.5">
          <button onClick={toggleSub}
            className="flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-200"
            style={{ background: isTujianActive || subOpen ? "var(--gold-alpha-08)" : "transparent", color: isTujianActive || subOpen ? "var(--gold)" : "#aaa", ...(bounce ? BTN_PRESS : BTN_RELEASE) }}>
            <span className="scale-[0.82]">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
              </svg>
            </span>
          </button>
          <span className="text-[9px] tracking-wide" style={{ color: isTujianActive || subOpen ? "var(--gold)" : "#bbb", fontWeight: isTujianActive || subOpen ? 600 : 400 }}>
            图鉴
          </span>
        </div>

        {MAIN_NAV.slice(2).map((item) => (
          <div key={item.key} className="flex flex-col items-center gap-0.5 px-1.5">
            <Link href={href(item.href)} className="flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-200"
              style={{ background: isActive(item.href) ? "var(--gold-alpha-08)" : "transparent", color: isActive(item.href) ? "var(--gold)" : "#aaa" }}>
              <span className="scale-[0.82]">{item.icon}</span>
            </Link>
            <span className="text-[9px] tracking-wide" style={{ color: isActive(item.href) ? "var(--gold)" : "#bbb", fontWeight: isActive(item.href) ? 600 : 400 }}>
              {item.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
