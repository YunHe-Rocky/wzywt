export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { cacheGet, cacheSet } from "@/lib/redis";

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const itemId = parseInt(params.id);
  if (!itemId) return NextResponse.json({ error: "无效ID" }, { status: 400 });

  const cached = await cacheGet("item", itemId);
  if (cached) return NextResponse.json(cached);

  const item = await prisma.equipment.findUnique({ where: { itemId } });
  if (!item) return NextResponse.json({ error: "装备不存在" }, { status: 404 });

  const extra = (item.extraJson as Record<string, unknown> | null) ?? {};
  const result = {
    id: item.itemId,
    name: item.name,
    meta: {
      price: item.price,
      tier: extra.tier,
      itemType: extra.itemType,
      imageUrl: item.imageUrl,
    },
    tags: (extra.tags as string[]) ?? [],
    stats: (extra.stats as { stat: string; value: number }[]) ?? [],
    effects: (item.passiveJson as { name: string; desc: string; unique: boolean }[]) ?? [],
    // raw data for detail page (backwards compat)
    itemId: item.itemId,
    price: item.price,
    imageUrl: item.imageUrl,
    passiveJson: item.passiveJson,
    atk: item.atk, ap: item.ap, def: item.def, mdef: item.mdef,
    hp: item.hp, mp: item.mp, cdReduce: item.cdReduce, atkSpeed: item.atkSpeed,
    moveSpeed: item.moveSpeed, critRate: item.critRate, lifesteal: item.lifesteal,
  };

  await cacheSet("item", itemId, result, 3600);

  return NextResponse.json(result);
}
