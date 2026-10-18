import React from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "@/web/themes/ThemeProvider";
import { ToastProvider } from "@/web/components/ui/Toast";
import { ThemeLayout } from "@/web/components/layout/ThemeLayout";
import { AdminShell } from "@/web/components/admin/AdminShell";
import { AdminDashboard } from "@/web/components/admin/AdminDashboard";
import { CombatPostManager } from "@/web/components/admin/CombatPostManager";
import { AnnouncementManager } from "@/web/components/admin/AnnouncementManager";
import { HistoryThemeStudio } from "@/web/components/history-theme/HistoryThemeStudio";
import { MonitorDashboard } from "@/web/MonitorDashboard";
import Users from "@/app/admin/users/page";
import Rooms from "@/app/admin/tournaments/page";
import Heroes from "@/app/admin/heroes/page";
import Settings from "@/app/admin/settings/page";
import { usePathname } from "./routing-shim";

const params = new URLSearchParams(location.search);
const userId = Number(params.get("owner") || 1);
const username = params.get("case") === "long" ? "ABCDEFGHIJKLMNOPQRSTUVWXYZ山河同游0123456789" : "松风堂主";
const pages: Record<string, React.ComponentType> = {
  "/admin": AdminDashboard, "/admin/users": Users, "/admin/tournaments": Rooms,
  "/admin/combat": CombatPostManager, "/admin/announcements": AnnouncementManager,
  "/admin/history-themes": HistoryThemeStudio, "/admin/heroes": Heroes,
  "/admin/monitor": MonitorDashboard, "/admin/settings": Settings,
};
function App() {
  const pathname = usePathname().replace(/^\/m(?=\/|$)/, "");
  const Page = pages[pathname];
  return <ThemeProvider><ToastProvider><ThemeLayout>{Page
    ? <AdminShell userId={userId} username={username}><Page /></AdminShell>
    : <div><h1>已离开后台</h1></div>}
  </ThemeLayout></ToastProvider></ThemeProvider>;
}
createRoot(document.getElementById("root")!).render(<App />);
