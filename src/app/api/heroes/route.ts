export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { authorizeSuperAdmin } from "@/lib/permissions";
import { queueHeroSync } from "@/features/heroes/server/sync-jobs";
import { apiErrorResponse } from "@/lib/api-errors";
import { listHeroes } from "@/features/heroes/server/list";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const roleTypeFilter = searchParams.get("role_type");
  const heroTypeFilter = searchParams.get("hero_type");

  return NextResponse.json(await listHeroes({ roleType: roleTypeFilter, heroType: heroTypeFilter }));
}

export async function POST(req: NextRequest) {
  try {
    const authorization = await authorizeSuperAdmin();
    const userId = authorization.ok ? authorization.user.userId : 0;
    if (!userId) return NextResponse.json({ error: "无权限" }, { status: 403 });
    const progress = await queueHeroSync(userId);
    return NextResponse.json({ ok: true, jobId: progress.jobId, message: progress.message }, { status: 202 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
