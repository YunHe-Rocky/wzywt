import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login", "/register", "/heroes", "/tournaments", "/changelog", "/monitor", "/debug", "/equipment"];
const PROTECTED_PREFIXES = ["/me", "/admin"];
// 首页 "/" 也算公开（basePath 为空时处理）
function isPublicPath(path: string): boolean {
  if (path === "/" || path === "") return true;
  return PUBLIC_PATHS.some((p) => path.startsWith(p));
}
function isProtectedPath(path: string): boolean {
  return PROTECTED_PREFIXES.some((p) => path.startsWith(p));
}
const PUBLIC_API = ["/api/health", "/api/auth", "/api/official-news", "/api/announcements", "/api/changelog", "/api/tournaments/public", "/api/heroes", "/api/equipment"];
const STATIC_PREFIXES = ["/_next", "/favicon", "/public", "/robots.txt", "/sitemap.xml"];
const SESSION_COOKIE = "wzyt_session";

const MOBILE_UA = /Android|iPhone|iPad|iPod|webOS|BlackBerry|Windows Phone|Mobile/i;

function isMobile(req: NextRequest): boolean {
  const ua = req.headers.get("user-agent") || "";
  return MOBILE_UA.test(ua);
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow static files
  if (STATIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Allow API routes (no mobile redirect)
  if (pathname.startsWith("/api/")) {
    // Auth check for protected APIs
    if (!PUBLIC_API.some((p) => pathname.startsWith(p))) {
      if (!req.cookies.has(SESSION_COOKIE)) {
        return NextResponse.json({ error: "请先登录" }, { status: 401 });
      }
    }
    return NextResponse.next();
  }

  // ── Mobile redirect ──
  const mobile = isMobile(req);
  const alreadyMobile = pathname.startsWith("/m/") || pathname === "/m";

  if (mobile && !alreadyMobile) {
    const mobilePath = pathname === "/" ? "/m" : "/m" + pathname;
    const mobileUrl = new URL(mobilePath, req.url);
    mobileUrl.hash = req.nextUrl.hash;
    mobileUrl.search = req.nextUrl.search;
    return NextResponse.redirect(mobileUrl);
  }

  // ── Auth check ──
  const basePath = alreadyMobile ? pathname.replace(/^\/m/, "") || "/" : pathname;

  if (isPublicPath(basePath)) {
    return NextResponse.next();
  }

  // Only redirect to login for known protected routes; let unknown paths 404
  if (!isProtectedPath(basePath)) {
    return NextResponse.next();
  }

  if (!req.cookies.has(SESSION_COOKIE)) {
    const loginPath = alreadyMobile ? "/m/login" : "/login";
    const loginUrl = new URL(loginPath, req.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:ico|png|jpg|svg|css|js)).*)"],
};
