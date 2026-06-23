import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "王者演武堂",
  description: "王者荣耀内战分队系统",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="font-sans bg-gray-950 text-gray-100 min-h-screen">{children}</body>
    </html>
  );
}
