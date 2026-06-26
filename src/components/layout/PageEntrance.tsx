"use client";

import { useTheme } from "@/themes/ThemeProvider";

interface Props {
  children: React.ReactNode;
  /** 错峰延迟 (秒) */
  stagger?: number;
}

export function PageEntrance({ children, stagger = 0 }: Props) {
  const { theme } = useTheme();
  const isAlt = theme === "alternate";
  const anim = isAlt
    ? `page-enter-alt 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) ${stagger}s both`
    : `page-enter-yanwu 0.35s ease-out ${stagger}s both`;

  return <div style={{ animation: anim }}>{children}</div>;
}
