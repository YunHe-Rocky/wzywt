import "./globals.css";
import type { Metadata } from "next";
import { ThemeLayout } from "@/web/components/layout/ThemeLayout";
import { CursorLighting } from "@/web/components/layout/CursorLighting";
import { BackgroundOrbs } from "@/web/components/layout/BackgroundOrbs";
import { ToastProvider } from "@/web/components/ui/Toast";
import { ThemeProvider } from "@/web/themes/ThemeProvider";

export const metadata: Metadata = {
  title: "王者演武堂",
  description: "王者荣耀内战分队系统",
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning style={{ overflowX: "hidden" }}>
      <body className="font-sans overflow-x-hidden" style={{ background: "var(--bg-root)", color: "var(--text)", minHeight: "100vh", maxWidth: "100vw" }} suppressHydrationWarning>
        <ThemeProvider>
          <ToastProvider>
            <BackgroundOrbs />
            <CursorLighting />
            <ThemeLayout>{children}</ThemeLayout>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
