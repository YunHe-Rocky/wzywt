"use client";

import { useTheme } from "@/themes/ThemeProvider";
import { YanwuHeader } from "./yanwu/Header";
import { AlternateHeader } from "./alternate/Header";
import { Dock } from "./alternate/Dock";

export function ThemeLayout({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();

  return (
    <>
      {theme === "alternate" ? <AlternateHeader /> : <YanwuHeader />}
      <main className="main-content">{children}</main>
      {theme === "alternate" && <Dock />}
    </>
  );
}
