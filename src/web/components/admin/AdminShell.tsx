"use client";

import "@/web/styles/admin.css";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/features/auth/client";
import { ADMIN_NAVIGATION, adminRoutePrefix, isAdminRouteActive } from "@/features/admin/navigation";
import { ArenaIcon } from "@/web/components/arena/ArenaIcon";
import { AdminIdentityProvider } from "./AdminIdentityContext";

export function AdminShell({ userId, username, children }: { userId: number; username: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const prefix = adminRoutePrefix(pathname);
  const { logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  useEffect(() => setMenuOpen(false), [pathname]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape" && menuOpen) { setMenuOpen(false); menuTrigger.current?.focus(); }
    };
    const closeOnHistory = () => setMenuOpen(false);
    window.addEventListener("keydown", close);
    window.addEventListener("popstate", closeOnHistory);
    return () => { window.removeEventListener("keydown", close); window.removeEventListener("popstate", closeOnHistory); };
  }, [menuOpen]);
  const active = ADMIN_NAVIGATION.find(item => isAdminRouteActive(pathname, item.path));
  async function leave() {
    setLoggingOut(true); setLogoutError("");
    try { await logout(); } catch { setLogoutError("退出失败，请重试"); } finally { setLoggingOut(false); }
  }
  return <AdminIdentityProvider userId={userId}><div className="admin-workspace">
    <a className="arena-skip" href="#admin-content">跳至管理内容</a>
    <aside className="admin-rail">
      <div className="admin-rail-heading"><Link className="admin-logo" href={`${prefix}/admin`}><ArenaIcon name="crest" /><span><strong>演武管理处</strong><small>YANWU CONSOLE</small></span></Link><button type="button" ref={menuTrigger} className="admin-menu-trigger" aria-label="管理菜单" aria-expanded={menuOpen} aria-controls="admin-navigation" onClick={() => setMenuOpen(open => !open)}>管理菜单 <span aria-hidden="true">{menuOpen ? "−" : "+"}</span></button></div>
      <nav id="admin-navigation" aria-label="后台导航" className="admin-navigation" data-open={menuOpen} onClick={(event) => { if ((event.target as Element).closest("a")) setMenuOpen(false); }}>
        {[...new Set(ADMIN_NAVIGATION.map(item => item.group))].map(group => <div className="admin-nav-group" key={group}><p>{group}</p>{ADMIN_NAVIGATION.filter(item => item.group === group).map(item => <Link key={item.path} href={`${prefix}${item.path}`} prefetch={false} aria-current={isAdminRouteActive(pathname, item.path) ? "page" : undefined}><span>{item.label}</span><small>{item.description}</small></Link>)}</div>)}
      </nav>
      <Link className="admin-back" href={prefix || "/"}>← 返回演武堂</Link>
    </aside>
    <div className="admin-workspace-body">
      <header className="admin-topbar"><div><small>管理中心 / {active?.group || "概览"}</small><strong>{active?.label || "工作台"}</strong></div><div className="admin-account"><span>{username}</span><button className="btn-subtle" disabled={loggingOut} onClick={() => void leave()}>{loggingOut ? "正在退出…" : "退出登录"}</button></div></header>
      {logoutError && <p className="admin-error" role="alert">{logoutError}</p>}
      <div id="admin-content" className="admin-content" tabIndex={-1}>{children}</div>
    </div>
  </div></AdminIdentityProvider>;
}
