import { withRequestCapacity } from "@/lib/request-capacity";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { resourceScheduler } from "@/features/resource-scheduler/server/registry";

async function handlePOST() {
  const session = await getSession();
  if (session.userId) resourceScheduler.releaseUserLeases(session.userId);
  session.destroy();
  return NextResponse.json({ ok: true });
}

export const POST = withRequestCapacity(handlePOST);
