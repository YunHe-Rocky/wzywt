import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const full = searchParams.get("full") === "true";

  const announcements = await prisma.announcement.findMany({
    where: { published: true },
    orderBy: [{ version: "desc" }, { createdAt: "desc" }],
    select: full
      ? { title: true, version: true, brief: true, content: true, slug: true, createdAt: true }
      : { title: true, version: true, brief: true, slug: true, createdAt: true },
  });

  const mapped = announcements.map((a) => ({
    ...a,
    date: a.createdAt.toISOString().split("T")[0],
  }));

  return NextResponse.json({ announcements: mapped });
}

export async function POST(req: NextRequest) {
  const { userId } = await requireAuth().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const { title, version, brief, content, slug } = await req.json();
  if (!title || !brief || !slug) {
    return NextResponse.json({ error: "标题、摘要、slug 为必填" }, { status: 400 });
  }

  const created = await prisma.announcement.create({
    data: { title, version: version || null, brief, content: content || null, slug },
  });
  return NextResponse.json(created, { status: 201 });
}
