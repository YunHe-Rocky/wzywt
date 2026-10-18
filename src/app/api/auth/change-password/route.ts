import { NextRequest, NextResponse } from "next/server";
import { withRequestCapacity } from "@/lib/request-capacity";
import { requireAuth } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/api-errors";
import { getRequestIp } from "@/lib/auth-rate-limit";
import { getSession } from "@/lib/session";
import { tryReadJsonRequest } from "@/lib/request-validation";
import { changeAccountPassword } from "@/features/auth/server/credentials";
export const dynamic = "force-dynamic";
export const POST = withRequestCapacity(async (req: NextRequest) => {
  try {
    const user = await requireAuth();
    const body = await tryReadJsonRequest<Record<string, unknown>>(req);
    if (!body.ok) return body.response;
    const result = await changeAccountPassword(user.userId, body.value, getRequestIp(req.headers));
    if (result.sessionVersion !== undefined) {
      const session = await getSession(); session.sessionVersion = result.sessionVersion; await session.save();
    }
    return NextResponse.json({ ok: true, ...(result.verified ? { verified: true } : {}) });
  } catch (error) { return apiErrorResponse(error, { request: req, useCase: "auth.change-password" }); }
});
