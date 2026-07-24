"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser, logout as logoutRequest, type SessionUser } from "./api";

export function useAuth() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loaded, setLoaded] = useState(false);
  const router = useRouter();

  useEffect(() => {
    getCurrentUser()
      .then(({ data }) => {
        setUser(data.user ?? null);
        setLoaded(true);
      })
      .catch(() => {
        setUser(null);
        setLoaded(false);
      });
  }, []);

  const logout = useCallback(async () => {
    await logoutRequest();
    setUser(null);
    router.push("/login"); router.refresh();
  }, [router]);

  return { user, loaded, logout };
}
