export const TOURNAMENT_CAPACITY = 10;
export const TOURNAMENT_NAME_MAX_LENGTH = 64;
export const TOURNAMENT_ANNOUNCEMENT_MAX_LENGTH = 2_000;
export const TOURNAMENT_STATUSES = ["recruiting", "locked", "completed", "finished"] as const;
export const TOURNAMENT_ADMIN_ROLES = ["owner", "co_owner"] as const;

export class TournamentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TournamentValidationError";
  }
}

export function parsePositiveInteger(value: unknown, label = "ID"): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new TournamentValidationError(`无效的${label}`);
  }
  return parsed;
}

export interface TournamentDraft {
  name?: string;
  deadline?: Date;
  isPublic?: boolean;
  announcement?: string | null;
}

export function normalizeTournamentDraft(
  input: Record<string, unknown>,
  options: { partial?: boolean; now?: Date } = {},
): TournamentDraft {
  const { partial = false, now = new Date() } = options;
  const draft: TournamentDraft = {};

  if (!partial || input.name !== undefined) {
    if (typeof input.name !== "string") throw new TournamentValidationError("赛事名称必填");
    const name = input.name.trim();
    if (!name) throw new TournamentValidationError("赛事名称必填");
    if (name.length > TOURNAMENT_NAME_MAX_LENGTH) {
      throw new TournamentValidationError(`赛事名称不能超过${TOURNAMENT_NAME_MAX_LENGTH}个字符`);
    }
    draft.name = name;
  }

  if (!partial || input.deadline !== undefined) {
    if (typeof input.deadline !== "string" && !(input.deadline instanceof Date)) {
      throw new TournamentValidationError("截止时间必填");
    }
    const deadline = input.deadline instanceof Date ? new Date(input.deadline) : new Date(input.deadline);
    if (Number.isNaN(deadline.getTime())) throw new TournamentValidationError("截止时间格式无效");
    if (deadline.getTime() <= now.getTime()) throw new TournamentValidationError("截止时间必须晚于当前时间");
    draft.deadline = deadline;
  }

  if (!partial || input.isPublic !== undefined) {
    if (typeof input.isPublic !== "boolean") throw new TournamentValidationError("isPublic 必须为 boolean");
    draft.isPublic = input.isPublic;
  }

  if (input.announcement !== undefined) {
    if (input.announcement !== null && typeof input.announcement !== "string") {
      throw new TournamentValidationError("赛事公告格式无效");
    }
    const announcement = typeof input.announcement === "string" ? input.announcement.trim() : null;
    if (announcement && announcement.length > TOURNAMENT_ANNOUNCEMENT_MAX_LENGTH) {
      throw new TournamentValidationError(`赛事公告不能超过${TOURNAMENT_ANNOUNCEMENT_MAX_LENGTH}个字符`);
    }
    draft.announcement = announcement || null;
  }

  if (partial && Object.keys(draft).length === 0) {
    throw new TournamentValidationError("没有可更新字段");
  }
  return draft;
}

export function canViewTournamentMemberIdentity(role: string | null | undefined): boolean {
  return role === "owner" || role === "co_owner";
}

export const TEMPORARY_CLEANUP_STATUSES = ["recruiting", "locked"] as const;

interface ResolveRecruitmentStatusInput {
  currentStatus: string;
  playerCount: number;
  deadline: Date;
  hasSplitResult: boolean;
  now?: Date;
}

export function resolveRecruitmentStatus({
  currentStatus,
  playerCount,
  deadline,
  hasSplitResult,
  now = new Date(),
}: ResolveRecruitmentStatusInput): string {
  if (
    hasSplitResult
    || !["recruiting", "locked"].includes(currentStatus)
  ) {
    return currentStatus;
  }
  if (playerCount >= TOURNAMENT_CAPACITY) return "locked";
  return deadline.getTime() > now.getTime() ? "recruiting" : "locked";
}
