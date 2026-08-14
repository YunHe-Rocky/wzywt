export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeSuperAdmin } from "@/lib/permissions";
import { AnnouncementValidationError } from "@/features/announcements/model";
import { createAnnouncement } from "@/features/announcements/server/service";
import { tryReadJsonRequest } from "@/lib/request-validation";

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
  const authorization = await authorizeSuperAdmin();
  const userId = authorization.ok ? authorization.user.userId : 0;
  if (!userId) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const body = await tryReadJsonRequest(req);
  if (!body.ok) return body.response;
  try {
    const created = await createAnnouncement(body.value);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (error instanceof AnnouncementValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
