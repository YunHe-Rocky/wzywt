import { ROLE_LABELS } from "@/core/game";
import type { SplitResult, TeamColor } from "./types";

export function LineupPanel({
  teamColor,
  splitResult,
  currentUserId,
}: {
  teamColor: TeamColor;
  splitResult: SplitResult;
  currentUserId?: number;
}) {
  const team = teamColor === "red" ? splitResult.teamRed : splitResult.teamBlue;
  const isRed = teamColor === "red";

  const teamLabel = isRed ? "红队" : "蓝队";
  return (
    <section className={`yanwu-lineup yanwu-lineup--${teamColor}`} aria-label={teamLabel}>
      <header><h3>{teamLabel}</h3><span>{team.length} 人</span></header>
      <ol>
        {team.map(p => {
          const detail = splitResult.playerDetails.find(d => d.userId === p.userId);
          return (
            <li key={p.userId}>
              <strong>{detail?.username || "?"}{p.userId === currentUserId && <small>（我）</small>}</strong>
              <span>
                <small>{p.preferenceRank && p.preferenceRank <= 5 ? `第 ${p.preferenceRank} 志愿` : "全局补位"}</small>
                <b>{ROLE_LABELS[p.roleType]}</b>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
