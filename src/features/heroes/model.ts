export interface OfficialHeroRecord {
  ename: number;
  cname: string;
  title?: string;
  hero_type?: number;
  hero_type2?: number;
  id_name?: string;
  skin_name?: string;
}

export interface HeroCatalogRecord {
  ename: number;
  cname: string;
  title: string;
  hero_type: number;
  hero_type2: number;
  id_name?: string;
  skin_name?: string;
}

export interface HeroSkinRecord {
  name: string;
  index: number;
  imageUrls: string[];
}

export function createHeroImageCandidates({
  heroId,
  skinIndex,
  remoteImageUrl,
  remoteSkinUrls = [],
}: {
  heroId: number;
  skinIndex: number;
  remoteImageUrl?: string | null;
  remoteSkinUrls?: readonly string[];
}): string[] {
  const localSkin = `/heroes/skins/${heroId}/${skinIndex}.jpg`;
  const localHero = `/heroes/images/${heroId}.jpg`;
  return Array.from(new Set([
    localSkin,
    ...(skinIndex === 1 ? [localHero] : []),
    ...remoteSkinUrls,
    remoteImageUrl,
    localHero,
  ].filter((value): value is string => Boolean(value))));
}

export const KNOWN_MINGGE_PAIRS = [
  { baseId: 167, baseName: "孙悟空", formId: 549, formName: "心魔六耳" },
] as const;

export function mergeHeroCatalog(
  htmlHeroes: ReadonlyMap<number, string>,
  officialHeroes: readonly OfficialHeroRecord[],
): HeroCatalogRecord[] {
  const merged = new Map<number, HeroCatalogRecord>();

  for (const hero of officialHeroes) {
    if (!Number.isInteger(hero.ename) || hero.ename <= 0 || !hero.cname?.trim()) continue;
    merged.set(hero.ename, {
      ename: hero.ename,
      cname: hero.cname.trim(),
      title: hero.title?.trim() ?? "",
      hero_type: hero.hero_type ?? 0,
      hero_type2: hero.hero_type2 ?? 0,
      id_name: hero.id_name,
      skin_name: hero.skin_name,
    });
  }

  for (const [heroId, name] of Array.from(htmlHeroes.entries())) {
    if (merged.has(heroId) || !name.trim()) continue;
    merged.set(heroId, {
      ename: heroId,
      cname: name.trim(),
      title: "",
      hero_type: 0,
      hero_type2: 0,
    });
  }

  return Array.from(merged.values()).sort((a, b) => a.ename - b.ename);
}

function parseSkinNames(raw: string | undefined, fallbackName: string): string[] {
  const names = (raw ?? "")
    .split("|")
    .map((item) => item.split("&")[0]?.trim())
    .filter((name): name is string => Boolean(name));
  return names.length > 0 ? names : [fallbackName];
}

export function createHeroSkins(input: {
  heroId: number;
  officialSkinNames?: string;
  detailSkinNames?: string;
  fallbackName: string;
  skinImageTemplate: string;
  heroImageTemplate: string;
}): HeroSkinRecord[] {
  const rawNames = input.officialSkinNames?.trim()
    ? input.officialSkinNames
    : input.detailSkinNames;
  const names = parseSkinNames(rawNames, input.fallbackName);

  return names.map((name, offset) => {
    const index = offset + 1;
    const high = input.skinImageTemplate
      .replace(/{id}/g, String(input.heroId))
      .replace("{idx}", String(index));
    const standard = high.replace("-bigskin-", "-mobileskin-");
    const ordinary = input.heroImageTemplate.replace(/{id}/g, String(input.heroId));
    return {
      name,
      index,
      imageUrls: Array.from(new Set([high, standard, ordinary])),
    };
  });
}
