import { redirect } from "next/navigation";
import { authorizeSuperAdmin } from "@/lib/permissions";
import { AdminShell } from "@/web/components/admin/AdminShell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const authorization = await authorizeSuperAdmin();
  if (!authorization.ok) redirect("/");
  return <AdminShell username={authorization.user.username}>{children}</AdminShell>;
}
