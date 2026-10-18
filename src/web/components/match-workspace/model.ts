import { normalizeLegacyParticipationRateGroup, normalizeRecognitionParticipationRate, participationRateFromPercentage, participationRateToPercentage, type MatchScreenshotType, type MatchStatField, type NormalizedRecognitionPlayer } from "@/features/matches/model";

export const SCREEN_LABELS: Record<MatchScreenshotType, string> = {
  DATA: "数据", OUTPUT: "输出", SURVIVAL: "生存", DEVELOPMENT: "发育", KDA: "KDA", TEAM: "团队",
};
export const ROLE_LABELS: Record<string, string> = { top: "对抗路", jungle: "打野", mid: "中路", adc: "发育路", support: "游走" };
export const STAT_LABELS: Record<MatchStatField, string> = {
  damageDealt: "输出伤害", damageTaken: "承受伤害", gold: "总经济", participationRate: "参团率（%）",
  damageConversionRate: "伤害转化比", damageTakenPerDeath: "每死承伤", jungleGold: "野怪经济", minionKills: "补刀",
  kills: "击败", deaths: "死亡", assists: "助攻", controlScore: "控制效果", healing: "治疗量", towerDamage: "对塔伤害",
};
export const ALL_STATS = Object.keys(STAT_LABELS) as MatchStatField[];
export const MATCH_STATUS_LABELS: Record<string, string> = {
  DRAFT: "待上传数据",
  UPLOADED: "截图已齐全，待识别",
  WAITING_CONFIRMATION: "等待人工确认",
  CONFIRMED: "已确认，待正式提交",
  SUBMITTED: "已正式提交",
};
export const CONSISTENCY_LABELS: Record<string, string> = { PASS: "一致性通过", WARNING: "存在待核查项", FAIL: "一致性未通过" };
export const RECOGNITION_LABELS: Record<string, string> = { PENDING: "等待识别", QUEUED: "已进入识别队列", PROCESSING: "识别中", RUNNING: "识别中", COMPLETED: "识别完成", CANCELED: "已取消", SUPERSEDED: "已被新截图替代", FAILED: "识别失败" };

export function localizedStatus(labels: Record<string, string>, value: string | null | undefined, fallback: string) {
  return value ? labels[value] || value : fallback;
}

export interface EditablePlayer {
  id: number; side: "red" | "blue"; slot: number; memberId: number | null; isGuest: boolean;
  gameNickname: string; heroId: number | null; heroName: string; roleType: string; score: number | string;
  updatedAt: string; statsUpdatedAt: string | null; stats: Record<MatchStatField, number | string>;
}
export interface DetailData {
  match: {
    id: number; tournamentId: number; tournamentName: string; playedAt: string; status: string; winnerSide: "red" | "blue" | null;
    redTotalKills: number | null; blueTotalKills: number | null; consistencyStatus: string; consistencyDetails: unknown;
    evidenceRevision: number; recordRevision: number; updatedAt: string;
    players: Array<EditablePlayer & { stats: (Record<MatchStatField, number> & { updatedAt: string }) | null }>;
    screenshots: Array<{ id: number; type: MatchScreenshotType; originalFilename: string; size: number; recognitionStatus: string }>;
    recognition: { status: string; normalizedResult: unknown; warnings: unknown; errorCode: string | null; attemptCount: number; availableAt: string; heartbeatAt: string | null } | null;
    disputes: Array<{ id: number; status: string; field: string | null; message: string; createdAt: string }>;
  };
  access: { canManage: boolean; isSuperAdmin: boolean; currentUserId: number; ownSide?: "red" | "blue" | null };
  eligibleMembers: Array<{ id: number; username: string; gameNickname: string | null }>;
}
export type RecognitionPlayer = NormalizedRecognitionPlayer;

