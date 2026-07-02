import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { MobileAdminLayout } from "@/components/admin/MobileAdminLayout";

export default async function AdminMLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session.userId) { redirect("/"); }

  if (session.role !== "admin") {
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { role: true, banned: true },
    });
    if (!user || user.role !== "admin" || user.banned) { redirect("/"); }
  }

  return <MobileAdminLayout username={session.username!}>{children}</MobileAdminLayout>;
}
