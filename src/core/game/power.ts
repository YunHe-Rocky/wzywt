const MAX_HERO_POWER_SCORE = 999_999;

export function normalizeHeroPowerScore(value: unknown): number {
  const score = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(score) || score <= 0 || score > MAX_HERO_POWER_SCORE) {
    throw new RangeError(`英雄战力必须是 1-${MAX_HERO_POWER_SCORE} 的整数`);
  }
  return score;
}

export function calculateLanePowerRank(
  heroes: readonly { powerScore: number }[],
): number {
  const total = [...heroes]
    .sort((a, b) => b.powerScore - a.powerScore)
    .slice(0, 5)
    .reduce((sum, hero) => sum + normalizeHeroPowerScore(hero.powerScore), 0);
  return total / 1000;
}

export function formatLanePowerRank(rank: number): string {
  if (!Number.isFinite(rank) || rank < 0) return "0";
  return String(Math.floor(rank));
}
