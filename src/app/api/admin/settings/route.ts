export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { authorizeSuperAdmin } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { validateCrawlUrl } from "@/lib/anti-bot";
import { tryReadJsonRequest } from "@/lib/request-validation";

const DEFAULTS: Record<string, string> = {
  hero_list_page: "https://pvp.qq.com/web201605/herolist.shtml",
  hero_list_json: "https://pvp.qq.com/web201605/js/herolist.json",
  hero_detail_base: "https://pvp.qq.com/web201605/herodetail",
  hero_img_base: "https://game.gtimg.cn/images/yxzj/img201606/heroimg/{id}/{id}.jpg",
  skin_img_base: "https://game.gtimg.cn/images/yxzj/img201606/skin/hero-info/{id}/{id}-bigskin-{idx}.jpg",
};

const KEY = "config:crawl_urls";

export async function GET() {
  const authorization = await authorizeSuperAdmin();
  const userId = authorization.ok ? authorization.user.userId : 0;
  if (!userId) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const row = await prisma.kvCache.findUnique({ where: { key: KEY } });
  const saved = row ? (JSON.parse(row.value) as Record<string, string>) : {};

  return NextResponse.json({
    settings: { ...DEFAULTS, ...saved },
  });
}

export async function PUT(req: NextRequest) {
  const authorization = await authorizeSuperAdmin();
  const userId = authorization.ok ? authorization.user.userId : 0;
  if (!userId) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const parsedBody = await tryReadJsonRequest<Record<string, unknown>>(req);
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.value;
  const updates: Record<string, string> = {};

  try {
    for (const k of Object.keys(DEFAULTS)) {
      if (body[k] !== undefined) {
        if (typeof body[k] !== "string" || !body[k]) throw new TypeError("爬取地址不能为空");
        updates[k] = validateCrawlUrl(body[k]);
      }
    }
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
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
