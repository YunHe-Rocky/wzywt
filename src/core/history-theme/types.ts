import type { PlainDate } from "./calendar";

export type TimeWindow = { startsAt: string; endsAt: string };
export type TriggerKind = "SOLAR_FIXED" | "LUNAR_FIXED" | "SOLAR_TERM" | "EDITORIAL_WINDOW" | "ONE_OFF";
export type HistoryThemeCategory = "TRADITIONAL_FESTIVAL" | "ANCIENT_BATTLE" | "MODERN_COMMEMORATION" | "HISTORICAL_FIGURE";
export type ThemeTone = "FESTIVE" | "CULTURAL" | "SOLEMN" | "NEUTRAL";
export type HistoryThemeStatus = "DRAFT" | "IN_REVIEW" | "APPROVED" | "PUBLISHED" | "ARCHIVED" | "REJECTED" | "NEEDS_CHANGES" | "DISABLED";
export type HistoricalDatePrecision = "EXACT_DAY" | "MONTH" | "SEASON" | "YEAR" | "YEAR_RANGE" | "APPROXIMATE" | "CONTESTED";
export type ObservanceKind = "NONE" | "OFFICIAL" | "NATIONAL_MEMORIAL" | "WAR_RESISTANCE";
export type LeapPolicy = "REGULAR_ONLY" | "LEAP_ONLY" | "BOTH";

export interface TriggerRule {
  id: number;
  kind: TriggerKind;
  timezone: "Asia/Shanghai";
  enabled: boolean;
  month?: number;
  day?: number;
  lunarMonth?: number;
  lunarDay?: number;
  lunarYearLastDay?: boolean;
  leapPolicy?: LeapPolicy;
  solarTerm?: "QINGMING";
  oneOffStartsAt?: string;
  oneOffEndsAt?: string;
  startOffsetDays: number;
  endOffsetDays: number;
  startTimeLocal: string;
  endTimeLocal: string;
}

export interface ThemeCandidate extends TimeWindow {
  id: number;
  slug: string;
  category: HistoryThemeCategory;
  tone: ThemeTone;
  priority: number;
  isFeatured: boolean;
  allowSecondary: boolean;
  triggerKind: TriggerKind;
  status: HistoryThemeStatus;
  reviewValid: boolean;
  observanceKind: ObservanceKind;
}

export interface ThemeResolution {
  primary: ThemeCandidate | null;
  secondary: ThemeCandidate[];
  suppressed: Array<{ theme: ThemeCandidate; reason: string }>;
}

export interface EditorialCandidate {
  id: number;
  status: HistoryThemeStatus;
  reviewValid: boolean;
  lastShownOn: PlainDate | null;
}

export interface EditorialPlan {
  themeId: number | null;
  window: TimeWindow | null;
  label: "演武堂历史策划";
  reason: "SELECTED" | "FORCED" | "NO_ELIGIBLE_THEME" | "INVALID_OVERRIDE" | "NO_AVAILABLE_WEEK";
  postponedWeeks: number;
}
