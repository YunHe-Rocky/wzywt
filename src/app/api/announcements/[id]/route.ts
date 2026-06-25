export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId } = await requireAuth().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const id = parseInt(params.id);
  const { title, version, brief, content, slug, published } = await req.json();

  const updated = await prisma.announcement.update({
    where: { id },
    data: {
      ...(title !== undefined ? { title } : {}),
      ...(version !== undefined ? { version } : {}),
      ...(brief !== undefined ? { brief } : {}),
      ...(content !== undefined ? { content } : {}),
      ...(slug !== undefined ? { slug } : {}),
      ...(published !== undefined ? { published } : {}),
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId } = await requireAuth().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const id = parseInt(params.id);
  await prisma.announcement.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
