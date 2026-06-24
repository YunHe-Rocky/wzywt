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
  const [version, setVersion] = useState("V1.0.0");
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
    // Auto-read latest version from announcements
    fetch("/api/announcements")
      .then((r) => r.json())
      .then((d) => {
        if (d.announcements?.length > 0 && d.announcements[0].version) {
          setVersion(d.announcements[0].version);
        }
      })
      .catch(() => {});
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
    <header className="header-bar">
      <div className="header-glow" />
      <div className="header-inner">
        {/* 左侧：项目名 + 版本 */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexShrink: 0 }}>
          <Link href="/" className="header-brand">
            王者演武堂
          </Link>
          <span style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: 1,
            color: "rgba(192,168,74,0.65)",
            border: "1px solid rgba(192,168,74,0.18)",
            borderRadius: 3,
            padding: "0 5px",
            lineHeight: "17px",
          }}>
            {version}
          </span>
        </div>

        <div style={{ flex: 1 }} />

        {/* 右侧：用户区 */}
        {!loading && user ? (
          <div ref={menuRef} style={{ position: "relative" }}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              aria-expanded={menuOpen}
              aria-haspopup="true"
              className="user-btn"
            >
              <div className="user-avatar">
                {user.username[0]}
              </div>
              <span className="user-name">{user.username}</span>
              <span
                style={{
                  fontSize: 10,
                  transition: "transform 0.2s",
                  transform: menuOpen ? "rotate(180deg)" : "rotate(0deg)",
                  color: "var(--text-muted)",
                }}
              >
                ▼
              </span>
            </button>

            {menuOpen && (
              <div role="menu" className="dropdown-menu">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    role="menuitem"
                    href={item.href}
                    className={`dropdown-item${isActive(item.href) ? " active" : ""}`}
                    onClick={() => setMenuOpen(false)}
                  >
                    {item.label}
                  </Link>
                ))}
                <div className="dropdown-divider" />
                <button
                  onClick={logout}
                  className="dropdown-item dropdown-logout"
                >
                  退出登录
                </button>
              </div>
            )}
          </div>
        ) : !loading ? (
          <Link href="/login" className="btn-primary login-btn">
            登录
          </Link>
        ) : null}
      </div>
    </header>
  );
}
