"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";

interface User {
  userId: number;
  username: string;
}

export function Header() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        setUser(d.user ?? null);
        setLoading(false);
      })
      .catch(() => {
        setUser(null);
        setLoading(false);
      });
  }, [pathname]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    function handleKeydown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKeydown);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKeydown);
    };
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setMenuOpen(false);
    router.push("/login");
    router.refresh();
  }

  const navItems = [
    { href: "/", label: "首页" },
    { href: "/tournaments", label: "赛事大厅" },
    { href: "/heroes", label: "英雄图鉴" },
    { href: "/me", label: "个人空间" },
  ];

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 100,
        height: 56,
        background: "var(--bg-nav)",
        borderBottom: "1px solid rgba(240,192,64,0.12)",
        boxShadow: "0 1px 8px rgba(240,192,64,0.06)",
        display: "flex",
        alignItems: "center",
        padding: "0 24px",
      }}
    >
      {/* 左侧：项目名 */}
      <Link
        href="/"
        style={{
          fontSize: 18,
          fontWeight: 800,
          letterSpacing: 2,
          background: "linear-gradient(180deg, #ffe590 0%, #f0c040 30%, #c89820 70%, #8a6010 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          textDecoration: "none",
          filter: "drop-shadow(0 0 10px rgba(240,192,64,0.4))",
          flexShrink: 0,
        }}
      >
        王者演武堂
      </Link>

      {/* 中间占位 */}
      <div style={{ flex: 1 }} />

      {/* 右侧：用户区 */}
      {!loading && user ? (
        <div ref={menuRef} style={{ position: "relative" }}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            aria-expanded={menuOpen}
            aria-haspopup="true"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "4px 8px",
              borderRadius: 6,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--bg-hover)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: "50%",
                background: "linear-gradient(135deg, rgba(240,192,64,0.25), rgba(240,192,64,0.08))",
                border: "1px solid rgba(240,192,64,0.25)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 13,
                fontWeight: 700,
                color: "var(--gold)",
              }}
            >
              {user.username[0]}
            </div>
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>
              {user.username}
            </span>
          </button>

          {/* 下拉菜单 */}
          {menuOpen && (
            <div
              role="menu"
              style={{
                position: "absolute",
                top: "calc(100% + 8px)",
                right: 0,
                width: 180,
                background: "var(--bg-card)",
                border: "1px solid rgba(240,192,64,0.15)",
                borderRadius: 8,
                padding: "6px 0",
                boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                animation: "slide-up 0.15s ease-out",
              }}
            >
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  role="menuitem"
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  style={{
                    display: "block",
                    padding: "10px 20px",
                    fontSize: 14,
                    fontWeight: isActive(item.href) ? 600 : 400,
                    color: isActive(item.href) ? "var(--gold)" : "var(--text-secondary)",
                    textDecoration: "none",
                    transition: "all 0.12s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--bg-hover)";
                    e.currentTarget.style.color = "var(--text)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.color = isActive(item.href) ? "var(--gold)" : "var(--text-secondary)";
                  }}
                >
                  {item.label}
                </Link>
              ))}
              <div
                style={{
                  height: 1,
                  background: "var(--border)",
                  margin: "4px 12px",
                }}
              />
              <button
                onClick={logout}
                style={{
                  width: "100%",
                  textAlign: "left",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "10px 20px",
                  fontSize: 14,
                  color: "var(--text-secondary)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--bg-hover)";
                  e.currentTarget.style.color = "var(--red)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "var(--text-secondary)";
                }}
              >
                退出登录
              </button>
            </div>
          )}
        </div>
      ) : !loading ? (
        <Link
          href="/login"
          className="btn-primary"
          style={{ fontSize: 13, padding: "8px 20px", fontWeight: 600, textDecoration: "none" }}
        >
          登录
        </Link>
      ) : null}
    </header>
  );
}
