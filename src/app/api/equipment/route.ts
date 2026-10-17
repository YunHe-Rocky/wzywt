import { withRequestCapacity } from "@/lib/request-capacity";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { listEquipment } from "@/features/equipment/server/list";

async function handleGET() {
  return NextResponse.json(await listEquipment());
}

export const GET = withRequestCapacity(handleGET);
