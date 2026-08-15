export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { listEquipment } from "@/features/equipment/server/list";

export async function GET() {
  return NextResponse.json(await listEquipment());
}
