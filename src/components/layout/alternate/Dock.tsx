"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "首页", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> },
  { href: "/tournaments", label: "赛事", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 20V10M12 20V4M6 20v-6"/></svg> },
  { href: "/heroes", label: "英雄", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg> },
  { href: "/me", label: "我的", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> },
];

export function Dock() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [hash, setHash] = useState("");
  useEffect(() => {
    setMounted(true);
    setHash(window.location.hash);
    const onHash = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  if (!mounted) return null;

  const mPrefix = pathname.startsWith("/m") ? "/m" : "";
  const href = (path: string) => mPrefix + path + hash;

  const isActive = (path: string) => {
    const full = mPrefix + path;
    if (path === "/") return pathname === mPrefix + "/" || pathname === mPrefix;
    return pathname.startsWith(full);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center pb-3 pointer-events-none">
      <div className="pointer-events-auto flex items-end gap-0.5 px-3 py-1.5 pb-2 rounded-2xl"
        style={{ background: "rgba(255,255,255,0.45)", backdropFilter: "blur(40px)", WebkitBackdropFilter: "blur(40px)", border: "1px solid rgba(255,255,255,0.6)", borderBottom: "1px solid rgba(0,0,0,0.1)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.4), 0 4px 20px rgba(0,0,0,0.06), 0 8px 40px rgba(0,0,0,0.04)" }}>
        {NAV.map((item) => (
          <div key={item.href} className="flex flex-col items-center gap-0.5 px-1.5">
            <Link href={href(item.href)}
              className="flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-200"
              style={{ background: isActive(item.href) ? "var(--gold-alpha-08)" : "transparent", color: isActive(item.href) ? "var(--gold)" : "#aaa" }}>
              <span className="scale-[0.82]">{item.icon}</span>
            </Link>
            <span className="text-[9px] tracking-wide"
              style={{ color: isActive(item.href) ? "var(--gold)" : "#bbb", fontWeight: isActive(item.href) ? 600 : 400 }}>
              {item.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
