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

  const publicNav = [
    { href: "/", label: "首页", icon: "🏠" },
    { href: "/tournaments", label: "赛事", icon: "⚔️" },
    { href: "/heroes", label: "英雄", icon: "📖" },
  ];

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <header className="header-bar">
      {/* 能量光晕 */}
      <div className="header-glow" />

      <div className="header-inner">
        {/* 左侧：项目名 */}
        <Link href="/" className="header-brand">
          王者演武堂
        </Link>

        {/* 中间：导航（所有用户可见） */}
        <nav className="header-nav">
          {publicNav.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-link${active ? " active" : ""}`}
              >
                <span className="nav-link-icon">{item.icon}</span>
                <span>{item.label}</span>
                {active && <span className="nav-link-glow" />}
              </Link>
            );
          })}
        </nav>

        {/* 右侧占位 */}
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

            {/* 下拉菜单 */}
            {menuOpen && (
              <div role="menu" className="dropdown-menu">
                <Link
                  role="menuitem"
                  href="/me"
                  className={`dropdown-item${isActive("/me") ? " active" : ""}`}
                  onClick={() => setMenuOpen(false)}
                >
                  👤 个人空间
                </Link>
                <div className="dropdown-divider" />
                <button
                  onClick={logout}
                  className="dropdown-item dropdown-logout"
                >
                  🚪 退出登录
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
