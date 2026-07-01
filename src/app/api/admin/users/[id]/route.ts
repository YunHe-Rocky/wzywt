export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/permissions";
import { prisma } from "@/lib/db";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId } = await requireSuperAdmin().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const targetId = parseInt(params.id);
  if (targetId === userId) {
    return NextResponse.json({ error: "不能操作自己" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id: targetId }, select: { role: true } });
  if (!target) return NextResponse.json({ error: "用户不存在" }, { status: 404 });
  if (target.role === "admin") return NextResponse.json({ error: "不能操作管理员" }, { status: 403 });

  const { banned, role } = await req.json();
  const data: Record<string, unknown> = {};
  if (banned !== undefined) data.banned = banned;
  if (role !== undefined && ["user", "admin"].includes(role)) data.role = role;

  const user = await prisma.user.update({
    where: { id: targetId },
    data,
    select: { id: true, username: true, role: true, banned: true },
  });

  return NextResponse.json({ ok: true, user });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId } = await requireSuperAdmin().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const targetId = parseInt(params.id);
  if (targetId === userId) {
    return NextResponse.json({ error: "不能删除自己" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id: targetId }, select: { role: true } });
  if (!target) return NextResponse.json({ error: "用户不存在" }, { status: 404 });
  if (target.role === "admin") return NextResponse.json({ error: "不能删除管理员" }, { status: 403 });

  await prisma.user.delete({ where: { id: targetId } });
  return NextResponse.json({ ok: true });
}
