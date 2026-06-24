import "./globals.css";
import type { Metadata } from "next";
import { Header } from "@/components/layout/Header";
import { ToastProvider } from "@/components/ui/Toast";

export const metadata: Metadata = {
  title: "王者演武堂",
  description: "王者荣耀内战分队系统",
  viewport: { width: "device-width", initialScale: 1 },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <head>
        <meta name="viewport" content="width=1200, initial-scale=1.0" />
      </head>
      <body className="font-sans" style={{ background: "var(--bg-root)", color: "var(--text)", minHeight: "100vh", minWidth: 1200 }}>
        <ToastProvider>
          <Header />
          <main className="main-content">{children}</main>
        </ToastProvider>
      </body>
    </html>
  );
}
