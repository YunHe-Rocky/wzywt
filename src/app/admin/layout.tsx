import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { AdminSidebar } from "@/components/admin/AdminSidebar";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session.userId) {
    redirect("/");
  }

  // Always verify against DB so role changes take effect immediately
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { role: true, banned: true },
  });
  if (!user || user.role !== "admin" || user.banned) {
    redirect("/");
  }
  if (session.role !== user.role) {
    session.role = user.role;
    await session.save();
  }

  return (
    <div className="min-h-screen flex">
      <AdminSidebar username={session.username!} />
      <main className="flex-1 min-w-0 rounded-tr-2xl rounded-br-2xl rounded-bl-2xl" style={{ background: "var(--bg-card)" }}>{children}</main>
    </div>
  );
}
