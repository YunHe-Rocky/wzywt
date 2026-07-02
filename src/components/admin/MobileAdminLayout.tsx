"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { GLASS_CARD, GLASS_SHADOW_BOTTOM } from "@/engine";

const NAV = [
  { href: "/m/admin", label: "仪表盘", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg> },
  { href: "/m/admin/users", label: "用户", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
  { href: "/m/admin/tournaments", label: "房间", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5C7 4 7 7 7 7"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5C17 4 17 7 17 7"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg> },
  { href: "/m/admin/heroes", label: "英雄", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> },
  { href: "/m/admin/settings", label: "设置", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg> },
];

export function MobileAdminLayout({ username, children }: { username: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const { logout } = useAuth();

  const isActive = (href: string) => {
    if (href === "/m/admin") return pathname === "/m/admin";
    return pathname.startsWith(href);
  };

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg-main)", color: "var(--text)" }}>
      {/* Top bar */}
      <header style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 16px",
        borderBottom: "1px solid var(--border-light)",
        background: "rgba(255,255,255,0.4)",
        backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
        position: "sticky", top: 0, zIndex: 30,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Link href="/m/admin" style={{ textDecoration: "none" }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--gold)", letterSpacing: "0.04em" }}>演武后台</span>
          </Link>
          <span style={{ fontSize: 10, color: "var(--text-muted)", background: "var(--gold-alpha-08)", padding: "1px 6px", borderRadius: 4 }}>admin</span>
        </div>
        <button onClick={logout}
          style={{
            background: "none", border: "none", color: "var(--red)", cursor: "pointer",
            fontSize: 12, fontWeight: 500, padding: "4px 10px",
            borderRadius: "var(--radius-sm)",
          }}>
          退出
        </button>
      </header>

      {/* Content — with bottom padding for dock */}
      <main style={{ padding: "16px 14px 100px" }}>{children}</main>

      {/* Bottom Dock */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 40,
        display: "flex", justifyContent: "center", paddingBottom: 12,
        pointerEvents: "none",
      }}>
        <div className="pointer-events-auto" style={{
          display: "flex", alignItems: "flex-end", gap: 2,
          padding: "6px 8px 6px", borderRadius: 18,
          ...GLASS_CARD, ...GLASS_SHADOW_BOTTOM,
        }}>
          {NAV.map((item) => {
            const active = isActive(item.href);
            return (
              <div key={item.href} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "0 6px" }}>
                <Link href={item.href}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    width: 40, height: 40, borderRadius: 12,
                    background: active ? "var(--gold-alpha-08)" : "transparent",
                    color: active ? "var(--gold)" : "#aaa",
                    transition: "all 0.2s",
                  }}>
                  <span style={{ transform: "scale(0.82)" }}>{item.icon}</span>
                </Link>
                <span style={{
                  fontSize: 9, letterSpacing: "0.02em",
                  color: active ? "var(--gold)" : "#bbb",
                  fontWeight: active ? 600 : 400,
                }}>
                  {item.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
