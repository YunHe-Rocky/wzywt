export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { authorizeSuperAdmin } from "@/lib/permissions";
import { AnnouncementValidationError } from "@/features/announcements/model";
import {
  deleteAnnouncement,
  isAnnouncementNotFound,
  updateAnnouncement,
} from "@/features/announcements/server/service";

export async function PUT(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const authorization = await authorizeSuperAdmin();
  const userId = authorization.ok ? authorization.user.userId : 0;
  if (!userId) return NextResponse.json({ error: "无权限" }, { status: 403 });

  try {
    const updated = await updateAnnouncement(
      Number(params.id),
      await req.json().catch(() => null),
    );
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof AnnouncementValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (isAnnouncementNotFound(error)) {
      return NextResponse.json({ error: "公告不存在" }, { status: 404 });
    }
    throw error;
  }
}

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const authorization = await authorizeSuperAdmin();
  const userId = authorization.ok ? authorization.user.userId : 0;
  if (!userId) return NextResponse.json({ error: "无权限" }, { status: 403 });

  try {
    await deleteAnnouncement(Number(params.id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AnnouncementValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (isAnnouncementNotFound(error)) {
      return NextResponse.json({ error: "公告不存在" }, { status: 404 });
    }
    throw error;
  }
}
