"use client";

import { usePathname } from "next/navigation";

export default function PageTemplate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return <div key={pathname} className="yanwu-route-entrance">{children}</div>;
}
