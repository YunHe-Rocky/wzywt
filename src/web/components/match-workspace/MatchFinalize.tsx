interface MatchFinalizeProps {
  status: string;
  canEdit: boolean;
  busy: string | null;
  winnerSide: "red" | "blue";
  redTotalKills: number;
  blueTotalKills: number;
  updateWinnerSide: (side: "red" | "blue") => void;
  requestSubmit: () => void;
}

export function MatchFinalize({ status, canEdit, busy, winnerSide, redTotalKills, blueTotalKills, updateWinnerSide, requestSubmit }: MatchFinalizeProps) {
  return (
    <section className="match-sheet match-finalize" aria-labelledby="submit-title">
      <div className="match-section-copy">
        <span className="match-section-index">03</span>
        <div>
          <span className="match-section-label">赛果确认</span>
          <h2 id="submit-title">正式提交</h2>
          <p>提交后锁定比分、十人数据与战术标注。</p>
        </div>
      </div>
      <div className="match-score-editor">
        <label>
          胜方
          <select disabled={!canEdit} value={winnerSide} onChange={(event) => updateWinnerSide(event.target.value as "red" | "blue")}>
            <option value="red">红方</option>
            <option value="blue">蓝方</option>
          </select>
        </label>
        <strong>
          <span>红</span>{redTotalKills}<b>:</b>{blueTotalKills}<span>蓝</span>
        </strong>
        {canEdit && (
          <button className="btn-primary" disabled={Boolean(busy) || status !== "CONFIRMED"} onClick={requestSubmit}>
            正式提交并锁定
          </button>
        )}
      </div>
    </section>
  );
}
