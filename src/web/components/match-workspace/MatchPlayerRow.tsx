import { MATCH_ROLE_TYPES, type MatchStatField } from "@/features/matches/model";
import {
  ROLE_LABELS, STAT_LABELS, manualReviewReasons, statValueForDisplay,
  statValueForInput, statValueFromInput, type DetailData, type EditablePlayer,
  type RecognitionPlayer,
} from "./model";

interface MatchPlayerRowProps {
  player: EditablePlayer;
  eligibleMembers: DetailData["eligibleMembers"];
  recognizedPlayer: RecognitionPlayer | undefined;
  activeStatFields: readonly MatchStatField[];
  canEdit: boolean;
  updatePlayer: (id: number, update: Partial<EditablePlayer>) => void;
  updateStat: (id: number, field: MatchStatField, value: string) => void;
}

export function MatchPlayerRow({ player, eligibleMembers, recognizedPlayer, activeStatFields, canEdit, updatePlayer, updateStat }: MatchPlayerRowProps) {
  const side = player.side;
  const member = eligibleMembers.find((item) => item.id === player.memberId);
  const playerLabel = `${side === "red" ? "红方" : "蓝方"} ${player.slot}`;
  const reviewReasons = manualReviewReasons(recognizedPlayer);

  return (
    <tr>
      <th className="match-result-sticky" scope="row">
        <span className="player-slot">{side === "red" ? "红" : "蓝"} {player.slot}</span>
        {reviewReasons.length > 0 && <small title={reviewReasons.join("；")}>需人工复核</small>}
      </th>
      <td className="match-result-member" data-label="成员身份">
        {canEdit ? (
          <select
            aria-label={`${playerLabel}成员身份`} value={player.memberId ?? "guest"}
            onChange={(event) => {
              const guest = event.target.value === "guest";
              updatePlayer(player.id, { memberId: guest ? null : Number(event.target.value), isGuest: guest });
            }}
          >
            <option value="guest">补位 / 游客</option>
            {eligibleMembers.map((item) => <option value={item.id} key={item.id}>{item.gameNickname || item.username}</option>)}
          </select>
        ) : <span>{player.isGuest ? "补位 / 游客" : member ? member.gameNickname || member.username : "正式成员"}</span>}
      </td>
      <td data-label="游戏昵称">
        {canEdit ? (
          <input
            aria-label={`${playerLabel}游戏昵称`} value={player.gameNickname} maxLength={32}
            onChange={(event) => updatePlayer(player.id, { gameNickname: event.target.value })}
          />
        ) : <strong title={player.gameNickname}>{player.gameNickname || "未命名"}</strong>}
      </td>
      <td data-label="英雄">
        {canEdit ? (
          <input
            aria-label={`${playerLabel}英雄`} value={player.heroName} maxLength={64}
            onChange={(event) => updatePlayer(player.id, { heroId: null, heroName: event.target.value })}
          />
        ) : <span title={player.heroName}>{player.heroName || "—"}</span>}
      </td>
      <td data-label="实际分路">
        {canEdit ? (
          <select
            aria-label={`${playerLabel}实际分路`} value={player.roleType}
            onChange={(event) => updatePlayer(player.id, { roleType: event.target.value })}
          >
            {MATCH_ROLE_TYPES.map((role) => <option value={role} key={role}>{ROLE_LABELS[role]}</option>)}
          </select>
        ) : <span>{ROLE_LABELS[player.roleType] || player.roleType}</span>}
      </td>
      <td className="match-result-number" data-label="评分">
        {canEdit ? (
          <input
            aria-label={`${playerLabel}评分`} type="number" min="0" max="100" step="0.1" value={player.score}
            onChange={(event) => updatePlayer(player.id, { score: event.target.value })}
          />
        ) : player.score}
      </td>
      {activeStatFields.map((field) => (
        <td className="match-result-number" data-label={STAT_LABELS[field]} key={field}>
          {canEdit ? (
            <input
              aria-label={`${playerLabel}${STAT_LABELS[field]}`} type="number" min="0"
              max={field === "participationRate" ? "100" : undefined}
              step={field.includes("Rate") ? "0.01" : "1"}
              value={statValueForInput(field, player.stats[field])}
              onChange={(event) => updateStat(player.id, field, statValueFromInput(field, event.target.value))}
            />
          ) : statValueForDisplay(field, player.stats[field])}
        </td>
      ))}
    </tr>
  );
}
