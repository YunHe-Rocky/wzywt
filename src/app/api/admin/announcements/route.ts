export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/permissions";
import { prisma } from "@/lib/db";

export async function GET() {
  const { userId } = await requireSuperAdmin().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const list = await prisma.announcement.findMany({
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    announcements: list.map((a) => ({
      ...a,
      date: a.createdAt.toISOString().split("T")[0],
    })),
  });
}

export async function POST(req: NextRequest) {
  const { userId } = await requireSuperAdmin().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { title, version, brief, content, slug } = await req.json();
  if (!title || !brief || !slug) {
    return NextResponse.json({ error: "标题、摘要、slug 为必填" }, { status: 400 });
  }

  const created = await prisma.announcement.create({
    data: { title, version: version || null, brief, content: content || null, slug },
  });
  return NextResponse.json(created, { status: 201 });
}
