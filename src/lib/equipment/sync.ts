import { prisma } from "../db";
import { createHash } from "crypto";
import { fetchWithRetry } from "../anti-bot";
import { cacheDel } from "../redis";
import { computeTier, computeTags, parsePassives, buildEquipmentStats } from "@/engine";

const ITEM_URL = "https://pvp.qq.com/web201605/js/item.json";
const ITEM_IMG_BASE = "https://game.gtimg.cn/images/yxzj/img201606/itemimgo";

interface RawItem {
  item_id: string;
  item_name: string;
  item_type?: number;
  price?: number;
  total_price?: number;
  des1?: string;  // short desc
  des2?: string;  // full desc (contains stats)
}

function parseStats(des2: string): Record<string, number> {
  const stats: Record<string, number> = { atk: 0, ap: 0, def: 0, mdef: 0, hp: 0, mp: 0, cdReduce: 0, atkSpeed: 0, moveSpeed: 0, critRate: 0, lifesteal: 0 };

  // Common patterns in item descriptions:
  // +100物理攻击, +10%冷却缩减, +800最大生命, +120法术攻击, etc.
  const patterns: [RegExp, string][] = [
    [/(\d+)物理攻击/, "atk"],
    [/(\d+)法术攻击/, "ap"],
    [/(\d+)物理防御/, "def"],
    [/(\d+)法术防御/, "mdef"],
    [/(\d+)最大生命/, "hp"],
    [/(\d+)最大法力/, "mp"],
    [/(\d+)%冷却缩减/, "cdReduce"],
    [/(\d+)%攻击速度/, "atkSpeed"],
    [/(\d+)%移速/, "moveSpeed"],
    [/(\d+)%暴击率/, "critRate"],
    [/(\d+)%物理吸血/, "lifesteal"],
  ];

  for (const [regex, key] of patterns) {
    const match = des2.match(regex);
    if (match) stats[key] = parseInt(match[1]);
  }

  return stats;
}

export async function syncItems(): Promise<{ inserted: number; updated: number }> {
  console.log("[sync:items] Fetching item list...");
  const res = await fetchWithRetry(ITEM_URL, {
    timeout: 15000,
    referer: "https://pvp.qq.com/",
    isJson: true,
  });

  if (!res.ok || !res.json) {
    console.error(`[sync:items] Fetch failed: ${res.status}`);
    return { inserted: 0, updated: 0 };
  }

  const rawItems = res.json as Array<Record<string, unknown>>;
  console.log(`[sync:items] ${rawItems.length} items in list`);

  // item.json may be a nested array or flat array — normalize
  const items: RawItem[] = [];
  for (const item of rawItems as unknown[]) {
    if (Array.isArray(item)) {
      // If nested array, flatten: [["1111","铁剑",250,...], ...]
      items.push({
        item_id: String(item[0] ?? ""),
        item_name: String(item[1] ?? ""),
        item_type: Number(item[4]) || 0,
        price: Number(item[2]) || 0,
        total_price: Number(item[3]) || 0,
        des1: String(item[5] ?? ""),
        des2: String(item[6] ?? ""),
      });
    } else if (typeof item === "object" && item !== null) {
      const obj = item as Record<string, unknown>;
      items.push({
        item_id: String(obj.item_id ?? obj.id ?? ""),
        item_name: String(obj.item_name ?? obj.name ?? ""),
        item_type: Number(obj.item_type) || 0,
        price: Number(obj.price) || 0,
        total_price: Number(obj.total_price) || 0,
        des1: String(obj.des1 ?? obj.description ?? ""),
        des2: String(obj.des2 ?? obj.description ?? ""),
      });
    }
  }

  let inserted = 0;
  let updated = 0;

  for (const item of items) {
    const itemId = parseInt(item.item_id);
    if (!itemId || !item.item_name) continue;

    const stats = item.des1 ? parseStats(item.des1) : {};
    const dataHash = createHash("md5")
      .update(JSON.stringify({ name: item.item_name, price: item.price, stats, des2: item.des2 }))
      .digest("hex");
    const imageUrl = `${ITEM_IMG_BASE}/${itemId}.png`;
    const tier = computeTier(item.total_price ?? item.price ?? 0, item.item_name, item.item_type);
    const tags = computeTags(item.item_type ?? 0, stats);
    const equipStats = buildEquipmentStats(stats);
    const extraJson = { itemType: item.item_type ?? 0, tier, tags, stats: equipStats };
    const passiveJson = item.des2 ? parsePassives(item.des2) : [];

    const existing = await prisma.equipment.findUnique({ where: { itemId } });

    if (!existing) {
      await prisma.equipment.create({
        data: {
          itemId,
          name: item.item_name,
          price: item.price || 0,
          imageUrl,
          atk: stats.atk,
          ap: stats.ap,
          def: stats.def,
          mdef: stats.mdef,
          hp: stats.hp,
          mp: stats.mp,
          cdReduce: stats.cdReduce,
          atkSpeed: stats.atkSpeed,
          moveSpeed: stats.moveSpeed,
          critRate: stats.critRate,
          lifesteal: stats.lifesteal,
          dataHash,
          extraJson,
          passiveJson,
        },
      });
      console.log(`[sync:items] NEW #${itemId} ${item.item_name}`);
      inserted++;
    } else {
      const updateData: Record<string, unknown> = { name: item.item_name, imageUrl, dataHash, extraJson, passiveJson };
      if (item.price) updateData.price = item.price;
      if (stats.atk) updateData.atk = stats.atk;
      if (stats.ap) updateData.ap = stats.ap;
      if (stats.def) updateData.def = stats.def;
      if (stats.mdef) updateData.mdef = stats.mdef;
      if (stats.hp) updateData.hp = stats.hp;
      if (stats.mp) updateData.mp = stats.mp;
      if (stats.cdReduce) updateData.cdReduce = stats.cdReduce;
      if (stats.atkSpeed) updateData.atkSpeed = stats.atkSpeed;
      if (stats.moveSpeed) updateData.moveSpeed = stats.moveSpeed;
      if (stats.critRate) updateData.critRate = stats.critRate;
      if (stats.lifesteal) updateData.lifesteal = stats.lifesteal;

      await prisma.equipment.update({ where: { itemId }, data: updateData });
      updated++;

      // Clear Redis cache
      void cacheDel("item", itemId);
    }
  }

  void cacheDel("items", "list");

  console.log(`[sync:items] Complete: ${inserted} new, ${updated} updated`);
  return { inserted, updated };
}
