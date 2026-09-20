import Link from "next/link";
import { CONSISTENCY_LABELS, MATCH_STATUS_LABELS, localizedStatus, type DetailData } from "./model";

interface MatchRecordHeaderProps {
  match: DetailData["match"];
  matchId: string;
  roomHref: string;
  redTotalKills: number;
  blueTotalKills: number;
}

export function MatchRecordHeader({ match, matchId, roomHref, redTotalKills, blueTotalKills }: MatchRecordHeaderProps) {
  const playedAt = new Date(match.playedAt).toLocaleString("zh-CN");
  return <>
    <nav className="feature-breadcrumb" aria-label="面包屑">
      <Link href={roomHref}>{match.tournamentName}</Link>
      <span aria-hidden="true">/</span>
      <span>比赛档案</span>
    </nav>

    <header className="match-record-header">
      <div className="match-record-title">
        <span className="match-record-label">赛事正式记录</span>
        <div>
          <h1>比赛档案</h1>
          <strong>#{String(matchId).padStart(3, "0")}</strong>
          <span className="badge badge-gold" style={{ fontSize: 12 }}>BETA 测试</span>
        </div>
        <p>{match.tournamentName} · {playedAt}</p>
      </div>
      <div className="match-record-summary">
        <div className="match-record-score" aria-label={`当前比分，红方 ${redTotalKills}，蓝方 ${blueTotalKills}`}>
          <span className="match-record-side match-record-side--red">
            <small>红方</small>
            <strong>{redTotalKills}</strong>
          </span>
          <b aria-hidden="true">:</b>
          <span className="match-record-side match-record-side--blue">
            <strong>{blueTotalKills}</strong>
            <small>蓝方</small>
          </span>
        </div>
        <div className="match-record-statuses">
          <span>{localizedStatus(MATCH_STATUS_LABELS, match.status, "状态未知")}</span>
          <span className={`consistency consistency--${match.consistencyStatus.toLowerCase()}`}>{localizedStatus(CONSISTENCY_LABELS, match.consistencyStatus, "一致性未检查")}</span>
        </div>
      </div>
    </header>

  </>;
}
