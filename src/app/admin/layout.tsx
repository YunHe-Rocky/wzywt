import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { AdminSidebar } from "@/components/admin/AdminSidebar";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session.userId) {
    redirect("/");
  }

  let role = session.role;
  if (!role) {
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { role: true },
    });
    if (!user || user.role !== "admin") {
      redirect("/");
    }
    role = user.role;
    session.role = role;
    await session.save();
  }

  if (role !== "admin") {
    redirect("/");
  }

  return (
    <div className="min-h-screen flex">
      <AdminSidebar username={session.username!} />
      <main className="flex-1 min-w-0 rounded-tr-2xl rounded-br-2xl rounded-bl-2xl" style={{ background: "var(--bg-card)" }}>{children}</main>
    </div>
  );
}
