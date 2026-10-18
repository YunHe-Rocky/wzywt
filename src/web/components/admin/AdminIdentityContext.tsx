"use client";

import { createContext, useContext, type ReactNode } from "react";

const AdminIdentityContext = createContext<number | null>(null);

export function AdminIdentityProvider({ userId, children }: { userId: number; children: ReactNode }) {
  return <AdminIdentityContext.Provider value={userId}>{children}</AdminIdentityContext.Provider>;
}

export function useAdminIdentity(): number | null {
  return useContext(AdminIdentityContext);
}
