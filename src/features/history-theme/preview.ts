import {
  HISTORY_THEME_BLOCK_LABELS,
  HISTORY_THEME_CATEGORY_LABELS,
  HISTORY_THEME_TONE_LABELS,
  isThemeCardActive,
  type ThemeDetailView,
} from "./presentation";

export const HISTORY_PREVIEW_STORAGE_KEY = "yanwu:history-preview:v1";

export interface HistoryPreviewSession {
  ownerId: number;
  theme: ThemeDetailView;
  now: number;
}

export const HISTORY_PREVIEW_STYLES = {
  festival: { name: "灯火良辰", mark: "庆", caption: "灯火相逢，佳节共此时" },
  campaign: { name: "山河兵略", mark: "阵", caption: "山河入卷，观古今之势" },
  memorial: { name: "静水铭记", mark: "铭", caption: "静心回望，铭记来时路" },
  scholar: { name: "青简人物", mark: "传", caption: "一卷青简，读人物风骨" },
} as const;

export function historyPreviewStyle(theme: Pick<ThemeDetailView, "category" | "tone">): keyof typeof HISTORY_PREVIEW_STYLES {
  if (theme.tone === "SOLEMN" || theme.category === "MODERN_COMMEMORATION") return "memorial";
  if (theme.tone === "FESTIVE") return "festival";
  if (theme.category === "ANCIENT_BATTLE") return "campaign";
  if (theme.category === "TRADITIONAL_FESTIVAL") return "festival";
  return "scholar";
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function strings(value: Record<string, unknown>, keys: string[]): boolean {
  return keys.every(key => typeof value[key] === "string");
}
function member(value: unknown, options: object): boolean {
  return typeof value === "string" && Object.hasOwn(options, value);
}

// Browser storage is untrusted and may contain an old or incomplete draft.
export function parseHistoryPreview(raw: string | null): HistoryPreviewSession | null {
  if (!raw || raw.length > 1_000_000) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!record(value) || !Number.isSafeInteger(value.ownerId) || Number(value.ownerId) <= 0 || typeof value.now !== "number" || !Number.isFinite(value.now)) return null;
    const theme = value.theme;
    if (!record(theme) || !strings(theme, ["slug", "title", "summary", "natureLabel", "startsAt", "endsAt", "dateLabel", "dateNote"])) return null;
    if (!member(theme.category, HISTORY_THEME_CATEGORY_LABELS) || !member(theme.tone, HISTORY_THEME_TONE_LABELS)) return null;
    if (theme.reviewedAt !== null || (theme.reconstructionNote !== null && typeof theme.reconstructionNote !== "string")) return null;
    if (!Array.isArray(theme.blocks) || !theme.blocks.every(block => record(block) && strings(block, ["id", "title", "body"]) && member(block.kind, HISTORY_THEME_BLOCK_LABELS))) return null;
    if (!Array.isArray(theme.sources) || !theme.sources.every(source => record(source) && strings(source, ["id", "title", "url", "publisher", "sourceType", "accessedAt"]) && Array.isArray(source.claimIds) && source.claimIds.every(id => typeof id === "string"))) return null;
    if (!isThemeCardActive(theme as unknown as ThemeDetailView, value.now)) return null;
    return value as unknown as HistoryPreviewSession;
  } catch {
    return null;
  }
}
