"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { type KeyboardEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  confirmMatch,
  correctMatch,
  createDispute,
  getMatch,
  startRecognition,
  submitMatchRecord,
  uploadScreenshot,
} from "@/features/matches/client/api";
import { MATCH_ROLE_TYPES, MATCH_SCREENSHOT_TYPES, STAT_FIELDS_BY_SCREENSHOT, type MatchScreenshotType, type MatchStatField } from "@/features/matches/model";
import { useToast } from "@/web/components/ui/Toast";
import { ConfirmDialog } from "@/web/components/ui/ConfirmDialog";

const SCREEN_LABELS: Record<MatchScreenshotType, string> = {
  DATA: "数据", OUTPUT: "输出", SURVIVAL: "生存", DEVELOPMENT: "发育", KDA: "KDA", TEAM: "团队",
};
const ROLE_LABELS: Record<string, string> = { top: "对抗路", jungle: "打野", mid: "中路", adc: "发育路", support: "游走" };
const STAT_LABELS: Record<MatchStatField, string> = {
  damageDealt: "输出伤害", damageTaken: "承受伤害", gold: "总经济", participationRate: "参团率（0-1）",
  damageConversionRate: "伤害转化比", damageTakenPerDeath: "每死承伤", jungleGold: "野怪经济", minionKills: "补刀",
  kills: "击败", deaths: "死亡", assists: "助攻", controlScore: "控制效果", healing: "治疗量", towerDamage: "对塔伤害",
};
const ALL_STATS = Object.keys(STAT_LABELS) as MatchStatField[];
const MATCH_STATUS_LABELS: Record<string, string> = {
  DRAFT: "待上传数据",
  WAITING_CONFIRMATION: "等待人工确认",
  CONFIRMED: "已确认，待正式提交",
  SUBMITTED: "已正式提交",
};
const CONSISTENCY_LABELS: Record<string, string> = { PASS: "一致性通过", WARNING: "存在待核查项", FAIL: "一致性未通过" };
const RECOGNITION_LABELS: Record<string, string> = { PENDING: "等待识别", RUNNING: "识别中", COMPLETED: "识别完成", FAILED: "识别失败" };

function localizedStatus(labels: Record<string, string>, value: string | null | undefined, fallback: string) {
  return value ? labels[value] || value : fallback;
}

interface EditablePlayer {
  id: number; side: "red" | "blue"; slot: number; memberId: number | null; isGuest: boolean;
  gameNickname: string; heroId: number | null; heroName: string; roleType: string; score: number | string;
  updatedAt: string; statsUpdatedAt: string | null; stats: Record<MatchStatField, number | string>;
}
interface DetailData {
  match: {
    id: number; tournamentId: number; tournamentName: string; playedAt: string; status: string; winnerSide: "red" | "blue" | null;
    redTotalKills: number | null; blueTotalKills: number | null; consistencyStatus: string; consistencyDetails: unknown;
    updatedAt: string; players: Array<EditablePlayer & { stats: (Record<MatchStatField, number> & { updatedAt: string }) | null }>;
    screenshots: Array<{ id: number; type: MatchScreenshotType; originalFilename: string; size: number; recognitionStatus: string }>;
    recognition: { status: string; normalizedResult: unknown; warnings: unknown; errorCode: string | null } | null;
    disputes: Array<{ id: number; status: string; field: string | null; message: string; createdAt: string }>;
  };
  access: { canManage: boolean; isSuperAdmin: boolean };
  eligibleMembers: Array<{ id: number; username: string; gameNickname: string | null }>;
}
type RecognitionPlayer = { side: "red" | "blue"; slot: number; nickname: string | null; heroId: number | null; heroName: string | null; score: { value: number | null }; stats: Record<MatchStatField, { value: number | null }>; warnings: string[] };

function emptyStats(): Record<MatchStatField, number | string> {
  return Object.fromEntries(ALL_STATS.map((field) => [field, 0])) as Record<MatchStatField, number | string>;
}
function apiMessage(data: unknown, fallback: string) {
  return typeof data === "object" && data !== null && "error" in data && typeof data.error === "string" ? data.error : fallback;
}

