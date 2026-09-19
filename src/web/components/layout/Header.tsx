"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/features/auth/client";
import { ArenaIcon } from "@/web/components/arena/ArenaIcon";
import { SecurityQuestionModal } from "@/web/components/auth/SecurityQuestionModal";
import { DeleteAccountModal } from "@/web/components/auth/DeleteAccountModal";
import { getCurrentUser } from "@/features/auth/client/api";

export function Header() {
  const { user, loaded, logout } = useAuth();

  const [menuOpen, setMenuOpen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [showDel, setShowDel] = useState(false);
  const [securityQ, setSecurityQ] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  async function leave() {
    setLoggingOut(true); setLogoutError("");
    try { await logout(); setMenuOpen(false); }
    catch { setLogoutError("退出失败，请重试"); }
    finally { setLoggingOut(false); }
  }
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const catalogRef = useRef<HTMLDivElement>(null);
  const catalogButtonRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    if (!user) return;
    if (user.role === "admin") router.prefetch("/admin");
    getCurrentUser().then(({ data }) => {
      if (data.user?.securityQuestion) setSecurityQ(data.user.securityQuestion);
    }).catch(() => undefined);
  }, [router, user]);

  useEffect(() => {
    const fn = (event: PointerEvent) => { if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false); };
    document.addEventListener("pointerdown", fn);
    return () => document.removeEventListener("pointerdown", fn);
  }, []);
  useEffect(() => {
    const fn = (event: PointerEvent) => { if (catalogRef.current && !catalogRef.current.contains(event.target as Node)) setCatalogOpen(false); };
    document.addEventListener("pointerdown", fn);
    return () => document.removeEventListener("pointerdown", fn);
  }, []);
  useEffect(() => { setMenuOpen(false); setCatalogOpen(false); }, [pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setMenuOpen(false);
      window.requestAnimationFrame(() => menuButtonRef.current?.focus());
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [menuOpen]);
  useEffect(() => {
    if (!catalogOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setCatalogOpen(false);
      window.requestAnimationFrame(() => catalogButtonRef.current?.focus());
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [catalogOpen]);

  const pathIsM = /^\/m(?:\/|$)/.test(pathname);
  const basePath = pathname.replace(/^\/m(?=\/|$)/, "") || "/";
  const route = (path: string) => pathIsM ? `/m${path}` : path;

  return (
    <>
    <header className="sticky top-0 header-bar" suppressHydrationWarning>
      <div className="header-inner-alt flex items-center gap-4">
        {/* Brand */}
        <Link href={pathIsM ? "/m" : "/"} className="header-brand-link flex items-center gap-2 shrink-0 no-underline">
          <span className="arena-brand-mark"><ArenaIcon name="seal" /></span>
          <span className="arena-brand-type"><strong>王者演武堂</strong><small>YANWU ARENA</small></span>
        </Link>

        <nav className="header-primary-nav" aria-label="主导航">
          <Link href={route("/")} aria-current={basePath === "/" ? "page" : undefined}>演武首页</Link>
          <Link href={route("/tournaments")} aria-current={basePath.startsWith("/tournaments") ? "page" : undefined}>赛事大厅</Link>
          <div ref={catalogRef} className="header-catalog-wrap">
            <button
              ref={catalogButtonRef}
              type="button"
              className={`header-catalog-trigger ${/^\/(heroes|equipment)(\/|$)/.test(basePath) ? "is-active" : ""}`}
              aria-label={catalogOpen ? "关闭图鉴菜单" : "打开图鉴菜单"}
              aria-expanded={catalogOpen}
              aria-controls="header-catalog-menu"
              onClick={() => { setMenuOpen(false); setCatalogOpen(value => !value); }}
            >图鉴</button>
            {catalogOpen && <div id="header-catalog-menu" className="header-catalog-menu" aria-label="图鉴入口">
              <Link href={route("/heroes")} aria-current={basePath.startsWith("/heroes") ? "page" : undefined}><ArenaIcon name="crest" width="16" height="16" />英雄</Link>
              <Link href={route("/equipment")} aria-current={basePath.startsWith("/equipment") ? "page" : undefined}><ArenaIcon name="swords" width="16" height="16" />装备</Link>
            </div>}
          </div>
          <Link href={route("/combat")} prefetch={false} aria-current={pathname.startsWith(route("/combat")) ? "page" : undefined}>演武动态</Link>
        </nav>

        <div className="flex-1" />

        {/* Right side */}
        {!mounted ? null : loaded && user ? (
          <div ref={menuRef} className="relative">
            <button ref={menuButtonRef} onClick={() => { setCatalogOpen(false); setMenuOpen(!menuOpen); }}
              aria-label={menuOpen ? "关闭用户菜单" : "打开用户菜单"}
              aria-expanded={menuOpen}
              aria-controls="header-user-menu"
              className="header-user-trigger flex items-center gap-2 rounded-full transition-all px-2 hover:bg-black/5">
              {user.avatar ? (
                <img
                  src={`/api/avatars/${user.avatar}`}
                  alt={user.username}
                  className="rounded-full object-cover w-6 h-6 border border-blue/15"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : null}
                    <span className={`rounded-full flex items-center justify-center font-bold transition-shadow w-6 h-6 text-xs arena-avatar border ${user.avatar ? "hidden" : ""}`}>
                {user.username[0]}
              </span>
              <svg className={`w-3 h-3 transition-transform text-[#aaa] ${menuOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeWidth={2} d="M6 9l6 6 6-6" />
              </svg>
            </button>

            {menuOpen && (
              <div id="header-user-menu" className="header-user-menu absolute right-0 top-full mt-2 w-48 py-1 animate-slide-up rounded-2xl" aria-label="用户操作">
                <div className="px-4 py-3 border-b border-border-light">
                  <div className="flex items-center gap-2.5">
                    {user.avatar ? (
                      <img
                        src={`/api/avatars/${user.avatar}`}
                        alt={user.username}
                        className="rounded-full object-cover w-8 h-8 shrink-0"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    ) : null}
                    <span className={`rounded-full flex items-center justify-center font-bold shrink-0 w-8 h-8 text-sm arena-avatar ${user.avatar ? "hidden" : ""}`}>
                      {user.username[0]}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-text truncate">{user.username}</div>
                        <div className="text-xs text-text-muted">召唤师</div>
                    </div>
                  </div>
                </div>
                <Link href={route("/me")} prefetch={false} onClick={() => setMenuOpen(false)} className="header-menu-action w-full flex items-center gap-2 px-4 text-sm text-text-secondary hover:bg-hover"><ArenaIcon name="user" width="16" height="16" />个人空间</Link>
                <Link href={route("/combat")} onClick={() => setMenuOpen(false)} className="header-menu-action w-full flex items-center gap-2 px-4 text-sm text-text-secondary hover:bg-hover"><ArenaIcon name="news" width="16" height="16" />演武动态</Link>
                {user.role === "admin" && (
                  <button onClick={() => { setMenuOpen(false); router.push(route("/admin")); }}
                    className="header-menu-action w-full text-left flex items-center gap-2 px-4 text-sm transition-colors text-gold hover:bg-gold/5">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    后台管理
                  </button>
                )}
                <button onClick={() => { setMenuOpen(false); setShowPwd(true); }}
                  className="header-menu-action w-full text-left flex items-center gap-2 px-4 text-sm transition-colors text-text-secondary hover:bg-hover">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4" strokeLinecap="round" strokeWidth={2}/></svg>
                  修改密码
                </button>
                {user.role !== "admin" && (
                  <button onClick={() => { setMenuOpen(false); setShowDel(true); }}
                    className="header-menu-action w-full text-left flex items-center gap-2 px-4 text-sm transition-colors text-red/70 hover:text-red hover:bg-red/3">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    注销账户
                  </button>
                )}
                <div className="border-t border-border-light my-1" />
                {logoutError && <p role="alert" className="px-4 py-2 text-sm text-red">{logoutError}</p>}
                <button disabled={loggingOut} onClick={() => void leave()}
                  className="header-menu-action w-full text-left flex items-center gap-2 px-4 text-sm transition-colors text-red/70 hover:text-red hover:bg-red/3">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                  {loggingOut ? "正在退出…" : "退出登录"}
                </button>
              </div>
            )}
          </div>
        ) : (
          <Link href={route("/login")} aria-label="登录"
            className="header-login-link flex items-center justify-center rounded-full bg-blue/10 text-[#4488f0] text-sm font-bold no-underline hover:bg-blue/15 transition-colors">
            <ArenaIcon name="user" width="16" height="16" />登录
          </Link>
        )}
      </div>
    </header>
    <SecurityQuestionModal question={securityQ} open={showPwd} onClose={() => setShowPwd(false)} />
    <DeleteAccountModal open={showDel} onClose={() => setShowDel(false)} />
    </>
  );
}
