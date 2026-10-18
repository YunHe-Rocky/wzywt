import { NextRequest, NextResponse } from "next/server";
import { withRequestCapacity } from "@/lib/request-capacity";
import { requireAuth } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/api-errors";
import { getRequestIp } from "@/lib/auth-rate-limit";
import { getSession } from "@/lib/session";
import { tryReadJsonRequest } from "@/lib/request-validation";
import { ServiceError } from "@/lib/service-error";
import { normalizeAuthUsername } from "@/features/auth/model";
import { changeRecoveryQuestion, lookupRecoveryQuestion } from "@/features/auth/server/credentials";
export const dynamic = "force-dynamic";
export const GET = withRequestCapacity(async (req: NextRequest) => {
  try {
    const username = normalizeAuthUsername(req.nextUrl.searchParams.get("username"));
    if (!username) throw new ServiceError("VALIDATION_ERROR", "请输入有效用户名");
    return NextResponse.json({ question: await lookupRecoveryQuestion(username, getRequestIp(req.headers)) });
  } catch (error) { return apiErrorResponse(error, { request: req, useCase: "auth.recovery-question" }); }
});
export const POST = withRequestCapacity(async (req: NextRequest) => {
  try {
    const user = await requireAuth();
    const body = await tryReadJsonRequest<Record<string, unknown>>(req);
    if (!body.ok) return body.response;
    const result = await changeRecoveryQuestion(user.userId, body.value, getRequestIp(req.headers));
    const session = await getSession(); session.sessionVersion = result.sessionVersion; await session.save();
    return NextResponse.json({ ok: true, question: result.question });
  } catch (error) { return apiErrorResponse(error, { request: req, useCase: "auth.change-recovery-question" }); }
});
