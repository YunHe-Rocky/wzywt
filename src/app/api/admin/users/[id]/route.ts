export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { authorizeSuperAdmin } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { deleteUserAndOwnedTournaments } from "@/features/users/server/deleteUser";
import { tryReadJsonRequest } from "@/lib/request-validation";

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const authorization = await authorizeSuperAdmin();
  const userId = authorization.ok ? authorization.user.userId : 0;
  if (!userId) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const targetId = Number(params.id);
  if (!Number.isSafeInteger(targetId) || targetId <= 0) {
    return NextResponse.json({ error: "无效的用户 ID" }, { status: 400 });
  }
  if (targetId === userId) {
    return NextResponse.json({ error: "不能操作自己" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id: targetId }, select: { role: true } });
  if (!target) return NextResponse.json({ error: "用户不存在" }, { status: 404 });
  if (target.role === "admin") return NextResponse.json({ error: "不能操作管理员" }, { status: 403 });

  const body = await tryReadJsonRequest<{ banned?: unknown; role?: unknown }>(req);
  if (!body.ok) return body.response;
  const { banned, role } = body.value;
  const data: Record<string, unknown> = {};
  if (banned !== undefined) {
    if (typeof banned !== "boolean") {
      return NextResponse.json({ error: "banned 必须为 boolean" }, { status: 400 });
    }
    data.banned = banned;
  }
  if (role !== undefined) {
    if (typeof role !== "string" || !["user", "admin"].includes(role)) {
      return NextResponse.json({ error: "无效的用户角色" }, { status: 400 });
    }
    data.role = role;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "没有可更新字段" }, { status: 400 });
  }
  data.sessionVersion = { increment: 1 };

  const user = await prisma.user.update({
    where: { id: targetId },
    data,
    select: { id: true, username: true, role: true, banned: true },
  });

  return NextResponse.json({ ok: true, user });
}

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const authorization = await authorizeSuperAdmin();
  const userId = authorization.ok ? authorization.user.userId : 0;
  if (!userId) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const targetId = Number(params.id);
  if (!Number.isSafeInteger(targetId) || targetId <= 0) {
    return NextResponse.json({ error: "无效的用户 ID" }, { status: 400 });
  }
  if (targetId === userId) {
    return NextResponse.json({ error: "不能删除自己" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id: targetId }, select: { role: true } });
  if (!target) return NextResponse.json({ error: "用户不存在" }, { status: 404 });
  if (target.role === "admin") return NextResponse.json({ error: "不能删除管理员" }, { status: 403 });

  await deleteUserAndOwnedTournaments(targetId);
  return NextResponse.json({ ok: true });
}
