"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "@/themes/ThemeProvider";
import { getUIConfig } from "@/themes/ui-config";
import { useAuth } from "@/hooks/useAuth";
import { useAnnouncements } from "@/hooks/useAnnouncements";

const NAV = [
  { href: "/", label: "首页" },
  { href: "/tournaments", label: "赛事大厅" },
  { href: "/heroes", label: "英雄图鉴" },
];

export function Header() {
  const { user, loaded, logout } = useAuth();
  const { latestVersion } = useAnnouncements(false);

  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const fn = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false); };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  const version = latestVersion || "V1.0.1";

  // 保留 hash 避免切主题
  const [hash, setHash] = useState("");
  useEffect(() => {
    setHash(window.location.hash);
    const onHash = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const withHash = (path: string) => path + hash;

  function doLogout() { setMenuOpen(false); logout(); }

  const { theme } = useTheme();
  const ui = getUIConfig(theme);
  const pathIsM = pathname.startsWith("/m");
  // 用实际屏幕宽度判断移动端，比 URL 路径更可靠
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  const active = (href: string) => href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header className={`sticky top-0 z-50 ${isMobile ? "bg-nav/90 backdrop-blur-md border-b border-border" : (ui.headerNav === "compact") ? "header-bar" : "bg-nav border-b border-border-gold"}`} suppressHydrationWarning>
      {!(ui.headerNav === "compact") && !isMobile && (
        <div className="h-px bg-gradient-to-r from-transparent via-gold/40 to-transparent animate-pulse" />
      )}

      <div className={`${isMobile ? "max-w-full mx-auto px-4 h-11" : (ui.headerNav === "compact") ? "header-inner-alt" : "max-w-6xl mx-auto px-4 sm:px-6 h-14"} flex items-center gap-4`}
        style={isMobile ? undefined : (ui.headerNav === "compact") ? { height: 34, padding: "0 20px" } : undefined}>
        {/* Brand */}
        <Link href={withHash(pathIsM ? "/m" : "/")} className="flex items-center gap-2 shrink-0 no-underline">
          {(ui.headerNav === "compact") && !isMobile && (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#5e9eff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5"/>
            </svg>
          )}
          <span className={isMobile ? "text-sm font-extrabold tracking-wider text-gold-light" : (ui.headerNav === "compact") ? "text-[11px] font-bold tracking-wider text-[#777]" : "text-lg font-extrabold tracking-wider text-gold-light"}>
            王者演武堂
          </span>
          <span className={`text-[10px] font-semibold tracking-wider rounded px-1.5 leading-4 ${isMobile ? "inline text-gold/70 border border-gold/10" : "inline text-gold/70 border border-gold/15"}`}>
            {version}
          </span>
        </Link>

        {/* Desktop nav — not on /m routes */}
        {!isMobile && (
          <nav className="flex items-center gap-1 ml-4">
            {NAV.map(n => (
              <Link key={n.href} href={withHash(n.href)}
                className={`px-3 py-1.5 text-sm font-medium rounded-sm transition-colors no-underline
                  ${active(n.href) ? "text-gold bg-gold/8" : "text-text-secondary hover:text-text hover:bg-hover"}`}
              >
                {n.label}
              </Link>
            ))}
          </nav>
        )}

        <div className="flex-1" />

        {/* Right side */}
        {!loaded ? null : user ? (
          <div ref={menuRef} className="relative">
            <button onClick={() => setMenuOpen(!menuOpen)}
              className={`flex items-center gap-2 rounded-full transition-all ${(ui.headerNav === "compact") ? "px-2 py-0.5 hover:bg-black/5" : "px-2 py-1 hover:bg-hover"}`}>
              <span className={`rounded-full flex items-center justify-center font-bold transition-shadow ${(ui.headerNav === "compact") ? "w-6 h-6 text-[10px] bg-blue/8 text-[#5e9eff] border border-blue/15 hover:shadow-[0_0_8px_rgba(94,158,255,0.12)]" : "w-7 h-7 text-xs bg-gradient-to-br from-gold to-gold-dim text-white"}`}>
                {user.username[0]}
              </span>
              {!(ui.headerNav === "compact") && <span className="text-sm text-text hidden sm:inline">{user.username}</span>}
              <svg className={`w-3 h-3 transition-transform ${menuOpen ? "rotate-180" : ""} ${(ui.headerNav === "compact") ? "text-[#aaa]" : "text-text-muted"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeWidth={2} d="M6 9l6 6 6-6" />
              </svg>
            </button>

            {menuOpen && (
              <div className={`absolute right-0 top-full mt-2 w-48 py-1 animate-slide-up ${(ui.headerNav === "compact") ? "rounded-2xl" : "rounded-lg bg-card border border-border shadow-2xl"}`}
                style={(ui.headerNav === "compact") ? {
                  background: "rgba(255,255,255,0.7)",
                  backdropFilter: "blur(28px)",
                  WebkitBackdropFilter: "blur(28px)",
                  border: "1px solid rgba(255,255,255,0.7)",
                  boxShadow: "0 4px 24px rgba(0,0,0,0.08), 0 8px 48px rgba(0,0,0,0.04)",
                } : undefined}>
                <div className="px-4 py-3 border-b border-border-light">
                  <div className="flex items-center gap-2.5">
                    <span className={`rounded-full flex items-center justify-center font-bold shrink-0 ${(ui.headerNav === "compact") ? "w-8 h-8 text-sm bg-blue/8 text-[#5e9eff]" : "w-8 h-8 text-sm bg-gradient-to-br from-gold to-gold-dim text-white"}`}>
                      {user.username[0]}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-text truncate">{user.username}</div>
                      <div className="text-[10px] text-text-muted">召唤师</div>
                    </div>
                  </div>
                </div>
                <Link href={withHash(pathIsM ? "/m/me" : "/me")} onClick={() => setMenuOpen(false)}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm no-underline transition-colors ${(ui.headerNav === "compact") ? "text-[#666] hover:bg-black/3 hover:text-[#333]" : "text-text-secondary hover:text-text hover:bg-hover"}`}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                  个人空间
                </Link>
                <div className="border-t border-border-light my-1" />
                <button onClick={doLogout}
                  className={`w-full text-left flex items-center gap-2 px-4 py-2.5 text-sm transition-colors ${(ui.headerNav === "compact") ? "text-red/70 hover:text-red hover:bg-red/3" : "text-red/80 hover:text-red hover:bg-red/5"}`}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                  退出登录
                </button>
              </div>
            )}
          </div>
        ) : (ui.headerNav === "compact") ? (
          <Link href={withHash("/login")}
            className="flex items-center justify-center w-5 h-5 rounded-full bg-blue/10 text-[#5e9eff] text-[9px] font-bold no-underline">
            ?
          </Link>
        ) : (
          <Link href={withHash("/login")}
            className="px-5 py-1.5 text-sm font-semibold rounded-md bg-gradient-to-b from-gold-light via-gold to-gold-dim text-white hover:brightness-110 transition-all hover:-translate-y-px shadow-[0_2px_6px_var(--gold-alpha-10)] no-underline">
            登录
          </Link>
        )}

        {/* Mobile hamburger — 演武手机用汉堡菜单 */}
        {ui.mobileNav === "hamburger" && isMobile && (
          <button onClick={() => setMobileOpen(!mobileOpen)}
            className="flex items-center justify-center w-8 h-8 rounded text-text-muted hover:text-gold-light transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {mobileOpen
                ? <path strokeLinecap="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                : <path strokeLinecap="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />}
            </svg>
          </button>
        )}
      </div>

      {/* Mobile nav dropdown — 演武手机汉堡菜单展开 */}
      {ui.mobileNav === "hamburger" && isMobile && mobileOpen && (
        <div className="border-t border-border bg-card px-4 py-2 flex flex-col gap-1 animate-slide-up">
          {NAV.map(n => (
            <Link key={n.href} href={withHash(n.href)} onClick={() => setMobileOpen(false)}
              className={`px-3 py-2 rounded text-sm no-underline font-medium ${active(n.href) ? "text-gold bg-gold/8" : "text-text-secondary"}`}>
              {n.label}
            </Link>
          ))}
        </div>
      )}
    </header>
  );
}
