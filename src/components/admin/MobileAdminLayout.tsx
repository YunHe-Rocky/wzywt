"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";

const NAV = [
  { href: "/m/admin", label: "仪表盘", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4", exact: true },
  { href: "/m/admin/users", label: "用户", icon: "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" },
  { href: "/m/admin/tournaments", label: "房间", icon: "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" },
  { href: "/m/admin/heroes", label: "英雄", icon: "M13 10V3L4 14h7v7l9-11h-7z" },
  { href: "/m/admin/announcements", label: "公告", icon: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" },
  { href: "/m/admin/settings", label: "设置", icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" },
];

export function MobileAdminLayout({ username, children }: { username: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const { logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg-card)" }}>
      {/* Top bar */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 16px", background: "var(--bg-nav)",
        borderBottom: "1px solid var(--border-light)", position: "sticky", top: 0, zIndex: 20,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => setMenuOpen(!menuOpen)} style={{
            background: "none", border: "none", color: "var(--text)", cursor: "pointer",
            padding: 4, fontSize: 20, lineHeight: 1,
          }}>
            {menuOpen ? "✕" : "☰"}
          </button>
          <Link href="/m/admin" style={{ textDecoration: "none" }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--gold)" }}>演武后台</span>
          </Link>
        </div>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{username}</span>
      </div>

      {/* Slide-out menu */}
      {menuOpen && (
        <>
          <div onClick={() => setMenuOpen(false)} style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 25,
          }} />
          <div style={{
            position: "fixed", top: 0, left: 0, bottom: 0, width: 200, zIndex: 30,
            background: "var(--bg-nav)", borderRight: "1px solid var(--border-light)",
            display: "flex", flexDirection: "column", padding: "60px 8px 16px",
          }}>
            {NAV.map((item) => {
              const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
              return (
                <Link key={item.href} href={item.href} onClick={() => setMenuOpen(false)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                    borderRadius: 8, fontSize: 14, fontWeight: active ? 600 : 400,
                    background: active ? "var(--gold-alpha-10)" : "transparent",
                    color: active ? "var(--gold)" : "var(--text-secondary)",
                    textDecoration: "none", marginBottom: 2,
                  }}>
                  <svg style={{ width: 18, height: 18, flexShrink: 0 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                  </svg>
                  {item.label}
                </Link>
              );
            })}
            <div style={{ marginTop: "auto", borderTop: "1px solid var(--border-light)", paddingTop: 8 }}>
              <Link href="/m" style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                borderRadius: 8, fontSize: 14, color: "var(--text-secondary)",
                textDecoration: "none",
              }}>
                <svg style={{ width: 18, height: 18 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4" />
                </svg>
                前台
              </Link>
              <button onClick={logout} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                borderRadius: 8, fontSize: 14, color: "var(--red)",
                background: "none", border: "none", cursor: "pointer", width: "100%",
              }}>
                <svg style={{ width: 18, height: 18 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                退出
              </button>
            </div>
          </div>
        </>
      )}

      {/* Content */}
      <main style={{ padding: "16px" }}>{children}</main>
    </div>
  );
}
