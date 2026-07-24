"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/features/auth/client";
import { useAnnouncements } from "@/features/announcements/client";
import { SecurityQuestionModal } from "@/web/components/auth/SecurityQuestionModal";
import { DeleteAccountModal } from "@/web/components/auth/DeleteAccountModal";
import { getCurrentUser } from "@/features/auth/client/api";

export function Header() {
  const { user, loaded, logout } = useAuth();
  const { latestVersion } = useAnnouncements(false);

  const [menuOpen, setMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [showDel, setShowDel] = useState(false);
  const [securityQ, setSecurityQ] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    if (!user) return;
    getCurrentUser().then(({ data }) => {
      if (data.user?.securityQuestion) setSecurityQ(data.user.securityQuestion);
    });
  }, [user]);

  useEffect(() => {
    const fn = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false); };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  const version = latestVersion || "V2.0.1";
  const pathIsM = pathname.startsWith("/m");
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  return (
    <>
    <header className="sticky top-0 z-50 header-bar" suppressHydrationWarning>
      <div className="header-inner-alt flex items-center gap-4">
        {/* Brand */}
        <Link href={pathIsM ? "/m" : "/"} className="flex items-center gap-2 shrink-0 no-underline">
          <span className="text-[11px] font-bold tracking-wider text-[#777]">
            王者演武堂
          </span>
          <span className="text-[10px] font-semibold tracking-wider rounded px-1.5 leading-4 text-gold/70 border border-gold/10">
            {version}
          </span>
        </Link>

        <div className="flex-1" />

        {/* Right side */}
        {!mounted ? null : loaded && user ? (
          <div ref={menuRef} className="relative">
            <button onClick={() => setMenuOpen(!menuOpen)}
              aria-label={menuOpen ? "关闭用户菜单" : "打开用户菜单"}
              aria-expanded={menuOpen}
              className="flex items-center gap-2 rounded-full transition-all px-2 py-0.5 hover:bg-black/5">
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
              <span className={`rounded-full flex items-center justify-center font-bold transition-shadow w-6 h-6 text-[10px] bg-blue/8 text-[#4488f0] border border-blue/15 ${user.avatar ? "hidden" : ""}`}>
                {user.username[0]}
              </span>
              <svg className={`w-3 h-3 transition-transform text-[#aaa] ${menuOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeWidth={2} d="M6 9l6 6 6-6" />
              </svg>
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full mt-2 w-48 py-1 animate-slide-up rounded-2xl"
                style={{
                  background: "rgba(255,255,255,0.7)",
                  backdropFilter: "blur(28px)",
                  WebkitBackdropFilter: "blur(28px)",
                  border: "1px solid rgba(255,255,255,0.7)",
                  boxShadow: "0 4px 24px rgba(0,0,0,0.08), 0 8px 48px rgba(0,0,0,0.04)",
                }}>
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
                    <span className={`rounded-full flex items-center justify-center font-bold shrink-0 w-8 h-8 text-sm bg-blue/8 text-[#4488f0] ${user.avatar ? "hidden" : ""}`}>
                      {user.username[0]}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-text truncate">{user.username}</div>
                      <div className="text-[10px] text-text-muted">召唤师</div>
                    </div>
                  </div>
                </div>
                {user.role === "admin" && (
                  <button onClick={() => { setMenuOpen(false); router.push("/admin"); }}
                    className="w-full text-left flex items-center gap-2 px-4 py-2.5 text-sm transition-colors text-gold hover:bg-gold/5">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    后台管理
                  </button>
                )}
                <button onClick={() => { setMenuOpen(false); setShowPwd(true); }}
                  className="w-full text-left flex items-center gap-2 px-4 py-2.5 text-sm transition-colors text-[#666] hover:bg-black/3 hover:text-[#333]">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4" strokeLinecap="round" strokeWidth={2}/></svg>
                  修改密码
                </button>
                {user.role !== "admin" && (
                  <button onClick={() => { setMenuOpen(false); setShowDel(true); }}
                    className="w-full text-left flex items-center gap-2 px-4 py-2.5 text-sm transition-colors text-red/70 hover:text-red hover:bg-red/3">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    注销账户
                  </button>
                )}
                <div className="border-t border-border-light my-1" />
                <button onClick={() => { setMenuOpen(false); logout(); }}
                  className="w-full text-left flex items-center gap-2 px-4 py-2.5 text-sm transition-colors text-red/70 hover:text-red hover:bg-red/3">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                  退出登录
                </button>
              </div>
            )}
          </div>
        ) : (
          <Link href="/login" aria-label="登录"
            className="flex items-center justify-center w-9 h-9 rounded-full bg-blue/10 text-[#4488f0] text-sm font-bold no-underline hover:bg-blue/15 transition-colors">
            ?
          </Link>
        )}
      </div>
    </header>
    <SecurityQuestionModal question={securityQ} open={showPwd} onClose={() => setShowPwd(false)} />
    <DeleteAccountModal open={showDel} onClose={() => setShowDel(false)} />
    </>
  );
}
