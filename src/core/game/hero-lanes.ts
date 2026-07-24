export interface LaneTaggedHero {
  heroId: number;
  roleType: string;
  secondaryRoleTypes: readonly string[];
}

/**
 * 仅返回当前分路候选：主分路优先，附属分路随后；同组按 heroId 稳定排序。
 */
export function selectHeroesForLane<T extends LaneTaggedHero>(
  heroes: readonly T[],
  roleType: string,
): T[] {
  return heroes
    .filter((hero) => (
      hero.roleType === roleType || hero.secondaryRoleTypes.includes(roleType)
    ))
    .sort((a, b) => {
      const priorityDelta = Number(b.roleType === roleType) - Number(a.roleType === roleType);
      return priorityDelta || a.heroId - b.heroId;
    });
}