export function MatchWorkspace() {
  const params = useParams<{ id: string; matchId: string }>();
  const routePrefix = usePathname().startsWith("/m/") ? "/m" : "";
  const tournamentId = params.id;
  const matchId = params.matchId;
  const [detail, setDetail] = useState<DetailData | null>(null);
  const [players, setPlayers] = useState<EditablePlayer[]>([]);
  const [activeType, setActiveType] = useState<MatchScreenshotType>("DATA");
  const [busy, setBusy] = useState<string | null>(null);
  const [winnerSide, setWinnerSide] = useState<"red" | "blue">("red");
  const [disputeMessage, setDisputeMessage] = useState("");
  const [disputePlayerId, setDisputePlayerId] = useState("");
  const [correction, setCorrection] = useState({ playerId: "", field: "score", value: "", reason: "" });
  const [submitConfirmationOpen, setSubmitConfirmationOpen] = useState(false);
  const { success, error } = useToast();

  const load = useCallback(async () => {
    try {
      const result = await getMatch<DetailData>(tournamentId, matchId);
      if (!result.ok) return error(apiMessage(result.data, "比赛档案加载失败，请确认登录状态后重试"));
      setDetail(result.data);
      setWinnerSide(result.data.match.winnerSide || "red");
      setPlayers(result.data.match.players.map((player) => ({
        ...player,
        heroName: player.heroName || "",
        score: player.score ?? 0,
        statsUpdatedAt: player.stats?.updatedAt || null,
        stats: { ...emptyStats(), ...(player.stats || {}) },
      })));
    } catch (cause) {
      error(cause instanceof Error ? cause.message : "比赛档案加载失败，请检查网络后重试");
    }
  }, [error, matchId, tournamentId]);

  useEffect(() => { void load(); }, [load]);
  const screenshotByType = useMemo(() => new Map(detail?.match.screenshots.map((item) => [item.type, item]) || []), [detail]);
  const canEdit = Boolean(detail?.access.canManage && detail.match.status !== "SUBMITTED");

  function updatePlayer(id: number, update: Partial<EditablePlayer>) {
    setPlayers((current) => current.map((player) => player.id === id ? { ...player, ...update } : player));
  }
  function updateStat(id: number, field: MatchStatField, value: string) {
    setPlayers((current) => current.map((player) => player.id === id ? { ...player, stats: { ...player.stats, [field]: value } } : player));
  }

  function moveDataTab(event: KeyboardEvent<HTMLButtonElement>, type: MatchScreenshotType) {
    const currentIndex = MATCH_SCREENSHOT_TYPES.indexOf(type);
    let nextIndex = currentIndex;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = (currentIndex + 1) % MATCH_SCREENSHOT_TYPES.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = (currentIndex - 1 + MATCH_SCREENSHOT_TYPES.length) % MATCH_SCREENSHOT_TYPES.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = MATCH_SCREENSHOT_TYPES.length - 1;
    else return;
    event.preventDefault();
    const nextType = MATCH_SCREENSHOT_TYPES[nextIndex];
    setActiveType(nextType);
    window.requestAnimationFrame(() => document.getElementById(`match-data-tab-${nextType}`)?.focus());
  }

  async function upload(type: MatchScreenshotType, file: File) {
    setBusy(`upload-${type}`);
    try {
      const result = await uploadScreenshot(tournamentId, matchId, type, file);
      if (!result.ok) return error(apiMessage(result.data, `${SCREEN_LABELS[type]}截图上传失败，请重试`));
      success(`${SCREEN_LABELS[type]}截图已保存`);
      await load();
    } catch (cause) {
      error(cause instanceof Error ? cause.message : `${SCREEN_LABELS[type]}截图上传失败，请检查网络后重试`);
    } finally {
      setBusy(null);
    }
  }

  function mergeRecognition(payload: unknown) {
    if (typeof payload !== "object" || payload === null || !("players" in payload) || !Array.isArray(payload.players)) return;
    const recognized = payload.players as RecognitionPlayer[];
    setPlayers((current) => current.map((player) => {
      const source = recognized.find((item) => item.side === player.side && item.slot === player.slot);
      if (!source) return player;
      const stats = { ...player.stats };
      for (const field of ALL_STATS) if (source.stats[field]?.value !== null) stats[field] = source.stats[field].value;
      return {
        ...player, stats,
        gameNickname: source.nickname || player.gameNickname,
        heroId: source.heroId || player.heroId,
        heroName: source.heroName || player.heroName,
        score: source.score.value ?? player.score,
      };
    }));
  }

  async function recognize() {
    setBusy("recognize");
    try {
      const result = await startRecognition<{ normalizedResult?: unknown }>(tournamentId, matchId);
      if (!result.ok) return error(apiMessage(result.data, "OCR 识别失败，请稍后重试"));
      mergeRecognition(result.data.normalizedResult);
      success("识别完成，请逐项人工复核；身份推荐未自动绑定");
      await load();
      mergeRecognition(result.data.normalizedResult);
    } catch (cause) {
      error(cause instanceof Error ? cause.message : "OCR 识别失败，请检查网络后重试");
    } finally {
      setBusy(null);
    }
  }

  async function confirm() {
    if (!detail) return;
    setBusy("confirm");
    try {
      const result = await confirmMatch(tournamentId, matchId, {
        expectedMatchUpdatedAt: detail.match.updatedAt,
        players: players.map((player) => ({
          id: player.id, memberId: player.memberId, isGuest: player.isGuest, gameNickname: player.gameNickname.trim(),
          heroId: player.heroId, heroName: player.heroName.trim() || null, roleType: player.roleType, score: Number(player.score),
          stats: Object.fromEntries(ALL_STATS.map((field) => [field, Number(player.stats[field])])),
        })),
      });
      if (!result.ok) return error(apiMessage(result.data, "人工确认失败，请检查数据后重试"));
      success("十名选手与全部数据已确认");
      await load();
    } catch (cause) {
      error(cause instanceof Error ? cause.message : "人工确认失败，请检查网络后重试");
    } finally {
      setBusy(null);
    }
  }

  async function submit() {
    const redTotalKills = players.filter((player) => player.side === "red").reduce((sum, player) => sum + Number(player.stats.kills), 0);
    const blueTotalKills = players.filter((player) => player.side === "blue").reduce((sum, player) => sum + Number(player.stats.kills), 0);
    setBusy("submit");
    try {
      const result = await submitMatchRecord(tournamentId, matchId, { winnerSide, redTotalKills, blueTotalKills });
      if (!result.ok) return error(apiMessage(result.data, "正式提交失败，请核对赛果后重试"));
      setSubmitConfirmationOpen(false);
      success("比赛档案已正式提交并锁定原图");
      await load();
    } catch (cause) {
      error(cause instanceof Error ? cause.message : "正式提交失败，请检查网络后重试；档案尚未锁定");
    } finally {
      setBusy(null);
    }
  }

  async function dispute() {
    setBusy("dispute");
    try {
      const result = await createDispute(tournamentId, matchId, { message: disputeMessage, matchPlayerId: disputePlayerId ? Number(disputePlayerId) : null, field: null });
      if (!result.ok) return error(apiMessage(result.data, "异议提交失败，请检查说明后重试"));
      setDisputeMessage(""); success("异议已提交"); await load();
    } catch (cause) {
      error(cause instanceof Error ? cause.message : "异议提交失败，请检查网络后重试");
    } finally {
      setBusy(null);
    }
  }

  async function correct() {
    const player = players.find((item) => item.id === Number(correction.playerId));
    if (!player) return error("请选择选手");
    const isStat = ALL_STATS.includes(correction.field as MatchStatField);
    setBusy("correct");
    try {
      const result = await correctMatch(matchId, {
        matchPlayerId: player.id, field: correction.field,
        value: correction.field === "gameNickname" || correction.field === "heroName" || correction.field === "roleType" ? correction.value : Number(correction.value),
        reason: correction.reason, expectedUpdatedAt: isStat ? player.statsUpdatedAt : player.updatedAt,
      });
      if (!result.ok) return error(apiMessage(result.data, "纠错失败，请刷新数据后重试"));
      success("纠错已写入审计记录"); await load();
    } catch (cause) {
      error(cause instanceof Error ? cause.message : "纠错失败，请检查网络后重试");
    } finally {
      setBusy(null);
    }
  }

  if (!detail) return <main className="page-shell page-shell--wide"><div className="feature-empty">正在读取比赛档案…</div></main>;
  const activeStatFields = STAT_FIELDS_BY_SCREENSHOT[activeType];
  const tableColumnCount = 6 + activeStatFields.length;

  return (
    <main className="page-shell page-shell--wide match-workspace">
      <nav className="feature-breadcrumb" aria-label="面包屑"><Link href={`${routePrefix}/tournaments/${tournamentId}`}>{detail.match.tournamentName}</Link><span>/</span><span>比赛档案 #{matchId}</span></nav>
      <header className="feature-hero">
        <div><p className="feature-kicker">VERIFIED MATCH RECORD</p><h1>比赛档案 #{matchId}</h1><p>{new Date(detail.match.playedAt).toLocaleString("zh-CN")} · 十人分队快照已固定</p></div>
        <div className="feature-hero-actions"><span className="feature-status">{localizedStatus(MATCH_STATUS_LABELS, detail.match.status, "状态未知")}</span><span className={`consistency consistency--${detail.match.consistencyStatus.toLowerCase()}`}>{localizedStatus(CONSISTENCY_LABELS, detail.match.consistencyStatus, "一致性未检查")}</span></div>
      </header>

      <section className="feature-section" aria-labelledby="confirm-title">
        <div className="feature-heading"><div><p className="feature-kicker">HUMAN REVIEW</p><h2 id="confirm-title">十人数据复核</h2><p>OCR 只预填字段，正式成员身份必须人工选择；补位选手保持游客身份。</p></div>{canEdit && <button className="btn-primary feature-action" disabled={Boolean(busy)} onClick={confirm}>{busy === "confirm" ? "保存中…" : "确认全部数据"}</button>}</div>
        <div className="data-tabs" role="tablist" aria-label="数据分类">{MATCH_SCREENSHOT_TYPES.map((type) => <button id={`match-data-tab-${type}`} key={type} role="tab" tabIndex={activeType === type ? 0 : -1} aria-selected={activeType === type} aria-controls="match-data-panel" onKeyDown={(event) => moveDataTab(event, type)} onClick={() => setActiveType(type)}>{SCREEN_LABELS[type]}</button>)}</div>
        <p className="match-result-table-hint" id="match-result-table-hint">表格按红蓝双方分组；移动端可在表格内左右滑动查看完整数据。</p>
        <div id="match-data-panel" className="match-result-table-wrap" tabIndex={0} role="tabpanel" aria-labelledby={`match-data-tab-${activeType}`} aria-describedby="match-result-table-hint">
          <table className="match-result-table">
            <caption>十人比赛数据复核表，当前数据分类：{SCREEN_LABELS[activeType]}</caption>
            <thead>
              <tr><th scope="col">阵营 / 位置</th><th scope="col">成员身份</th><th scope="col">游戏昵称</th><th scope="col">英雄</th><th scope="col">实际分路</th><th scope="col">评分</th>{activeStatFields.map((field) => <th scope="col" key={field}>{STAT_LABELS[field]}</th>)}</tr>
            </thead>
            {(["red", "blue"] as const).map((side) => {
              const sidePlayers = players.filter((player) => player.side === side);
              const totalKills = sidePlayers.reduce((sum, player) => sum + Number(player.stats.kills), 0);
              return <tbody className={`match-result-team match-result-team--${side}`} key={side}>
                <tr className="match-result-team-heading"><th colSpan={tableColumnCount} scope="rowgroup">{side === "red" ? "红方" : "蓝方"}<span>总击杀 {totalKills}</span></th></tr>
                {sidePlayers.map((player) => {
                  const member = detail.eligibleMembers.find((item) => item.id === player.memberId);
                  const playerLabel = `${side === "red" ? "红方" : "蓝方"} ${player.slot}`;
                  return <tr key={player.id}>
                    <th className="match-result-sticky" scope="row"><span className="player-slot">{side === "red" ? "红" : "蓝"} {player.slot}</span></th>
                    <td className="match-result-member">{canEdit ? <select aria-label={`${playerLabel}成员身份`} value={player.memberId ?? "guest"} onChange={(event) => { const guest = event.target.value === "guest"; updatePlayer(player.id, { memberId: guest ? null : Number(event.target.value), isGuest: guest }); }}><option value="guest">补位 / 游客</option>{detail.eligibleMembers.map((item) => <option value={item.id} key={item.id}>{item.gameNickname || item.username}</option>)}</select> : <span title={member ? member.gameNickname || member.username : "补位 / 游客"}>{member ? member.gameNickname || member.username : "补位 / 游客"}</span>}</td>
                    <td>{canEdit ? <input aria-label={`${playerLabel}游戏昵称`} value={player.gameNickname} maxLength={32} onChange={(event) => updatePlayer(player.id, { gameNickname: event.target.value })} /> : <strong title={player.gameNickname}>{player.gameNickname || "未命名"}</strong>}</td>
                    <td>{canEdit ? <input aria-label={`${playerLabel}英雄`} value={player.heroName} maxLength={64} onChange={(event) => updatePlayer(player.id, { heroId: null, heroName: event.target.value })} /> : <span title={player.heroName}>{player.heroName || "—"}</span>}</td>
                    <td>{canEdit ? <select aria-label={`${playerLabel}实际分路`} value={player.roleType} onChange={(event) => updatePlayer(player.id, { roleType: event.target.value })}>{MATCH_ROLE_TYPES.map((role) => <option value={role} key={role}>{ROLE_LABELS[role]}</option>)}</select> : <span>{ROLE_LABELS[player.roleType] || player.roleType}</span>}</td>
                    <td className="match-result-number">{canEdit ? <input aria-label={`${playerLabel}评分`} type="number" min="0" max="100" step="0.1" value={player.score} onChange={(event) => updatePlayer(player.id, { score: event.target.value })} /> : player.score}</td>
                    {activeStatFields.map((field) => <td className="match-result-number" key={field}>{canEdit ? <input aria-label={`${playerLabel}${STAT_LABELS[field]}`} type="number" min="0" step={field.includes("Rate") ? "0.01" : "1"} value={player.stats[field]} onChange={(event) => updateStat(player.id, field, event.target.value)} /> : player.stats[field]}</td>)}
                  </tr>;
                })}
              </tbody>;
            })}
          </table>
        </div>
      </section>

      <details className="match-evidence-disclosure" open={canEdit && detail.match.screenshots.length < 6}>
        <summary>
          <span><strong>数据依据</strong><small>比赛截图 {detail.match.screenshots.length}/6 · {localizedStatus(RECOGNITION_LABELS, detail.match.recognition?.status, "未识别")}</small></span>
          <span className="match-evidence-toggle" aria-hidden="true">查看</span>
        </summary>
        <div className="match-evidence-content">
          <div className="feature-heading"><div><p className="feature-kicker">SOURCE EVIDENCE</p><h2>截图与识别</h2><p>仅用于数据录入、复核和争议追溯，不作为赛果主体展示。</p></div><button className="btn-primary feature-action" disabled={!canEdit || busy === "recognize" || detail.match.screenshots.length !== 6} onClick={recognize}>{busy === "recognize" ? "识别中…" : "启动 OCR"}</button></div>
          <div className="screenshot-grid">
            {MATCH_SCREENSHOT_TYPES.map((type) => {
              const shot = screenshotByType.get(type);
              return <article className={`screenshot-slot ${shot ? "screenshot-slot--ready" : ""}`} key={type}>
                <div><strong>{SCREEN_LABELS[type]}</strong><span>{type}</span></div>
                <p>{shot ? `${shot.originalFilename} · ${(shot.size / 1024 / 1024).toFixed(2)} MB` : "等待上传 JPG / PNG / WebP"}</p>
                <div className="feature-row-actions">
                  {canEdit && <label className="btn-subtle file-button">{busy === `upload-${type}` ? "上传中…" : shot ? "替换" : "上传"}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={Boolean(busy)} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(type, file); event.currentTarget.value = ""; }} /></label>}
                  {shot && detail.access.isSuperAdmin && <a className="btn-subtle" href={`/api/tournaments/${tournamentId}/matches/${matchId}/screenshots/${type}`} target="_blank" rel="noreferrer">原图</a>}
                </div>
              </article>;
            })}
          </div>
        </div>
      </details>

      <section className="feature-section match-finalize" aria-labelledby="submit-title">
        <div><p className="feature-kicker">FINALIZE</p><h2 id="submit-title">赛果与正式提交</h2><p>双方总击杀自动取十名选手 K 值之和，并由服务端再次核验。</p></div>
        <div className="match-score-editor"><label>胜方<select disabled={!canEdit} value={winnerSide} onChange={(event) => setWinnerSide(event.target.value as "red" | "blue")}><option value="red">红方</option><option value="blue">蓝方</option></select></label><strong>{players.filter((p) => p.side === "red").reduce((s, p) => s + Number(p.stats.kills), 0)} : {players.filter((p) => p.side === "blue").reduce((s, p) => s + Number(p.stats.kills), 0)}</strong>{canEdit && <button className="btn-primary" disabled={Boolean(busy) || detail.match.status !== "CONFIRMED"} onClick={() => setSubmitConfirmationOpen(true)}>正式提交并锁定</button>}</div>
      </section>

      <div className="feature-two-columns">
        <section className="feature-section dispute-form"><p className="feature-kicker">DISPUTE</p><h2>数据异议</h2><label>异议范围<select value={disputePlayerId} onChange={(event) => setDisputePlayerId(event.target.value)}><option value="">整场比赛</option>{players.map((player) => <option value={player.id} key={player.id}>{player.gameNickname}</option>)}</select></label><label>异议说明<textarea rows={4} minLength={5} maxLength={1000} placeholder="说明需要核查的数据与理由" value={disputeMessage} onChange={(event) => setDisputeMessage(event.target.value)} /></label><button className="btn-subtle" disabled={busy === "dispute" || disputeMessage.trim().length < 5 || detail.match.status !== "SUBMITTED"} onClick={dispute}>{busy === "dispute" ? "提交中…" : "提交异议"}</button>{detail.match.disputes.map((item) => <p className="feature-note" key={item.id}>#{item.id} · {item.status} · {item.message}</p>)}</section>
        <section className="feature-section"><p className="feature-kicker">TEAM PRIVATE</p><h2>战术推演</h2><p>仅本队成员可进入对应战术室；房主维护图层，成员只编辑自己的路线与点位。</p><div className="feature-row-actions"><Link className="btn-subtle" href={`${routePrefix}/tournaments/${tournamentId}/matches/${matchId}/tactics/red`}>进入红方战术室</Link><Link className="btn-subtle" href={`${routePrefix}/tournaments/${tournamentId}/matches/${matchId}/tactics/blue`}>进入蓝方战术室</Link></div></section>
      </div>

      {detail.access.isSuperAdmin && detail.match.status === "SUBMITTED" && <section className="feature-section"><p className="feature-kicker">AUDITED CORRECTION</p><h2>超管纠错</h2><div className="correction-grid"><label>选手<select value={correction.playerId} onChange={(event) => setCorrection({ ...correction, playerId: event.target.value })}><option value="">选择选手</option>{players.map((player) => <option key={player.id} value={player.id}>{player.gameNickname}</option>)}</select></label><label>字段<select value={correction.field} onChange={(event) => setCorrection({ ...correction, field: event.target.value })}><option value="score">评分</option><option value="gameNickname">昵称</option><option value="heroName">英雄</option><option value="roleType">分路</option>{ALL_STATS.map((field) => <option value={field} key={field}>{STAT_LABELS[field]}</option>)}</select></label><label>新值<input value={correction.value} onChange={(event) => setCorrection({ ...correction, value: event.target.value })} /></label><label>修改原因<input placeholder="至少 5 字" value={correction.reason} onChange={(event) => setCorrection({ ...correction, reason: event.target.value })} /></label><button className="btn-primary" disabled={busy === "correct" || correction.reason.trim().length < 5} onClick={correct}>{busy === "correct" ? "保存中…" : "保存审计纠错"}</button></div></section>}
      <ConfirmDialog open={submitConfirmationOpen} title="正式提交并锁定比赛档案？" description="提交后原图、十人数据和战术标注都会进入只读复盘状态。请确认胜方与比分无误。" confirmLabel="确认提交并锁定" danger={false} busy={busy === "submit"} onClose={() => setSubmitConfirmationOpen(false)} onConfirm={() => void submit()} />
    </main>
  );
}
