"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { useAnnouncements } from "@/hooks/useAnnouncements";

export function AlternateHeader() {
  const { user, loaded, logout } = useAuth();
  const { latestVersion } = useAnnouncements(false);

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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

  return (
    <header className="sticky top-0 z-50 header-bar">
      <div className="header-inner-alt flex items-center gap-4">
        {/* Brand */}
        <Link href={withHash("/")} className="flex items-center gap-2 shrink-0 no-underline">
          <span className="text-[11px] font-bold tracking-wider text-[#777]">王者演武堂</span>
          <span className="text-[10px] font-semibold tracking-wider rounded px-1.5 leading-4 text-gold/70 border border-gold/15">
            {version}
          </span>
        </Link>

        <div className="flex-1" />

        {/* User */}
        {loaded && (user ? (
          <div ref={menuRef} className="relative">
            <button onClick={() => setMenuOpen(!menuOpen)}
              className="flex items-center gap-2 rounded-full px-2 py-0.5 hover:bg-black/5 transition-all">
              <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold bg-blue/8 text-[#4488f0] border border-blue/15">
                {user.username[0]}
              </span>
              <svg className={`w-3 h-3 transition-transform ${menuOpen ? "rotate-180" : ""} text-[#aaa]`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeWidth={2} d="M6 9l6 6 6-6" />
              </svg>
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full mt-2 w-48 py-1 rounded-2xl animate-slide-up"
                style={{ background: "rgba(255,255,255,0.7)", backdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,0.7)", boxShadow: "0 4px 24px rgba(0,0,0,0.06)" }}>
                <div className="px-4 py-3 border-b border-black/5">
                  <div className="flex items-center gap-2.5">
                    <span className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold bg-blue/8 text-[#4488f0]">{user.username[0]}</span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-[#333] truncate">{user.username}</div>
                      <div className="text-[10px] text-[#999]">召唤师</div>
                    </div>
                  </div>
                </div>
                <Link href={withHash("/me")} onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm no-underline text-[#666] hover:bg-black/3 hover:text-[#333]">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                  个人空间
                </Link>
                <div className="border-t border-black/5 my-1" />
                <button onClick={doLogout}
                  className="w-full text-left flex items-center gap-2 px-4 py-2.5 text-sm text-red/70 hover:text-red hover:bg-red/3">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                  退出登录
                </button>
              </div>
            )}
          </div>
        ) : (
          <Link href={withHash("/login")}
            className="flex items-center justify-center w-5 h-5 rounded-full bg-blue/10 text-[#4488f0] text-[9px] font-bold no-underline">
            ?
          </Link>
        ))}
      </div>
    </header>
  );
}
