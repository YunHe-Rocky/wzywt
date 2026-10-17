import { withRequestCapacity } from "@/lib/request-capacity";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { authorizeSuperAdmin } from "@/lib/permissions";
import { AnnouncementValidationError } from "@/features/announcements/model";
import {
  deleteAnnouncement,
  isAnnouncementNotFound,
  updateAnnouncement,
} from "@/features/announcements/server/service";
import { tryReadJsonRequest } from "@/lib/request-validation";

async function handlePUT(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const authorization = await authorizeSuperAdmin();
  const userId = authorization.ok ? authorization.user.userId : 0;
  if (!userId) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const body = await tryReadJsonRequest(req);
  if (!body.ok) return body.response;
  try {
    const updated = await updateAnnouncement(
      Number(params.id),
      body.value,
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

async function handleDELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
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

export const PUT = withRequestCapacity(handlePUT);
export const DELETE = withRequestCapacity(handleDELETE);
