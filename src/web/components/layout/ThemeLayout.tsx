"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Header } from "./Header";
import { Dock } from "./alternate/Dock";
import { LoginReveal } from "@/web/components/home/LoginReveal";
import { ArenaIntro, replayArenaIntro } from "@/web/components/arena/ArenaIntro";
import { ArenaIcon } from "@/web/components/arena/ArenaIcon";

const FULLSCREEN_PATHS = ["/login", "/register", "/admin", "/debug"];

export function ThemeLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const basePath = pathname.replace(/^\/m(?=\/|$)/, "") || "/";
  const prefix = /^\/m(?:\/|$)/.test(pathname) ? "/m" : "";
  const isFullscreen = FULLSCREEN_PATHS.some(p => basePath.startsWith(p));

  if (isFullscreen) {
    return <main className="main-content main-content--fullscreen">{children}</main>;
  }

  return (
    <>
      <Suspense fallback={null}>
        <LoginReveal />
      </Suspense>
      <a className="arena-skip" href="#main-content">跳至内容</a>
      <ArenaIntro />
      <Header />
      <main className="main-content" id="main-content" tabIndex={-1}>{children}
        <footer className="arena-footer"><div className="arena-footer-brand"><ArenaIcon name="crest" width="18" height="18" /><span>王者演武堂 · 和朋友，好好打一场</span></div><div className="arena-footer-links"><button type="button" onClick={replayArenaIntro}>重播开场</button><Link href={`${prefix}/changelog`}>更新日志</Link><Link href={`${prefix}/tournaments`}>去组一局<ArenaIcon name="arrow" width="14" height="14" /></Link></div></footer>
      </main>
      <Dock />
    </>
  );
}
