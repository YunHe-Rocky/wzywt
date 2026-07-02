"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";

const NAV = [
  { href: "/m/admin", label: "仪表盘", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4", exact: true },
  { href: "/m/admin/users", label: "用户管理", icon: "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" },
  { href: "/m/admin/tournaments", label: "房间管理", icon: "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" },
  { href: "/m/admin/heroes", label: "英雄分路", icon: "M13 10V3L4 14h7v7l9-11h-7z" },
  { href: "/m/admin/announcements", label: "公告管理", icon: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" },
  { href: "/m/admin/settings", label: "系统设置", icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" },
];

export function MobileAdminLayout({ username, children }: { username: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const { logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg-main)", color: "var(--text)" }}>
      {/* Top bar — matches header-bar style */}
      <header className="sticky top-0 z-50 header-bar" style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 14px", height: 44,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => setMenuOpen(!menuOpen)}
            style={{
              background: "none", border: "none", color: "var(--text-secondary)",
              cursor: "pointer", padding: 6, fontSize: 18, lineHeight: 1,
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 32, height: 32, borderRadius: "var(--radius-sm)",
            }}>
            {menuOpen ? "✕" : "☰"}
          </button>
          <Link href="/m/admin" style={{ textDecoration: "none" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--gold)", letterSpacing: "0.03em" }}>
              演武后台
            </span>
          </Link>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>{username}</span>
          <div style={{
            width: 28, height: 28, borderRadius: "50%",
            background: "var(--gold-alpha-08)", color: "var(--gold)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 12, fontWeight: 700,
          }}>
            {username[0]}
          </div>
        </div>
      </header>

      {/* Slide-out menu — matches Header dropdown glass style */}
      {menuOpen && (
        <>
          <div onClick={() => setMenuOpen(false)} style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 55,
          }} />
          <div className="animate-slide-up" style={{
            position: "fixed", top: 8, left: 8, bottom: 8, width: 220, zIndex: 60,
            background: "rgba(255,255,255,0.72)",
            backdropFilter: "blur(28px)", WebkitBackdropFilter: "blur(28px)",
            border: "1px solid rgba(255,255,255,0.7)",
            borderRadius: 20, padding: "52px 8px 12px",
            boxShadow: "0 4px 24px rgba(0,0,0,0.08), 0 8px 48px rgba(0,0,0,0.04)",
            display: "flex", flexDirection: "column",
          }}>
            {NAV.map((item) => {
              const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
              return (
                <Link key={item.href} href={item.href} onClick={() => setMenuOpen(false)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                    borderRadius: 12, fontSize: 14, fontWeight: active ? 600 : 400,
                    background: active ? "var(--gold-alpha-08)" : "transparent",
                    color: active ? "var(--gold)" : "var(--text-secondary)",
                    textDecoration: "none", marginBottom: 1,
                    transition: "background 0.15s, color 0.15s",
                  }}>
                  <svg style={{ width: 18, height: 18, flexShrink: 0, opacity: active ? 1 : 0.5 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={item.icon} />
                  </svg>
                  {item.label}
                </Link>
              );
            })}

            <div style={{ marginTop: "auto", borderTop: "1px solid var(--border-light)", paddingTop: 8 }}>
              <Link href="/m" style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                borderRadius: 12, fontSize: 14, color: "var(--text-secondary)",
                textDecoration: "none",
              }}>
                <svg style={{ width: 18, height: 18, opacity: 0.5 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4" />
                </svg>
                返回前台
              </Link>
              <button onClick={logout} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                borderRadius: 12, fontSize: 14,
                color: "var(--red)", background: "none",
                border: "none", cursor: "pointer", width: "100%",
              }}>
                <svg style={{ width: 18, height: 18, opacity: 0.6 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeWidth={1.8} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                退出登录
              </button>
            </div>
          </div>
        </>
      )}

      {/* Content */}
      <main style={{ padding: "16px 14px 40px" }}>{children}</main>
    </div>
  );
}
