import { prisma } from "@/lib/db";
import { serializable } from "@/lib/serializable";
import { ServiceError } from "@/lib/service-error";
import { normalizeHeroPowerScore, ROLES } from "@/core/game";
import { normalizeRolePreferenceSettings, parseRolePreferences } from "../model";

export async function listRolePreferences(userId: number) {
  return normalizeRolePreferenceSettings(await prisma.rolePreference.findMany({ where: { userId }, orderBy: { preferenceRank: "asc" } }));
}
export async function saveRolePreferences(userId: number, value: unknown) {
  let preferences;
  try { preferences = parseRolePreferences(value); }
  catch (error) { throw new ServiceError("VALIDATION_ERROR", error instanceof Error ? error.message : "分路偏好无效"); }
  await serializable(async tx => {
    for (const preference of preferences) {
      await tx.rolePreference.upsert({ where: { userId_roleType: { userId, roleType: preference.roleType } },
        create: { userId, ...preference }, update: preference });
    }
  });
}
export async function listHeroPowers(userId: number) {
  const powers = await prisma.heroPower.findMany({ where: { userId } });
  const grouped: Record<string, typeof powers> = {};
  for (const power of powers) (grouped[power.roleType] ??= []).push(power);
  return grouped;
}
export async function addHeroPower(userId: number, input: Record<string, unknown>) {
  const { roleType, heroId } = input;
  if (typeof roleType !== "string" || !ROLES.some(role => role === roleType)
    || typeof heroId !== "number" || !Number.isSafeInteger(heroId) || heroId < 1 || heroId > 2_147_483_647) throw new ServiceError("VALIDATION_ERROR", "英雄或分路参数无效");
  let powerScore: number;
  try { powerScore = normalizeHeroPowerScore(input.powerScore); }
  catch (error) { throw new ServiceError("VALIDATION_ERROR", error instanceof Error ? error.message : "战力无效"); }
  return serializable(async tx => {
    const hero = await tx.hero.findUnique({ where: { heroId }, select: { name: true } });
    if (!hero) throw new ServiceError("VALIDATION_ERROR", "英雄不存在");
    const existing = await tx.heroPower.findUnique({ where: { userId_heroId_roleType: { userId, roleType, heroId } } });
    if (existing) throw new ServiceError("CONFLICT", "该分路已添加此英雄");
    const count = await tx.heroPower.count({ where: { userId, roleType } });
    if (count >= 3) throw new ServiceError("VALIDATION_ERROR", "每个分路最多 3 个英雄");
    return tx.heroPower.create({ data: { userId, roleType, heroId, heroName: hero.name, powerScore } });
  });
}
export async function removeHeroPower(userId: number, id: number) {
  const result = await prisma.heroPower.deleteMany({ where: { id, userId } });
  if (result.count !== 1) throw new ServiceError("NOT_FOUND", "英雄战力记录不存在");
}
