import "./globals.css";
import type { Metadata } from "next";
import { ThemeLayout } from "@/components/layout/ThemeLayout";
import { CursorLighting } from "@/components/layout/CursorLighting";
import { BackgroundOrbs } from "@/components/layout/BackgroundOrbs";
import { ToastProvider } from "@/components/ui/Toast";
import { ThemeProvider } from "@/themes/ThemeProvider";

export const metadata: Metadata = {
  title: "王者演武堂",
  description: "王者荣耀内战分队系统",
  viewport: { width: "device-width", initialScale: 1 },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning style={{ overflowX: "hidden" }}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var h=window.location.hash;var m={"#1":"yanwu","#2":"alternate"};var t=m[h]||"yanwu";document.documentElement.setAttribute("data-theme",t);})()`,
          }}
        />
      </head>
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
