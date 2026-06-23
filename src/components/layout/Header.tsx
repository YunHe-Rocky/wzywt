"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";

interface User { id: number; username: string }

export function Header() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => {
      setUser(d.user);
      setLoading(false);
    });
  }, [pathname]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="border-b border-gray-800 px-6 py-3 flex items-center justify-between">
      <Link href="/" className="text-lg font-bold text-blue-400">演武堂</Link>
      <nav className="flex items-center gap-4 text-sm">
        {!loading && (
          user ? (
            <>
              <Link href="/me" className="hover:text-blue-400">{user.username}</Link>
              <Link href="/tournaments" className="hover:text-blue-400">赛事</Link>
              <button onClick={logout} className="text-gray-400 hover:text-white">退出</button>
            </>
          ) : (
            <Link href="/login" className="hover:text-blue-400">登录</Link>
          )
        )}
      </nav>
    </header>
  );
}