export function emptyStats(): Record<MatchStatField, number | string> {
  return Object.fromEntries(ALL_STATS.map((field) => [field, 0])) as Record<MatchStatField, number | string>;
}
export function apiMessage(data: unknown, fallback: string) {
  return typeof data === "object" && data !== null && "error" in data && typeof data.error === "string" ? data.error : fallback;
}
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function isEditablePlayer(value: unknown): value is EditablePlayer {
  if (!isRecord(value) || typeof value.id !== "number" || !Number.isSafeInteger(value.id)
    || (value.side !== "red" && value.side !== "blue") || typeof value.slot !== "number"
    || !(value.memberId === null || (typeof value.memberId === "number" && Number.isSafeInteger(value.memberId)))
    || typeof value.isGuest !== "boolean" || typeof value.gameNickname !== "string" || typeof value.heroName !== "string"
    || !(value.heroId === null || (typeof value.heroId === "number" && Number.isSafeInteger(value.heroId)))
    || typeof value.roleType !== "string" || !(typeof value.score === "number" || typeof value.score === "string")
    || typeof value.updatedAt !== "string" || !(value.statsUpdatedAt === null || typeof value.statsUpdatedAt === "string")) return false;
  const stats = value.stats;
  if (!isRecord(stats)) return false;
  return ALL_STATS.every((field) => typeof stats[field] === "number" || typeof stats[field] === "string");
}
export function normalizeEditablePlayerParticipationRates(players: EditablePlayer[]): EditablePlayer[] {
  const rates = normalizeLegacyParticipationRateGroup(players.map((player) => player.stats.participationRate));
  return players.map((player, index) => ({
    ...player,
    stats: { ...player.stats, participationRate: rates[index] },
  }));
}
export function statValueForInput(field: MatchStatField, value: number | string): number | string {
  if (field !== "participationRate" || value === "") return value;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? participationRateToPercentage(numericValue) : value;
}
export function statValueFromInput(field: MatchStatField, value: string): string {
  if (field !== "participationRate" || value === "") return value;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? String(participationRateFromPercentage(numericValue)) : value;
}
export function statValueForDisplay(field: MatchStatField, value: number | string): number | string {
  return field === "participationRate" ? `${statValueForInput(field, value)}%` : value;
}
export function recognitionPlayers(value: unknown): RecognitionPlayer[] {
  if (!isRecord(value) || !Array.isArray(value.players)) return [];
  return value.players.filter((player): player is RecognitionPlayer => isRecord(player)
    && (player.side === "red" || player.side === "blue") && typeof player.slot === "number"
    && Array.isArray(player.warnings) && isRecord(player.score) && isRecord(player.stats));
}
export function manualReviewReasons(player: RecognitionPlayer | undefined): string[] {
  if (!player) return [];
  const reasons = [...player.warnings];
  const metrics = [["评分", player.score] as const, ...ALL_STATS.map((field) => [STAT_LABELS[field], player.stats[field]] as const)];
  for (const [label, metric] of metrics) {
    if (metric.conflict) reasons.push(`${label}跨图冲突`);
    else if (metric.sources.some(({ confidence }) => confidence !== null && confidence < 0.7)) reasons.push(`${label}置信度低`);
  }
  return Array.from(new Set(reasons));
}

export function mergeRecognitionPlayers(current: EditablePlayer[], payload: unknown, persistedPlayerIds: ReadonlySet<number>): EditablePlayer[] {
  if (typeof payload !== "object" || payload === null || !("players" in payload) || !Array.isArray(payload.players)) return current;
  const recognized = payload.players as RecognitionPlayer[];
  const normalizedVersion = "version" in payload ? payload.version : null;
  return current.map((player) => {
    if (persistedPlayerIds.has(player.id)) return player;
    const source = recognized.find((item) => item.side === player.side && item.slot === player.slot);
    if (!source) return player;
    const stats = { ...player.stats };
    for (const field of ALL_STATS) {
      const recognizedValue = source.stats[field]?.value;
      if (recognizedValue !== null && recognizedValue !== undefined) {
        stats[field] = field === "participationRate" ? normalizeRecognitionParticipationRate(recognizedValue, normalizedVersion) : recognizedValue;
      }
    }
    return {
      ...player, stats,
      gameNickname: source.nickname || player.gameNickname,
      heroId: source.heroId || player.heroId,
      heroName: source.heroName || player.heroName,
      score: source.score.value ?? player.score,
    };
  });
}
