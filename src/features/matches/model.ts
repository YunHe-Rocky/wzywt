export const MATCH_SIDES = ["red", "blue"] as const;
export type MatchSide = (typeof MATCH_SIDES)[number];

export const MATCH_SCREENSHOT_TYPES = [
  "DATA",
  "OUTPUT",
  "SURVIVAL",
  "DEVELOPMENT",
  "KDA",
  "TEAM",
] as const;
export type MatchScreenshotType = (typeof MATCH_SCREENSHOT_TYPES)[number];

export const MATCH_ROLE_TYPES = ["top", "jungle", "mid", "adc", "support"] as const;
export type MatchRoleType = (typeof MATCH_ROLE_TYPES)[number];

export const MATCH_STAT_FIELDS = [
  "damageDealt",
  "damageTaken",
  "gold",
  "participationRate",
  "damageConversionRate",
  "damageTakenPerDeath",
  "jungleGold",
  "minionKills",
  "kills",
  "deaths",
  "assists",
  "controlScore",
  "healing",
  "towerDamage",
] as const;
export type MatchStatField = (typeof MATCH_STAT_FIELDS)[number];

export const STAT_FIELDS_BY_SCREENSHOT: Record<MatchScreenshotType, readonly MatchStatField[]> = {
  DATA: ["damageDealt", "damageTaken", "gold", "participationRate"],
  OUTPUT: ["damageDealt", "damageConversionRate"],
  SURVIVAL: ["damageTaken", "damageTakenPerDeath"],
  DEVELOPMENT: ["gold", "jungleGold", "minionKills"],
  KDA: ["kills", "deaths", "assists"],
  TEAM: ["participationRate", "controlScore", "healing", "towerDamage"],
};

export interface SplitMemberSnapshot {
  userId: number;
  side: MatchSide;
  slot: number;
  roleType: MatchRoleType;
}

export interface RecognitionSourceValue {
  value: number | null;
  confidence: number | null;
  sourceScreenshotType: MatchScreenshotType;
  sourceRegion: string | null;
}

export interface NormalizedMetric {
  value: number | null;
  sources: RecognitionSourceValue[];
  conflict: boolean;
}

export interface NormalizedRecognitionPlayer {
  side: MatchSide;
  slot: number;
  nickname: string | null;
  heroId: number | null;
  heroName: string | null;
  score: NormalizedMetric;
  stats: Record<MatchStatField, NormalizedMetric>;
  warnings: string[];
  recommendations?: Array<{
    memberId: number;
    username: string;
    confidence: number;
    reasons: string[];
  }>;
}

export interface NormalizedRecognitionResult {
  version: 1;
  consistencyStatus: "PASS" | "WARNING" | "FAIL";
  players: NormalizedRecognitionPlayer[];
  warnings: string[];
  conflicts: Array<{ side: MatchSide; slot: number; field: string; sources: RecognitionSourceValue[] }>;
}

interface RawRecognitionPlayer {
  side: MatchSide;
  slot: number;
  nickname: string | null;
  heroId: number | null;
  heroName: string | null;
  score: RecognitionSourceValue | null;
  metrics: Partial<Record<MatchStatField, RecognitionSourceValue>>;
}

