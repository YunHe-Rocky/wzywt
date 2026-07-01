export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/permissions";
import { prisma } from "@/lib/db";

const DEFAULTS: Record<string, string> = {
  hero_list_page: "https://pvp.qq.com/web201605/herolist.shtml",
  hero_list_json: "https://pvp.qq.com/web201605/js/herolist.json",
  hero_detail_base: "https://pvp.qq.com/web201605/herodetail",
  hero_img_base: "https://game.gtimg.cn/images/yxzj/img201606/heroimg/{id}/{id}.jpg",
  skin_img_base: "https://game.gtimg.cn/images/yxzj/img201606/skin/hero-info/{id}/{id}-bigskin-{idx}.jpg",
};

const KEY = "config:crawl_urls";

export async function GET() {
  const { userId } = await requireSuperAdmin().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const row = await prisma.kvCache.findUnique({ where: { key: KEY } });
  const saved = row ? (JSON.parse(row.value) as Record<string, string>) : {};

  return NextResponse.json({
    settings: { ...DEFAULTS, ...saved },
  });
}

export async function PUT(req: NextRequest) {
  const { userId } = await requireSuperAdmin().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const body = await req.json();
  const updates: Record<string, string> = {};

  for (const k of Object.keys(DEFAULTS)) {
    if (body[k] && typeof body[k] === "string") {
      updates[k] = body[k];
    }
  }

  await prisma.kvCache.upsert({
    where: { key: KEY },
    update: { value: JSON.stringify(updates) },
    create: { key: KEY, value: JSON.stringify(updates) },
  });

  return NextResponse.json({
    ok: true,
    settings: { ...DEFAULTS, ...updates },
  });
}
