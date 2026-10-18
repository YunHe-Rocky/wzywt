import { NextRequest, NextResponse } from "next/server";
import { withRequestCapacity } from "@/lib/request-capacity";
import { requireAuth } from "@/lib/auth";
import { readFormDataRequest } from "@/lib/request-validation";
import { apiErrorResponse } from "@/lib/api-errors";
import { uploadAccountAvatar } from "@/features/profile/server/avatar-upload";
import { MAX_AVATAR_SIZE } from "@/features/profile/server/avatar";
export const dynamic = "force-dynamic";
export const POST = withRequestCapacity(async (req: NextRequest) => {
  try {
    const user = await requireAuth();
    const data = await readFormDataRequest(req, MAX_AVATAR_SIZE + 256 * 1024);
    return NextResponse.json({ avatar: await uploadAccountAvatar(user.userId, data.get("avatar")) });
  } catch (error) { return apiErrorResponse(error, { request: req, useCase: "profile.avatar" }); }
});
