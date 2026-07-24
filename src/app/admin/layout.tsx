import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { AdminSidebar } from "@/web/components/admin/AdminSidebar";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session.userId) {
    redirect("/");
  }

  // Always verify against DB — Server Components can read but not write cookies
  if (session.role !== "admin") {
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { role: true, banned: true },
    });
    if (!user || user.role !== "admin" || user.banned) {
      redirect("/");
    }
  }

  return (
    <div className="admin-shell">
      <AdminSidebar username={session.username!} />
      <main className="admin-main" style={{ background: "var(--bg-card)" }}>{children}</main>
    </div>
  );
}
