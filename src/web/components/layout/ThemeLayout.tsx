"use client";

import { Suspense } from "react";
import { usePathname } from "next/navigation";
import { Header } from "./Header";
import { Dock } from "./alternate/Dock";
import { LoginReveal } from "@/web/components/home/LoginReveal";

const FULLSCREEN_PATHS = ["/login", "/register", "/admin", "/debug"];

export function ThemeLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const basePath = pathname.replace(/^\/m/, "") || "/";
  const isFullscreen = FULLSCREEN_PATHS.some(p => basePath.startsWith(p));

  if (isFullscreen) {
    return <main className="main-content main-content--fullscreen">{children}</main>;
  }

  return (
    <>
      <Suspense fallback={null}>
        <LoginReveal />
      </Suspense>
      <Header />
      <main className="main-content">{children}</main>
      <Dock />
    </>
  );
}
