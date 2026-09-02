import { getIronSession, SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import { resolveSessionCookieSecure } from "@/lib/session-config";

export interface SessionData {
  userId?: number;
  username?: string;
  role?: string;
  sessionVersion?: number;
}

const DEVELOPMENT_SESSION_SECRET = "development-only-session-secret-32-chars";

export function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET is required in production");
  }
  return DEVELOPMENT_SESSION_SECRET;
}

export const sessionOptions: SessionOptions = {
  password: getSessionSecret(),
  cookieName: "wzyt_session",
  cookieOptions: {
    secure: resolveSessionCookieSecure(),
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 90, // 三个月
  },
};

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions);
}