interface RawRecognitionPage {
  type: MatchScreenshotType;
  players: RawRecognitionPlayer[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asNullableText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text && text.length <= maxLength ? text : null;
}

function isScreenshotType(value: unknown): value is MatchScreenshotType {
  return typeof value === "string" && MATCH_SCREENSHOT_TYPES.includes(value as MatchScreenshotType);
}

export function isMatchSide(value: unknown): value is MatchSide {
  return typeof value === "string" && MATCH_SIDES.includes(value as MatchSide);
}

export function isMatchRoleType(value: unknown): value is MatchRoleType {
  return typeof value === "string" && MATCH_ROLE_TYPES.includes(value as MatchRoleType);
}

export function isMatchScreenshotType(value: unknown): value is MatchScreenshotType {
  return isScreenshotType(value);
}

export function parsePositiveId(value: unknown, label = "ID"): number {
  const number = typeof value === "string" && value.trim() ? Number(value) : value;
  if (typeof number !== "number" || !Number.isSafeInteger(number) || number <= 0) {
    throw new Error(`INVALID_${label.toUpperCase().replace(/\W+/g, "_")}`);
  }
  return number;
}

export function parseSplitSnapshot(value: unknown): SplitMemberSnapshot[] | null {
  if (!isRecord(value)) return null;
  const teams: Array<["teamRed" | "teamBlue", MatchSide]> = [["teamRed", "red"], ["teamBlue", "blue"]];
  const members: SplitMemberSnapshot[] = [];
  for (const [key, side] of teams) {
    const team = value[key];
    if (!Array.isArray(team) || team.length !== 5) return null;
    for (const [slot, entry] of team.entries()) {
      if (!isRecord(entry)) return null;
      const userId = entry.userId;
      const role = entry.assignedRole ?? entry.roleType;
      if (!Number.isSafeInteger(userId) || typeof userId !== "number" || !isMatchRoleType(role)) return null;
      members.push({ userId, side, slot: slot + 1, roleType: role });
    }
  }
  return new Set(members.map(({ userId }) => userId)).size === 10 ? members : null;
}

function parseSourceValue(
  value: unknown,
  type: MatchScreenshotType,
): RecognitionSourceValue | null {
  const data = isRecord(value) ? value : { value };
  const parsedValue = data.value === null ? null : asFiniteNumber(data.value);
  if (data.value !== null && parsedValue === null) return null;
  const confidence = data.confidence === undefined || data.confidence === null
    ? null
    : asFiniteNumber(data.confidence);
  if (confidence !== null && (confidence < 0 || confidence > 1)) return null;
  return {
    value: parsedValue,
    confidence,
    sourceScreenshotType: type,
    sourceRegion: asNullableText(data.sourceRegion, 128),
  };
}

function parseRecognitionPage(value: unknown): RawRecognitionPage | null {
  if (!isRecord(value) || !isScreenshotType(value.type) || !Array.isArray(value.players)) return null;
  const type = value.type;
  const players: RawRecognitionPlayer[] = [];
  for (const item of value.players) {
    if (!isRecord(item) || !isMatchSide(item.side) || !Number.isInteger(item.slot) || (item.slot as number) < 1 || (item.slot as number) > 5) continue;
    const metrics: Partial<Record<MatchStatField, RecognitionSourceValue>> = {};
    const sourceMetrics = isRecord(item.metrics) ? item.metrics : {};
    for (const field of STAT_FIELDS_BY_SCREENSHOT[type]) {
      if (!(field in sourceMetrics)) continue;
      const parsed = parseSourceValue(sourceMetrics[field], type);
      if (parsed) metrics[field] = parsed;
    }
    players.push({
      side: item.side,
      slot: item.slot as number,
      nickname: asNullableText(item.nickname, 32),
      heroId: typeof item.heroId === "number" && Number.isSafeInteger(item.heroId) && item.heroId > 0 ? item.heroId : null,
      heroName: asNullableText(item.heroName, 64),
      score: item.score === undefined ? null : parseSourceValue(item.score, type),
      metrics,
    });
  }
  return { type, players };
}

function normalizeText(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
}

function editDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const above = previous[j];
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + (left[i - 1] === right[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return previous[right.length];
}

export function areNamesEquivalent(left: string, right: string): boolean {
  const a = normalizeText(left);
  const b = normalizeText(right);
  if (a === b) return true;
  const longest = Math.max(a.length, b.length);
  return longest > 0 && editDistance(a, b) <= Math.max(1, Math.floor(longest * 0.2));
}

function mergeValues(sources: RecognitionSourceValue[]): NormalizedMetric {
  const known = sources.filter((source) => source.value !== null);
  if (known.length === 0) return { value: null, sources, conflict: false };
  const first = known[0].value as number;
  const conflict = known.some(({ value }) => Math.abs((value as number) - first) > Math.max(0.0001, Math.abs(first) * 0.001));
  return { value: conflict ? null : first, sources, conflict };
}

function emptyMetric(): NormalizedMetric {
  return { value: null, sources: [], conflict: false };
}

export function normalizeRecognitionPayload(payload: unknown): NormalizedRecognitionResult {
  const pagesValue = isRecord(payload) && Array.isArray(payload.pages) ? payload.pages : [];
  const pages = pagesValue.map(parseRecognitionPage).filter((page): page is RawRecognitionPage => page !== null);
  const byType = new Map<MatchScreenshotType, RawRecognitionPage>();
  const warnings: string[] = [];
  let severe = false;
  for (const page of pages) {
    if (byType.has(page.type)) warnings.push(`${page.type} 存在重复识别页面`);
    else byType.set(page.type, page);
  }
  for (const type of MATCH_SCREENSHOT_TYPES) {
    const page = byType.get(type);
    if (!page) {
      warnings.push(`${type} 缺少识别结果`);
      severe = true;
      continue;
    }
    const red = page.players.filter(({ side }) => side === "red").length;
    const blue = page.players.filter(({ side }) => side === "blue").length;
    if (red !== 5 || blue !== 5) warnings.push(`${type} 识别人数为红 ${red} / 蓝 ${blue}`);
    if (red < 4 || blue < 4) severe = true;
  }

  const conflicts: NormalizedRecognitionResult["conflicts"] = [];
  const players: NormalizedRecognitionPlayer[] = [];
  for (const side of MATCH_SIDES) {
    for (let slot = 1; slot <= 5; slot += 1) {
      const entries = pages.flatMap((page) => page.players.filter((player) => player.side === side && player.slot === slot));
      const playerWarnings: string[] = [];
      const nicknames = entries.map(({ nickname }) => nickname).filter((name): name is string => name !== null);
      const nickname = nicknames[0] ?? null;
      if (nickname && nicknames.some((candidate) => !areNamesEquivalent(nickname, candidate))) playerWarnings.push("昵称在多图间不一致");
      const heroIds = entries.map(({ heroId }) => heroId).filter((id): id is number => id !== null);
      const heroNames = entries.map(({ heroName }) => heroName).filter((name): name is string => name !== null);
      const heroId = heroIds[0] ?? null;
      const heroName = heroNames[0] ?? null;
      if ((heroId !== null && heroIds.some((id) => id !== heroId)) || (heroName && heroNames.some((name) => !areNamesEquivalent(heroName, name)))) {
        playerWarnings.push("英雄在多图间不一致");
      }
      const score = mergeValues(entries.map(({ score }) => score).filter((value): value is RecognitionSourceValue => value !== null));
      if (score.conflict) conflicts.push({ side, slot, field: "score", sources: score.sources });
      const stats = Object.fromEntries(MATCH_STAT_FIELDS.map((field) => {
        const metric = mergeValues(entries.map(({ metrics }) => metrics[field]).filter((value): value is RecognitionSourceValue => value !== undefined));
        if (metric.conflict) conflicts.push({ side, slot, field, sources: metric.sources });
        return [field, metric];
      })) as Record<MatchStatField, NormalizedMetric>;
      if (entries.length === 0) {
        severe = true;
        playerWarnings.push("所有截图均未识别到该槽位");
      }
      if (!nickname) playerWarnings.push("昵称待人工确认");
      if (heroId === null && !heroName) playerWarnings.push("英雄待人工确认");
      players.push({ side, slot, nickname, heroId, heroName, score: score.sources.length ? score : emptyMetric(), stats, warnings: playerWarnings });
    }
  }
  if (conflicts.length > 0) warnings.push(`存在 ${conflicts.length} 个跨图字段冲突，必须人工确认`);
  if (players.some(({ warnings: playerWarnings }) => playerWarnings.length > 0)) warnings.push("部分玩家字段需要人工确认");
  return {
    version: 1,
    consistencyStatus: severe ? "FAIL" : warnings.length > 0 ? "WARNING" : "PASS",
    players,
    warnings,
    conflicts,
  };
}
