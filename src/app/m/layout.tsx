import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "王者演武堂",
  description: "王者荣耀内战分队系统",
};

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen pb-24 px-3 pt-3 max-w-full overflow-x-hidden">{children}</div>
  );
}
