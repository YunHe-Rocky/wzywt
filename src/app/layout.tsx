import "./globals.css";
import "@/web/styles/arena.css";
import "@/web/styles/arena-motion.css";
import "@/web/styles/arena-glass.css";
import type { Metadata } from "next";
import { ThemeLayout } from "@/web/components/layout/ThemeLayout";
import { ToastProvider } from "@/web/components/ui/Toast";
import { BackgroundOrbs } from "@/web/components/layout/BackgroundOrbs";
import { CursorLighting } from "@/web/components/layout/CursorLighting";
import { ThemeProvider } from "@/web/themes/ThemeProvider";

export const metadata: Metadata = {
  title: "王者演武堂",
  description: "王者荣耀内战分队系统",
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" data-theme="yanwu" suppressHydrationWarning>
      <body className="font-sans" style={{ background: "var(--bg-root)", color: "var(--text)", minHeight: "100dvh" }} suppressHydrationWarning>
        <BackgroundOrbs />
        <CursorLighting />
        <ThemeProvider>
          <ToastProvider>
            <ThemeLayout>{children}</ThemeLayout>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
