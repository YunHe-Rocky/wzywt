export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { registerAccount } from "@/features/auth/server/register";
import { apiErrorResponse } from "@/lib/api-errors";
import { getRequestIp } from "@/lib/auth-rate-limit";
import { readJsonRequest } from "@/lib/request-validation";
import { getSession } from "@/lib/session";

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  try {
    const user = await registerAccount(await readJsonRequest(request), getRequestIp(request.headers));
    const session = await getSession();
    session.userId = user.id;
    session.username = user.username;
    session.role = user.role;
    session.sessionVersion = user.sessionVersion;
    await session.save();
    return NextResponse.json({ id: user.id, username: user.username });
  } catch (error) {
    return apiErrorResponse(error, { request, useCase: "auth.register", startedAt });
  }
}