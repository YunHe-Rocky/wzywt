import { prisma } from "@/lib/db";
import { cacheGet, cacheSet } from "@/lib/redis";

export async function listEquipment() {
  const cached = await cacheGet<Array<Record<string, unknown>>>("items", "list");
  if (cached) return cached;
  const items = await prisma.equipment.findMany({ orderBy: { itemId: "asc" } });
  const result = items.map((item) => {
    const extra = (item.extraJson as Record<string, unknown> | null) ?? {};
    return {
      id: item.itemId,
      name: item.name,
      meta: { price: item.price, tier: extra.tier, itemType: extra.itemType, imageUrl: item.imageUrl },
      tags: (extra.tags as string[]) ?? [],
      stats: (extra.stats as { stat: string; value: number }[]) ?? [],
      effects: (item.passiveJson as { name: string; desc: string; unique: boolean }[]) ?? [],
      price: item.price,
      imageUrl: item.imageUrl,
      itemId: item.itemId,
      atk: item.atk, ap: item.ap, def: item.def, mdef: item.mdef,
      hp: item.hp, mp: item.mp, cdReduce: item.cdReduce, atkSpeed: item.atkSpeed,
      moveSpeed: item.moveSpeed, critRate: item.critRate, lifesteal: item.lifesteal,
      extraJson: item.extraJson,
      passiveJson: item.passiveJson,
    };
  });
  await cacheSet("items", "list", result, 3600);
  return result;
}
