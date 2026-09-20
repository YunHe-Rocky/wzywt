import type { DetailData, EditablePlayer } from "./model";

interface MatchDisputeFormProps {
  players: EditablePlayer[];
  disputes: DetailData["match"]["disputes"];
  status: string;
  busy: string | null;
  disputePlayerId: string;
  disputeMessage: string;
  setDisputePlayerId: (id: string) => void;
  setDisputeMessage: (message: string) => void;
  dispute: () => Promise<void>;
}

export function MatchDisputeForm({ players, disputes, status, busy, disputePlayerId, disputeMessage, setDisputePlayerId, setDisputeMessage, dispute }: MatchDisputeFormProps) {
  return (
    <section className="match-secondary-section dispute-form">
      <span className="match-section-label">赛后复核</span>
      <h2>数据异议</h2>
      <p>档案提交后，可指定选手或整场发起核查。</p>
      <label>
        异议范围
        <select value={disputePlayerId} onChange={(event) => setDisputePlayerId(event.target.value)}>
          <option value="">整场比赛</option>
          {players.map((player) => <option value={player.id} key={player.id}>{player.gameNickname}</option>)}
        </select>
      </label>
      <label>
        异议说明
        <textarea
          rows={4} minLength={5} maxLength={1000} placeholder="说明需要核查的数据与理由"
          value={disputeMessage} onChange={(event) => setDisputeMessage(event.target.value)}
        />
      </label>
      <button
        className="btn-subtle"
        disabled={busy === "dispute" || disputeMessage.trim().length < 5 || status !== "SUBMITTED"}
        onClick={dispute}
      >
        {busy === "dispute" ? "提交中…" : "提交异议"}
      </button>
      {disputes.map((item) => <p className="feature-note" key={item.id}>#{item.id} · {item.status} · {item.message}</p>)}
    </section>
  );
}
