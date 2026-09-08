import { isMatchSide, type MatchSide } from "./model";

/** Tournament admin assignments must already be scoped to this user. */
export function getMatchVisibility(
  user: { userId: number; role: string },
  match: { status: string; players: ReadonlyArray<{ memberId: number | null; side: string }>; tournament: { admins: ReadonlyArray<{ role: string }> } },
) {
  const side = match.players.find(({ memberId }) => memberId === user.userId)?.side;
  const ownSide: MatchSide | null = isMatchSide(side) ? side : null;
  const canManage = user.role === "admin" || match.tournament.admins.some(({ role }) => role === "owner" || role === "co_owner");
  return { ownSide, canManage, canViewArchive: canManage || (match.status === "SUBMITTED" && ownSide !== null) };
}
