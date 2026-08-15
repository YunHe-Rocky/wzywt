export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { authorizeSuperAdmin } from "@/lib/permissions";
import { AnnouncementValidationError } from "@/features/announcements/model";
import { createAnnouncement, listPublishedAnnouncements } from "@/features/announcements/server/service";
import { tryReadJsonRequest } from "@/lib/request-validation";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const full = searchParams.get("full") === "true";

  return NextResponse.json({ announcements: await listPublishedAnnouncements(full) });
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
