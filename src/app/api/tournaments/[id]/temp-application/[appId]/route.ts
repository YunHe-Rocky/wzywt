export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticate } from "@/lib/auth";
import {
  addTemporaryTournamentPlayer,
  TournamentCapacityError,
} from "@/features/tournaments/server/capacity";
import { tryReadJsonRequest } from "@/lib/request-validation";

export async function PUT(
  req: NextRequest,
  props: { params: Promise<{ id: string; appId: string }> }
) {
  const params = await props.params;
  const auth = await authenticate();
  if (!auth.ok) return NextResponse.json({ error: auth.code === "BANNED" ? "账号已被封禁" : "请先登录" }, { status: auth.code === "BANNED" ? 403 : 401 });
  const { userId } = auth.user;
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const tournamentId = parseInt(params.id);
  const appId = parseInt(params.appId);
  const body = await tryReadJsonRequest<{ status?: unknown }>(req);
  if (!body.ok) return body.response;
  const { status } = body.value;

  const admin = await prisma.tournamentAdmin.findFirst({ where: { tournamentId, userId } });
  if (!admin) return NextResponse.json({ error: "仅管理员审批" }, { status: 403 });

  const app = await prisma.tempPlayerApplication.findFirst({ where: { id: appId, tournamentId } });
  if (!app) return NextResponse.json({ error: "申请不存在" }, { status: 404 });

  if (status === "approved") {
    try {
      await addTemporaryTournamentPlayer({
        tournamentId,
        tempName: app.tempName,
        applicationId: appId,
      });
      return NextResponse.json({ ok: true });
    } catch (error) {
      if (error instanceof TournamentCapacityError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      throw error;
    }
  }

  if (status !== "rejected") {
    return NextResponse.json({ error: "无效的审批状态" }, { status: 400 });
  }
  await prisma.tempPlayerApplication.update({ where: { id: appId }, data: { status } });
  return NextResponse.json({ ok: true });
}
