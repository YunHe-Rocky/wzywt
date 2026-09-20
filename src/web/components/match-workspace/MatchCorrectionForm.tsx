import type { MatchStatField } from "@/features/matches/model";
import { ALL_STATS, STAT_LABELS, type EditablePlayer } from "./model";

export interface MatchCorrection {
  playerId: string;
  field: string;
  value: string;
  reason: string;
}

interface MatchCorrectionFormProps {
  players: EditablePlayer[];
  busy: string | null;
  correction: MatchCorrection;
  setCorrection: (value: MatchCorrection) => void;
  correct: () => Promise<void>;
}

export function MatchCorrectionForm({ players, busy, correction, setCorrection, correct }: MatchCorrectionFormProps) {
  return (
    <section className="match-sheet">
      <div className="match-section-heading">
        <div className="match-section-copy">
          <span className="match-section-index">04</span>
          <div>
            <span className="match-section-label">审计操作</span>
            <h2>超管纠错</h2>
          </div>
        </div>
      </div>
      <div className="correction-grid">
        <label>
          选手
          <select value={correction.playerId} onChange={(event) => setCorrection({ ...correction, playerId: event.target.value })}>
            <option value="">选择选手</option>
            {players.map((player) => <option key={player.id} value={player.id}>{player.gameNickname}</option>)}
          </select>
        </label>
        <label>
          字段
          <select value={correction.field} onChange={(event) => setCorrection({ ...correction, field: event.target.value })}>
            <option value="score">评分</option>
            <option value="gameNickname">昵称</option>
            <option value="heroName">英雄</option>
            <option value="roleType">分路</option>
            {ALL_STATS.map((field) => <option value={field} key={field}>{STAT_LABELS[field]}</option>)}
          </select>
        </label>
        <label>
          {correction.field === "participationRate" ? "新值（%）" : "新值"}
          <input
            type={ALL_STATS.includes(correction.field as MatchStatField) ? "number" : undefined}
            min={correction.field === "participationRate" ? "0" : undefined}
            max={correction.field === "participationRate" ? "100" : undefined}
            step={correction.field === "participationRate" ? "0.01" : undefined}
            value={correction.value}
            onChange={(event) => setCorrection({ ...correction, value: event.target.value })}
          />
        </label>
        <label>
          修改原因
          <input
            placeholder="至少 5 字" value={correction.reason}
            onChange={(event) => setCorrection({ ...correction, reason: event.target.value })}
          />
        </label>
        <button className="btn-primary" disabled={busy === "correct" || correction.reason.trim().length < 5} onClick={correct}>
          {busy === "correct" ? "保存中…" : "保存审计纠错"}
        </button>
      </div>
    </section>
  );
}
