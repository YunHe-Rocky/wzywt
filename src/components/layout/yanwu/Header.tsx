"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useAnnouncements } from "@/hooks/useAnnouncements";

const NAV = [
  { href: "/", label: "首页" },
  { href: "/tournaments", label: "赛事大厅" },
  { href: "/heroes", label: "英雄图鉴" },
];

export function YanwuHeader() {
  const { user, loaded, logout } = useAuth();
  const { latestVersion } = useAnnouncements(false);

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const pathIsM = pathname.startsWith("/m");

  useEffect(() => {
    const fn = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false); };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  const version = latestVersion || "V1.0.1";

  const [hash, setHash] = useState("");
  useEffect(() => {
    setHash(window.location.hash);
    const onHash = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const withHash = (path: string) => path + hash;

  function doLogout() { setMenuOpen(false); logout(); }

  const active = (href: string) => href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header className="sticky top-0 z-50 bg-nav border-b border-border-gold">
      <div className="h-px bg-gradient-to-r from-transparent via-gold/40 to-transparent animate-pulse" />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-4">
        {/* Brand */}
        <Link href={withHash(pathIsM ? "/m" : "/")} className="flex items-center gap-2 shrink-0 no-underline">
          <span className="text-lg font-extrabold tracking-wider text-gold-light">王者演武堂</span>
          <span className="text-[10px] font-semibold tracking-wider rounded px-1.5 leading-4 text-gold/70 border border-gold/15">{version}</span>
        </Link>

        {/* Nav links — always show */}
        <nav className="flex items-center gap-1 ml-4">
          {NAV.map(n => (
            <Link key={n.href} href={withHash(n.href)}
              className={`px-3 py-1.5 text-sm font-medium rounded-sm transition-colors no-underline ${active(n.href) ? "text-gold bg-gold/8" : "text-text-secondary hover:text-text hover:bg-hover"}`}>
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="flex-1" />

        {/* User */}
        {loaded && (user ? (
          <div ref={menuRef} className="relative">
            <button onClick={() => setMenuOpen(!menuOpen)}
              className="flex items-center gap-2 rounded-full px-2 py-1 hover:bg-hover transition-all">
              <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold bg-gradient-to-br from-gold to-gold-dim text-white">{user.username[0]}</span>
              <span className="text-sm text-text hidden sm:inline">{user.username}</span>
              <svg className={`w-3 h-3 transition-transform ${menuOpen ? "rotate-180" : ""} text-text-muted`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeWidth={2} d="M6 9l6 6 6-6" />
              </svg>
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full mt-2 w-48 py-1 rounded-lg bg-card border border-border shadow-2xl animate-slide-up">
                <div className="px-4 py-3 border-b border-border-light">
                  <div className="flex items-center gap-2.5">
                    <span className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold bg-gradient-to-br from-gold to-gold-dim text-white">{user.username[0]}</span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-text truncate">{user.username}</div>
                      <div className="text-[10px] text-text-muted">召唤师</div>
                    </div>
                  </div>
                </div>
                <Link href={withHash(pathIsM ? "/m/me" : "/me")} onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm no-underline text-text-secondary hover:text-text hover:bg-hover">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                  个人空间
                </Link>
                <div className="border-t border-border-light my-1" />
                <button onClick={doLogout}
                  className="w-full text-left flex items-center gap-2 px-4 py-2.5 text-sm text-red/80 hover:text-red hover:bg-red/5">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                  退出登录
                </button>
              </div>
            )}
          </div>
        ) : (
          <Link href={withHash("/login")}
            className="px-5 py-1.5 text-sm font-semibold rounded-md bg-gradient-to-b from-gold-light via-gold to-gold-dim text-white hover:brightness-110 transition-all hover:-translate-y-px shadow-[0_2px_6px_var(--gold-alpha-10)] no-underline">
            登录
          </Link>
        ))}
      </div>
    </header>
  );
}
