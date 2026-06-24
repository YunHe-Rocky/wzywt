import { getIronSession, SessionOptions } from "iron-session";
import { cookies } from "next/headers";

export interface SessionData {
  userId?: number;
  username?: string;
}

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET || "fallback-dev-secret-at-least-32-chars!!",
  cookieName: "wzyt_session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production" && process.env.SESSION_SECURE !== "false",
    maxAge: 60 * 60 * 24 * 90, // 三个月
  },
};

export async function getSession() {
  return getIronSession<SessionData>(cookies(), sessionOptions);
}
