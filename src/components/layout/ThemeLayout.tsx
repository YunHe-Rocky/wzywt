"use client";

import { Suspense } from "react";
import { usePathname } from "next/navigation";
import { useTheme } from "@/themes/ThemeProvider";
import { YanwuHeader } from "./yanwu/Header";
import { AlternateHeader } from "./alternate/Header";
import { Dock } from "./alternate/Dock";
import { LoginReveal } from "@/components/home/LoginReveal";

const FULLSCREEN_PATHS = ["/login", "/register"];

export function ThemeLayout({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  const pathname = usePathname();

  // 登录/注册页：无 Header，无 Dock，纯表单
  const basePath = pathname.replace(/^\/m/, "") || "/";
  const isFullscreen = FULLSCREEN_PATHS.some(p => basePath.startsWith(p));

  if (isFullscreen) {
    return <main className="main-content">{children}</main>;
  }

  return (
    <>
      <Suspense fallback={null}>
        <LoginReveal />
      </Suspense>
      {theme === "alternate" ? <AlternateHeader /> : <YanwuHeader />}
      <main className="main-content">{children}</main>
      {theme === "alternate" && <Dock />}
    </>
  );
}
