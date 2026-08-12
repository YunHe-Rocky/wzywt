export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { authorizeSuperAdmin } from "@/lib/permissions";
import { AnnouncementValidationError } from "@/features/announcements/model";
import {
  createAnnouncement,
  listAdminAnnouncements,
} from "@/features/announcements/server/service";

export async function GET() {
  const authorization = await authorizeSuperAdmin();
  const userId = authorization.ok ? authorization.user.userId : 0;
  if (!userId) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const list = await listAdminAnnouncements();

  return NextResponse.json({
    announcements: list.map((a) => ({
      ...a,
      date: a.createdAt.toISOString().split("T")[0],
    })),
  });
}

export async function POST(req: NextRequest) {
  const authorization = await authorizeSuperAdmin();
  const userId = authorization.ok ? authorization.user.userId : 0;
  if (!userId) return NextResponse.json({ error: "无权限" }, { status: 403 });

  try {
    const created = await createAnnouncement(await req.json().catch(() => null));
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (error instanceof AnnouncementValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
