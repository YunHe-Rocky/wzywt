import type { HistoryThemeCategory, ThemeTone } from "@/core/history-theme/types";

export type HistoryThemeBlockType =
  | "LEAD_QUOTE"
  | "CLASSICAL_TEXT"
  | "MODERN_TRANSLATION"
  | "FACT_SUMMARY"
  | "TIMELINE"
  | "BATTLE_FLOW"
  | "MAP"
  | "FIGURE_PROFILE"
  | "CUSTOMS"
  | "SOURCE_NOTE"
  | "QUIZ"
  | "EDITOR_NOTE";

export interface HistoryThemeBlockView {
  id: string;
  kind: HistoryThemeBlockType;
  title: string;
  body: string;
}

export interface HistoryThemeSourceView {
  id: string;
  title: string;
  url: string;
  publisher: string;
  sourceType: string;
  accessedAt: string;
  claimIds: string[];
}

export interface ThemeCardView {
  slug: string;
  title: string;
  summary: string;
  category: HistoryThemeCategory;
  tone: ThemeTone;
  natureLabel: string;
  startsAt: string;
  endsAt: string;
}

export interface ThemeDetailView extends ThemeCardView {
  dateLabel: string;
  dateNote: string;
  reviewedAt: string | null;
  reconstructionNote: string | null;
  blocks: HistoryThemeBlockView[];
  sources: HistoryThemeSourceView[];
}

export const HISTORY_THEME_CATEGORY_LABELS: Record<HistoryThemeCategory, string> = {
  TRADITIONAL_FESTIVAL: "传统节日",
  ANCIENT_BATTLE: "古代战役",
  MODERN_COMMEMORATION: "近现代纪念",
  HISTORICAL_FIGURE: "历史人物",
};

export const HISTORY_THEME_TONE_LABELS: Record<ThemeTone, string> = {
  FESTIVE: "节庆",
  CULTURAL: "文化",
  SOLEMN: "庄重",
  NEUTRAL: "中性",
};

export const HISTORY_THEME_BLOCK_LABELS: Record<HistoryThemeBlockType, string> = {
  LEAD_QUOTE: "引文",
  CLASSICAL_TEXT: "古文原文",
  MODERN_TRANSLATION: "今译",
  FACT_SUMMARY: "事实摘要",
  TIMELINE: "时间线",
  BATTLE_FLOW: "战局脉络",
  MAP: "地图示意",
  FIGURE_PROFILE: "人物档案",
  CUSTOMS: "节俗",
  SOURCE_NOTE: "来源说明",
  QUIZ: "轻量问答",
  EDITOR_NOTE: "编辑说明",
};

type ThemeWindow = Pick<ThemeCardView, "startsAt" | "endsAt">;

function parseThemeWindow(theme: ThemeWindow): { startsAt: number; endsAt: number } | null {
  const startsAt = Date.parse(theme.startsAt);
  const endsAt = Date.parse(theme.endsAt);
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || endsAt <= startsAt) return null;
  return { startsAt, endsAt };
}

export function safeSourceUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("//")) return null;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export function isThemeCardActive(theme: ThemeWindow, now = Date.now()): boolean {
  const window = parseThemeWindow(theme);
  return Boolean(window && Number.isFinite(now) && window.startsAt <= now && now < window.endsAt);
}

export function themeCardExpiryDelay(theme: ThemeWindow, now = Date.now()): number | null {
  const window = parseThemeWindow(theme);
  if (!window || !Number.isFinite(now) || now < window.startsAt || now >= window.endsAt) return null;
  return Math.min(window.endsAt - now, 2_147_483_000);
}

const SHANGHAI_DATE_TIME = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function dateParts(timestamp: number) {
  const parts = Object.fromEntries(
    SHANGHAI_DATE_TIME.formatToParts(new Date(timestamp)).map(part => [part.type, part.value]),
  );
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
  };
}

export function formatThemeWindowShanghai(theme: ThemeWindow): string | null {
  const window = parseThemeWindow(theme);
  if (!window) return null;
  const start = dateParts(window.startsAt);
  const end = dateParts(window.endsAt);
  const startLabel = `${start.year}年${start.month}月${start.day}日 ${start.hour}:${start.minute}`;
  const endLabel = `${start.year === end.year ? "" : `${end.year}年`}${end.month}月${end.day}日 ${end.hour}:${end.minute}`;
  return `${startLabel} — ${endLabel}`;
}
