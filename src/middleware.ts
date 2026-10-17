import { NextRequest, NextResponse } from "next/server";
import { parsePublicOrigin, resolveDeploymentEntry } from "@/lib/public-origin";
import { resourceGovernor } from "@/lib/resource-governor";
import { randomUUID } from "node:crypto";
import { externalRequestCost, externalRequestLane } from "@/core/resource-policy";

const PUBLIC_PATHS = ["/login", "/register", "/heroes", "/tournaments", "/changelog", "/monitor", "/debug", "/equipment"];
const PROTECTED_PREFIXES = ["/me", "/admin"];
function matchesPath(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}
// 首页 "/" 也算公开（basePath 为空时处理）
function isPublicPath(path: string): boolean {
  if (path === "/" || path === "") return true;
  return PUBLIC_PATHS.some((p) => matchesPath(path, p));
}
function isProtectedPath(path: string): boolean {
  return PROTECTED_PREFIXES.some((p) => matchesPath(path, p));
}
const PUBLIC_API = ["/api/health", "/api/auth", "/api/official-news", "/api/announcements", "/api/changelog", "/api/tournaments/public", "/api/heroes", "/api/equipment", "/api/resources"];
const STATIC_PREFIXES = ["/_next", "/public", "/art"];
const STATIC_FILES = new Set(["/favicon.ico", "/robots.txt", "/sitemap.xml"]);
const SESSION_COOKIE = "wzyt_session";

const MOBILE_UA = /Android|iPhone|iPad|iPod|webOS|BlackBerry|Windows Phone|Mobile/i;

function isMobile(req: NextRequest): boolean {
  const ua = req.headers.get("user-agent") || "";
  return MOBILE_UA.test(ua);
}

function externalRedirect(req: NextRequest, pathname: string, login = false): NextResponse {
  try {
    const configured = process.env.PUBLIC_ORIGIN;
    const production = process.env.NODE_ENV === "production";
    if (production && !configured) throw new Error("PUBLIC_ORIGIN is required");
    // Forwarding headers are deliberately not an authority for redirects.
    const origin = production || process.env.DEPLOY_ENVIRONMENT
      ? resolveDeploymentEntry(configured || "", process.env.DEPLOY_ENVIRONMENT, process.env.SESSION_COOKIE_SECURE).origin
      : parsePublicOrigin(configured || req.nextUrl.origin);
    const url = new URL(origin);
    url.pathname = pathname;
    if (login) url.searchParams.set("redirect", req.nextUrl.pathname + req.nextUrl.search);
    else url.search = req.nextUrl.search;
    const response = NextResponse.redirect(url);
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Vary", "User-Agent");
    return response;
  } catch {
    return new NextResponse("站点地址配置暂不可用，请联系管理员。", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}

function routeRequest(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow static files
  if (STATIC_FILES.has(pathname) || STATIC_PREFIXES.some((p) => matchesPath(pathname, p))) {
    return NextResponse.next();
  }

  // Allow API routes (no mobile redirect)
  if (pathname.startsWith("/api/")) {
    // Auth check for protected APIs
    if (!PUBLIC_API.some((p) => matchesPath(pathname, p))) {
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
    return externalRedirect(req, mobilePath);
  }

  if (!mobile && alreadyMobile) {
    return externalRedirect(req, pathname.slice(2) || "/");
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
    return externalRedirect(req, loginPath, true);
  }

  return NextResponse.next();
}

export function middleware(req: NextRequest) {
  resourceGovernor.start("web");
  const path = req.nextUrl.pathname;
  const requestId = randomUUID();
  // Health must remain reachable when ordinary traffic is being shed.
  if (path !== "/api/health" && !STATIC_FILES.has(path) && !STATIC_PREFIXES.some(prefix => matchesPath(path, prefix))) {
    const cost = externalRequestCost(path, req.method, req.headers.get("content-type") || "");
    const admission = resourceGovernor.admit(cost, externalRequestLane(path, req.method));
    if (!admission.allowed) return NextResponse.json({ error: "当前访问繁忙，请稍后重试", code: "RESOURCE_BUSY", requestId }, {
      status: 503, headers: { "Retry-After": String(admission.retryAfterSeconds), "Cache-Control": "no-store", "x-request-id": requestId },
    });
  }
  const headers = new Headers(req.headers);
  headers.set("x-request-id", requestId);
  const routed = routeRequest(req);
  // Pass a trusted generated ID through the middleware continuation only.
  if (routed.headers.get("x-middleware-next") === "1") {
    const response = NextResponse.next({ request: { headers } });
    response.headers.set("x-request-id", requestId);
    return response;
  }
  routed.headers.set("x-request-id", requestId);
  return routed;
}

export const config = {
  runtime: "nodejs",
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:ico|png|jpg|jpeg|webp|avif|svg|css|js)).*)"],
};
