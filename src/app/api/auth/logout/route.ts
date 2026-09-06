export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { resourceScheduler } from "@/features/resource-scheduler/server/registry";

export async function POST() {
  const session = await getSession();
  if (session.userId) resourceScheduler.releaseUserLeases(session.userId);
  session.destroy();
  return NextResponse.json({ ok: true });
}
