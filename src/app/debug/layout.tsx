import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export default async function DebugLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session.userId) {
    redirect("/login");
  }
  return <>{children}</>;
}
