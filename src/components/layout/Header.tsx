"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";

interface User { userId: number; username: string; }

const NAV = [
  { href: "/", label: "首页" },
  { href: "/tournaments", label: "赛事" },
  { href: "/heroes", label: "英雄" },
  { href: "/me", label: "我的" },
];

export function Header() {
  const [user, setUser] = useState<User | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [version, setVersion] = useState("V1.0.0");
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      setUser(d.user ?? null); setLoaded(true);
    }).catch(() => { setUser(null); setLoaded(false); });
    fetch("/api/announcements").then(r => r.json()).then(d => {
      if (d.announcements?.[0]?.version) setVersion(d.announcements[0].version);
    }).catch(() => {});
  }, [pathname]);

  useEffect(() => {
    const fn = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false); };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null); setMenuOpen(false);
    router.push("/login"); router.refresh();
  }

  const active = (href: string) => href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header className="sticky top-0 z-50 bg-nav border-b border-border-gold">
      {/* Glow line */}
      <div className="h-px bg-gradient-to-r from-transparent via-gold/40 to-transparent animate-pulse" />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-4">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2 shrink-0 no-underline">
          <span className="text-lg font-extrabold tracking-wider bg-gradient-to-b from-amber-200 via-gold to-gold-dim bg-clip-text text-transparent drop-shadow-[0_0_8px_rgba(240,192,64,0.3)]">
            王者演武堂
          </span>
          <span className="text-[10px] font-semibold tracking-wider text-gold/60 border border-gold/20 rounded px-1.5 leading-4 hidden sm:inline">
            {version}
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden sm:flex items-center gap-1 ml-4">
          {NAV.map(n => (
            <Link key={n.href} href={n.href}
              className={`px-3 py-1.5 text-sm font-medium rounded-sm transition-colors no-underline
                ${active(n.href) ? "text-gold bg-gold/8" : "text-text-secondary hover:text-text hover:bg-hover"}`}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="flex-1" />

        {/* Right side */}
        {!loaded ? null : user ? (
          <div ref={menuRef} className="relative">
            <button onClick={() => setMenuOpen(!menuOpen)}
              className="flex items-center gap-2 px-2 py-1 rounded hover:bg-hover transition-colors">
              <span className="w-7 h-7 rounded-full bg-gradient-to-br from-gold to-gold-dim flex items-center justify-center text-xs font-bold text-root">
                {user.username[0]}
              </span>
              <span className="text-sm text-text hidden sm:inline">{user.username}</span>
              <svg className={`w-3 h-3 text-text-muted transition-transform ${menuOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeWidth={2} d="M6 9l6 6 6-6" />
              </svg>
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 w-40 bg-card border border-border rounded-lg shadow-2xl py-1 animate-slide-up">
                <button onClick={logout}
                  className="w-full text-left px-4 py-2 text-sm text-red hover:bg-red/5 transition-colors">
                  退出登录
                </button>
              </div>
            )}
          </div>
        ) : (
          <Link href="/login"
            className="px-5 py-1.5 text-sm font-semibold rounded-md bg-gradient-to-b from-gold-light via-gold to-gold-dim text-root hover:brightness-110 transition-all hover:-translate-y-px shadow-[0_2px_8px_rgba(240,192,64,0.2)] no-underline">
            登录
          </Link>
        )}

        {/* Mobile nav toggle */}
        <button onClick={() => setMobileNav(!mobileNav)}
          className="sm:hidden flex items-center justify-center w-8 h-8 rounded text-text-muted hover:text-gold transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {mobileNav
              ? <path strokeLinecap="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              : <path strokeLinecap="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />}
          </svg>
        </button>
      </div>

      {/* Mobile nav dropdown */}
      {mobileNav && (
        <div className="sm:hidden border-t border-border bg-card px-4 py-2 flex flex-col gap-1 animate-slide-up">
          {NAV.map(n => (
            <Link key={n.href} href={n.href} onClick={() => setMobileNav(false)}
              className={`px-3 py-2 rounded text-sm no-underline font-medium ${active(n.href) ? "text-gold bg-gold/8" : "text-text-secondary"}`}>
              {n.label}
            </Link>
          ))}
        </div>
      )}
    </header>
  );
}
