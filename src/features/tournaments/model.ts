export const TOURNAMENT_CAPACITY = 10;

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
