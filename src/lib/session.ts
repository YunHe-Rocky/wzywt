import { getIronSession, SessionOptions } from "iron-session";

export interface SessionData {
  userId?: number;
  username?: string;
}

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET || "fallback-dev-secret-at-least-32-chars!!",
  cookieName: "wzyt_session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  },
};

export async function getSession() {
  const { cookies } = await import("next/headers");
  return getIronSession<SessionData>(cookies(), sessionOptions);
}
