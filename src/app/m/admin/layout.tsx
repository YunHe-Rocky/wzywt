import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { MobileAdminLayout } from "@/components/admin/MobileAdminLayout";

export default async function AdminMLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session.userId) { redirect("/"); }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { role: true, banned: true },
  });
  if (!user || user.role !== "admin" || user.banned) { redirect("/"); }
  if (session.role !== user.role) { session.role = user.role; await session.save(); }

  return <MobileAdminLayout username={session.username!}>{children}</MobileAdminLayout>;
}
