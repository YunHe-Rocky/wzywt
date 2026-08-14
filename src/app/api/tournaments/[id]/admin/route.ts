export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticate } from "@/lib/auth";
import { tryReadJsonRequest } from "@/lib/request-validation";

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await authenticate();
  if (!auth.ok) return NextResponse.json({ error: auth.code === "BANNED" ? "账号已被封禁" : "请先登录" }, { status: auth.code === "BANNED" ? 403 : 401 });
  const { userId } = auth.user;
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const tournamentId = parseInt(params.id);
  const body = await tryReadJsonRequest<{ targetUserId?: unknown; action?: unknown }>(req);
  if (!body.ok) return body.response;
  const { targetUserId, action } = body.value;
  if (!Number.isSafeInteger(targetUserId) || typeof targetUserId !== "number" || !["promote", "demote"].includes(String(action))) {
    return NextResponse.json({ error: "管理操作参数无效" }, { status: 400 });
  }

  const isOwner = await prisma.tournamentAdmin.findFirst({
    where: { tournamentId, userId, role: "owner" },
  });
  if (!isOwner) return NextResponse.json({ error: "仅房主可管理管理员" }, { status: 403 });

  if (action === "promote") {
    await prisma.tournamentAdmin.upsert({
      where: { tournamentId_userId: { tournamentId, userId: targetUserId } },
      update: { role: "co_owner" },
      create: { tournamentId, userId: targetUserId, role: "co_owner" },
    });
  } else if (action === "demote") {
    const target = await prisma.tournamentAdmin.findFirst({
      where: { tournamentId, userId: targetUserId },
    });
    if (target?.role === "owner") {
      return NextResponse.json({ error: "不能撤销房主" }, { status: 400 });
    }
    await prisma.tournamentAdmin.deleteMany({ where: { tournamentId, userId: targetUserId } });
  }

  return NextResponse.json({ ok: true });
}
