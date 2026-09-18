import { redirect } from "next/navigation";
import { authorizeSuperAdmin } from "@/lib/permissions";
import { AdminShell } from "@/web/components/admin/AdminShell";

export default async function AdminMLayout({ children }: { children: React.ReactNode }) {
  const authorization = await authorizeSuperAdmin();
  if (!authorization.ok) redirect("/m");
  return <AdminShell userId={authorization.user.userId} username={authorization.user.username}>{children}</AdminShell>;
}
