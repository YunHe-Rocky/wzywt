import type { LeapPolicy, TriggerKind } from "@/core/history-theme/types";
import type {
  HistoryThemeBlockView,
  HistoryThemeSourceView,
  ThemeDetailView,
} from "@/features/history-theme/presentation";

export const EDITOR_SECTIONS = ["基本信息", "触发规则", "内容块", "来源与素材", "排期与审核"] as const;
export type EditorSection = (typeof EDITOR_SECTIONS)[number];

export const TRIGGER_OPTIONS: Array<{ value: TriggerKind; label: string }> = [
  { value: "SOLAR_FIXED", label: "公历固定日期" },
  { value: "LUNAR_FIXED", label: "农历固定日期" },
  { value: "SOLAR_TERM", label: "清明节气偏移" },
  { value: "EDITORIAL_WINDOW", label: "演武堂历史策划" },
  { value: "ONE_OFF", label: "一次性时间窗" },
];

export interface StudioTrigger {
  kind: TriggerKind;
  solarMonth: string;
  solarDay: string;
  lunarMonth: string;
  lunarDay: string;
  leapPolicy: LeapPolicy;
  qingmingStartOffset: string;
  qingmingEndOffset: string;
  editorialStartsOn: string;
  editorialEndsOn: string;
  oneOffStartsAt: string;
  oneOffEndsAt: string;
}

export interface StudioMaterial {
  attribution: string;
  licenseStatus: "UNSET" | "AUTHORIZED" | "RESTRICTED";
  reconstructionNote: string;
}

export interface HistoryThemeStudioState {
  theme: ThemeDetailView;
  trigger: StudioTrigger;
  material: StudioMaterial;
}

let localId = 0;
export function newEditorId(prefix: "block" | "source"): string {
  localId += 1;
  return `${prefix}-${localId}`;
}

export function createEmptyBlock(): HistoryThemeBlockView {
  return { id: newEditorId("block"), kind: "FACT_SUMMARY", title: "", body: "" };
}

export function createEmptySource(): HistoryThemeSourceView {
  return {
    id: newEditorId("source"),
    title: "",
    url: "",
    publisher: "",
    sourceType: "",
    accessedAt: "",
    claimIds: [],
  };
}

export function createInitialStudioState(): HistoryThemeStudioState {
  return {
    theme: {
      slug: "untitled-history-theme",
      title: "未命名历史主题",
      summary: "在工作室中填写经核实的主题摘要。",
      category: "TRADITIONAL_FESTIVAL",
      tone: "CULTURAL",
      natureLabel: "历史内容预览",
      startsAt: "2000-01-01T00:00:00+08:00",
      endsAt: "2100-01-01T00:00:00+08:00",
      dateLabel: "日期待编辑确认",
      dateNote: "请填写日期口径与必要说明。",
      reviewedAt: null,
      reconstructionNote: null,
      blocks: [{ id: "block-initial", kind: "FACT_SUMMARY", title: "", body: "" }],
      sources: [{ id: "source-initial", title: "", url: "", publisher: "", sourceType: "", accessedAt: "", claimIds: [] }],
    },
    trigger: {
      kind: "SOLAR_FIXED",
      solarMonth: "1",
      solarDay: "1",
      lunarMonth: "1",
      lunarDay: "1",
      leapPolicy: "REGULAR_ONLY",
      qingmingStartOffset: "0",
      qingmingEndOffset: "0",
      editorialStartsOn: "",
      editorialEndsOn: "",
      oneOffStartsAt: "",
      oneOffEndsAt: "",
    },
    material: {
      attribution: "",
      licenseStatus: "UNSET",
      reconstructionNote: "",
    },
  };
}

const SHANGHAI_DAY = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  month: "numeric",
  day: "numeric",
  weekday: "short",
});

const SHANGHAI_DAY_KEY = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function buildFutureCalendarDays(now = Date.now(), count = 45) {
  return Array.from({ length: count }, (_, index) => {
    const timestamp = now + index * 24 * 60 * 60 * 1000;
    const parts = Object.fromEntries(
      SHANGHAI_DAY_KEY.formatToParts(new Date(timestamp)).map(part => [part.type, part.value]),
    );
    const labelParts = Object.fromEntries(
      SHANGHAI_DAY.formatToParts(new Date(timestamp)).map(part => [part.type, part.value]),
    );
    return {
      key: `${parts.year}-${parts.month}-${parts.day}`,
      label: `${Number(labelParts.month)}月${Number(labelParts.day)}日 ${labelParts.weekday}`,
    };
  });
}
