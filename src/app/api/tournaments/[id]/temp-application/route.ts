import { withRequestCapacity } from "@/lib/request-capacity";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticate } from "@/lib/auth";
import { tryParseRouteId, tryReadJsonRequest } from "@/lib/request-validation";

async function handlePOST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await authenticate();
  if (!auth.ok) return NextResponse.json({ error: auth.code === "BANNED" ? "账号已被封禁" : "请先登录" }, { status: auth.code === "BANNED" ? 403 : 401 });
  const { userId } = auth.user;
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const tournamentId = tryParseRouteId(params.id, "赛事 ID");
  if (tournamentId instanceof NextResponse) return tournamentId;
  const body = await tryReadJsonRequest<{ tempName?: unknown }>(req);
  if (!body.ok) return body.response;
  const tempName = typeof body.value.tempName === "string" ? body.value.tempName.trim() : "";
  if (tempName.length > 32) return NextResponse.json({ error: "临时选手名称不能超过32个字符" }, { status: 400 });

  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament || tournament.status !== "recruiting") {
    return NextResponse.json({ error: "赛事不可用" }, { status: 400 });
  }

  const app = await prisma.tempPlayerApplication.create({
    data: { tournamentId, applicantId: userId, tempName: tempName || null, status: "pending" },
  });

  return NextResponse.json({ application: app });
}

async function handleGET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await authenticate();
  if (!auth.ok) return NextResponse.json({ error: auth.code === "BANNED" ? "账号已被封禁" : "请先登录" }, { status: auth.code === "BANNED" ? 403 : 401 });
  const { userId } = auth.user;
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const tournamentId = tryParseRouteId(params.id, "赛事 ID");
  if (tournamentId instanceof NextResponse) return tournamentId;
  const admin = await prisma.tournamentAdmin.findFirst({ where: { tournamentId, userId } });
  if (!admin) return NextResponse.json({ error: "仅管理员可查看申请" }, { status: 403 });

  const apps = await prisma.tempPlayerApplication.findMany({
    where: { tournamentId, status: "pending" },
    include: { applicant: { select: { id: true, username: true } } },
  });

  return NextResponse.json({ applications: apps });
}

export const POST = withRequestCapacity(handlePOST);
export const GET = withRequestCapacity(handleGET);
