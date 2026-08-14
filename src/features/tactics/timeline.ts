export type TacticResourceCategory = "lane" | "jungle" | "objective";
export type TacticResourceState = "pending" | "ready" | "respawning" | "retired";

export interface TacticResourceRule {
  id: "lane" | "buff" | "jungle" | "tyrant" | "overlord" | "tempest";
  name: string;
  category: TacticResourceCategory;
  firstSpawnAt: number;
  respawnSeconds: number;
  schedule: "fixed" | "after-clear";
  retiredAt?: number;
  mapPosition?: { x: number; y: number };
}

export interface TacticResourceSnapshot extends TacticResourceRule {
  state: TacticResourceState;
  nextAt: number | null;
  waveNumber: number | null;
}

export type TacticClearRecords = Partial<Record<TacticResourceRule["id"], number>>;

/**
 * 统一的 5v5 时间规则入口。版本规则发生变化时只修改此处，UI 和图层逻辑不再各自硬编码。
 */
export const TACTIC_RESOURCE_RULES: readonly TacticResourceRule[] = [
  { id: "lane", name: "三路兵线", category: "lane", firstSpawnAt: 10, respawnSeconds: 33, schedule: "fixed" },
  { id: "buff", name: "红蓝 Buff", category: "jungle", firstSpawnAt: 30, respawnSeconds: 90, schedule: "after-clear" },
  { id: "jungle", name: "普通野怪", category: "jungle", firstSpawnAt: 30, respawnSeconds: 70, schedule: "after-clear" },
  { id: "tyrant", name: "暴君 / 暗影暴君", category: "objective", firstSpawnAt: 120, respawnSeconds: 240, schedule: "after-clear", retiredAt: 1_170, mapPosition: { x: 0.42, y: 0.34 } },
  { id: "overlord", name: "主宰 / 暗影主宰", category: "objective", firstSpawnAt: 120, respawnSeconds: 240, schedule: "after-clear", retiredAt: 1_170, mapPosition: { x: 0.69, y: 0.61 } },
  { id: "tempest", name: "风暴龙王", category: "objective", firstSpawnAt: 1_200, respawnSeconds: 180, schedule: "after-clear", mapPosition: { x: 0.56, y: 0.48 } },
] as const;

export const TACTIC_CLOCK_MAX_SECONDS = 2_400;

export function clampClockSeconds(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(TACTIC_CLOCK_MAX_SECONDS, Math.max(0, Math.round(value)));
}

export function formatTacticTime(value: number | null): string {
  if (value === null) return "—";
  const seconds = clampClockSeconds(value);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function parseTacticTime(value: string): number | null {
  const text = value.trim();
  if (!text) return null;
  if (/^\d+$/.test(text)) return clampClockSeconds(Number(text));
  const match = /^(\d{1,2}):(\d{1,2})$/.exec(text);
  if (!match) return null;
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  if (seconds > 59) return null;
  return clampClockSeconds(minutes * 60 + seconds);
}

export function getTacticResourceSnapshot(
  rule: TacticResourceRule,
  clockSeconds: number,
  lastClearedAt?: number,
): TacticResourceSnapshot {
  const now = clampClockSeconds(clockSeconds);
  if (rule.retiredAt !== undefined && now >= rule.retiredAt) {
    return { ...rule, state: "retired", nextAt: null, waveNumber: null };
  }
  if (rule.schedule === "fixed") {
    if (now < rule.firstSpawnAt) return { ...rule, state: "pending", nextAt: rule.firstSpawnAt, waveNumber: 0 };
    const completedIntervals = Math.floor((now - rule.firstSpawnAt) / rule.respawnSeconds);
    return {
      ...rule,
      state: "ready",
      nextAt: rule.firstSpawnAt + (completedIntervals + 1) * rule.respawnSeconds,
      waveNumber: completedIntervals + 1,
    };
  }
  if (now < rule.firstSpawnAt) return { ...rule, state: "pending", nextAt: rule.firstSpawnAt, waveNumber: null };
  if (lastClearedAt === undefined || lastClearedAt < rule.firstSpawnAt || lastClearedAt > now) {
    return { ...rule, state: "ready", nextAt: null, waveNumber: null };
  }
  const nextAt = lastClearedAt + rule.respawnSeconds;
  if (rule.retiredAt !== undefined && nextAt >= rule.retiredAt) {
    return { ...rule, state: "retired", nextAt: null, waveNumber: null };
  }
  return nextAt > now
    ? { ...rule, state: "respawning", nextAt, waveNumber: null }
    : { ...rule, state: "ready", nextAt: null, waveNumber: null };
}

export function getTacticTimeline(clockSeconds: number, clearRecords: TacticClearRecords = {}): TacticResourceSnapshot[] {
  const now = clampClockSeconds(clockSeconds);
  return TACTIC_RESOURCE_RULES.map((rule) => {
    const snapshot = getTacticResourceSnapshot(rule, now, clearRecords[rule.id]);
    if (now < 600) return snapshot;
    if (rule.id === "tyrant") return { ...snapshot, name: "暗影暴君" };
    if (rule.id === "overlord") return { ...snapshot, name: "暗影主宰" };
    return snapshot;
  });
}

export function tacticResourceStateLabel(snapshot: TacticResourceSnapshot, clockSeconds: number): string {
  if (snapshot.id === "lane" && snapshot.nextAt !== null) return `第 ${(snapshot.waveNumber ?? 0) + 1} 波 ${formatTacticTime(snapshot.nextAt)}`;
  if (snapshot.state === "retired") return "已离场";
  if (snapshot.state === "ready") return "已刷新";
  if (snapshot.nextAt === null) return "—";
  return `${formatTacticTime(snapshot.nextAt)} · ${Math.max(0, snapshot.nextAt - clampClockSeconds(clockSeconds))}s`;
}
