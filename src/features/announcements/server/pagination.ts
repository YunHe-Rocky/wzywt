import { NextResponse } from "next/server";
export function parseAnnouncementPage(params: URLSearchParams) {
  const page = params.get("page") || "1"; const pageSize = params.get("pageSize") || "50";
  if (!/^[1-9]\d*$/.test(page) || Number(page) > 10_000 || !/^[1-9]\d*$/.test(pageSize) || Number(pageSize) > 100) {
    return NextResponse.json({ error: "page 须为 1-10000，pageSize 须为 1-100" }, { status: 400 });
  }
  return { page: Number(page), pageSize: Number(pageSize) };
}
