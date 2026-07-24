export interface AnnouncementDraft {
  version: string;
  title: string;
  content: string;
}

export class AnnouncementValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnnouncementValidationError";
  }
}

function requireText(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new AnnouncementValidationError(`${label}不能为空`);
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new AnnouncementValidationError(`${label}不能超过${maxLength}个字符`);
  }
  return normalized;
}

export function normalizeAnnouncementDraft(input: unknown): AnnouncementDraft {
  if (!input || typeof input !== "object") {
    throw new AnnouncementValidationError("公告数据格式错误");
  }
  const draft = input as Record<string, unknown>;
  return {
    version: requireText(draft.version, "版本号", 32),
    title: requireText(draft.title, "公告主题", 128),
    content: requireText(draft.content, "主要内容", 65_535),
  };
}

export function createAnnouncementBrief(content: string, fallback: string): string {
  const summary = content
    .split(/\r?\n/)
    .map((line) => line.trim().startsWith("#")
      ? ""
      : line
      .replace(/^[-*+]\s+/, "")
      .replace(/[*_`>#]/g, "")
      .trim())
    .find(Boolean);
  return (summary || fallback).slice(0, 255);
}

export function createAnnouncementSlug(version: string, title: string): string {
  const source = `v${version}-${title}`
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\w\u3400-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 56);
  return source || `announcement-${Date.now().toString(36)}`;
}
