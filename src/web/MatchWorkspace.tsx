"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  cancelRecognition,
  confirmMatch,
  correctMatch,
  createDispute,
  getMatch,
  startRecognition,
  submitMatchRecord,
  uploadScreenshot,
} from "@/features/matches/client/api";
import { MATCH_ROLE_TYPES, MATCH_SCREENSHOT_TYPES, STAT_FIELDS_BY_SCREENSHOT, type MatchScreenshotType, type MatchStatField, type NormalizedRecognitionPlayer } from "@/features/matches/model";
import { recognitionFailureMessage } from "@/features/matches/recognition-errors";
import { useToast } from "@/web/components/ui/Toast";
import { ConfirmDialog } from "@/web/components/ui/ConfirmDialog";
import { MatchWorkflowProgress } from "@/web/components/match/MatchWorkflowProgress";
import { clearMatchDraft, matchDraftVersion, readMatchDraft, shouldPreserveActiveMatchDraft, writeMatchDraft, type MatchDraftIdentity } from "@/web/match-draft-storage";

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
  UPLOADED: "截图已齐全，待识别",
  WAITING_CONFIRMATION: "等待人工确认",
  CONFIRMED: "已确认，待正式提交",
  SUBMITTED: "已正式提交",
};
const CONSISTENCY_LABELS: Record<string, string> = { PASS: "一致性通过", WARNING: "存在待核查项", FAIL: "一致性未通过" };
const RECOGNITION_LABELS: Record<string, string> = { PENDING: "等待识别", QUEUED: "已进入识别队列", PROCESSING: "识别中", RUNNING: "识别中", COMPLETED: "识别完成", CANCELED: "已取消", SUPERSEDED: "已被新截图替代", FAILED: "识别失败" };

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
    evidenceRevision: number; recordRevision: number; updatedAt: string;
    players: Array<EditablePlayer & { stats: (Record<MatchStatField, number> & { updatedAt: string }) | null }>;
    screenshots: Array<{ id: number; type: MatchScreenshotType; originalFilename: string; size: number; recognitionStatus: string }>;
    recognition: { status: string; normalizedResult: unknown; warnings: unknown; errorCode: string | null; attemptCount: number; availableAt: string; heartbeatAt: string | null } | null;
    disputes: Array<{ id: number; status: string; field: string | null; message: string; createdAt: string }>;
  };
  access: { canManage: boolean; isSuperAdmin: boolean; currentUserId: number; ownSide?: "red" | "blue" | null };
  eligibleMembers: Array<{ id: number; username: string; gameNickname: string | null }>;
}
type RecognitionPlayer = NormalizedRecognitionPlayer;

function emptyStats(): Record<MatchStatField, number | string> {
  return Object.fromEntries(ALL_STATS.map((field) => [field, 0])) as Record<MatchStatField, number | string>;
}
function apiMessage(data: unknown, fallback: string) {
  return typeof data === "object" && data !== null && "error" in data && typeof data.error === "string" ? data.error : fallback;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isEditablePlayer(value: unknown): value is EditablePlayer {
  if (!isRecord(value) || typeof value.id !== "number" || !Number.isSafeInteger(value.id)
    || (value.side !== "red" && value.side !== "blue") || typeof value.slot !== "number"
    || !(value.memberId === null || (typeof value.memberId === "number" && Number.isSafeInteger(value.memberId)))
    || typeof value.isGuest !== "boolean" || typeof value.gameNickname !== "string" || typeof value.heroName !== "string"
    || !(value.heroId === null || (typeof value.heroId === "number" && Number.isSafeInteger(value.heroId)))
    || typeof value.roleType !== "string" || !(typeof value.score === "number" || typeof value.score === "string")
    || typeof value.updatedAt !== "string" || !(value.statsUpdatedAt === null || typeof value.statsUpdatedAt === "string")) return false;
  const stats = value.stats;
  if (!isRecord(stats)) return false;
  return ALL_STATS.every((field) => typeof stats[field] === "number" || typeof stats[field] === "string");
}
function recognitionPlayers(value: unknown): RecognitionPlayer[] {
  if (!isRecord(value) || !Array.isArray(value.players)) return [];
  return value.players.filter((player): player is RecognitionPlayer => isRecord(player)
    && (player.side === "red" || player.side === "blue") && typeof player.slot === "number"
    && Array.isArray(player.warnings) && isRecord(player.score) && isRecord(player.stats));
}
function manualReviewReasons(player: RecognitionPlayer | undefined): string[] {
  if (!player) return [];
  const reasons = [...player.warnings];
  const metrics = [["评分", player.score] as const, ...ALL_STATS.map((field) => [STAT_LABELS[field], player.stats[field]] as const)];
  for (const [label, metric] of metrics) {
    if (metric.conflict) reasons.push(`${label}跨图冲突`);
    else if (metric.sources.some(({ confidence }) => confidence !== null && confidence < 0.7)) reasons.push(`${label}置信度低`);
  }
  return Array.from(new Set(reasons));
}

function mergeRecognitionPlayers(current: EditablePlayer[], payload: unknown): EditablePlayer[] {
  if (typeof payload !== "object" || payload === null || !("players" in payload) || !Array.isArray(payload.players)) return current;
  const recognized = payload.players as RecognitionPlayer[];
  return current.map((player) => {
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
  });
}

export function MatchWorkspace() {
  const params = useParams<{ id: string; matchId: string }>();
  const routePrefix = usePathname().startsWith("/m/") ? "/m" : "";
  const tournamentId = params.id;
  const matchId = params.matchId;
  const [detail, setDetail] = useState<DetailData | null>(null);
  const [loadError, setLoadError] = useState("");
  const [players, setPlayers] = useState<EditablePlayer[]>([]);
  const [activeType, setActiveType] = useState<MatchScreenshotType>("DATA");
  const [busy, setBusy] = useState<string | null>(null);
  const [winnerSide, setWinnerSide] = useState<"red" | "blue">("red");
  const [disputeMessage, setDisputeMessage] = useState("");
  const [disputePlayerId, setDisputePlayerId] = useState("");
  const [correction, setCorrection] = useState({ playerId: "", field: "score", value: "", reason: "" });
  const [submitConfirmationOpen, setSubmitConfirmationOpen] = useState(false);
  const [uploadErrors, setUploadErrors] = useState<Partial<Record<MatchScreenshotType, string>>>({});
  const [draftStatus, setDraftStatus] = useState("");
  const dirtyRef = useRef(false);
  const restoredDraftRef = useRef(false);
  const draftVersionRef = useRef<string | null>(null);
  const playersRef = useRef<EditablePlayer[]>([]);
  const winnerSideRef = useRef<"red" | "blue">("red");
  const { success, error } = useToast();

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const result = await getMatch<DetailData>(tournamentId, matchId);
      if (!result.ok) { setDetail(null); setPlayers([]); setLoadError(apiMessage(result.data, "比赛档案加载失败，请确认登录状态后重试")); return; }
      setDetail(result.data);
      const loadedPlayers = mergeRecognitionPlayers(result.data.match.players.map((player) => ({
        ...player,
        heroName: player.heroName || "",
        score: player.score ?? 0,
        statsUpdatedAt: player.stats?.updatedAt || null,
        stats: { ...emptyStats(), ...(player.stats || {}) },
      })), result.data.match.recognition?.normalizedResult);
      const identity: MatchDraftIdentity = {
        userId: result.data.access.currentUserId,
        matchId,
        evidenceRevision: result.data.match.evidenceRevision,
        baseUpdatedAt: result.data.match.updatedAt,
      };
      const editable = result.data.access.canManage && result.data.match.status !== "SUBMITTED";
      if (!editable) {
        clearMatchDraft(window.localStorage, identity);
        dirtyRef.current = false;
        restoredDraftRef.current = false;
        setPlayers(loadedPlayers);
        setWinnerSide(result.data.match.winnerSide || "red");
        setDraftStatus("");
      } else {
        const draftVersion = matchDraftVersion(identity);
        const preserveActiveDraft = shouldPreserveActiveMatchDraft(dirtyRef.current, draftVersionRef.current, identity);
        const saved = preserveActiveDraft ? null : readMatchDraft(window.localStorage, identity, isEditablePlayer);
        const expectedIds = loadedPlayers.map(({ id }) => id).sort((left, right) => left - right).join(",");
        const savedIds = saved?.players.map(({ id }) => id).sort((left, right) => left - right).join(",");
        if (preserveActiveDraft) {
          // Recognition polling may refresh server state while the user is editing. Keep the newer in-memory draft.
        } else if (saved && savedIds === expectedIds) {
          dirtyRef.current = true;
          restoredDraftRef.current = true;
          setPlayers(saved.players);
          setWinnerSide(saved.winnerSide);
          setDraftStatus(`已恢复 ${new Date(saved.savedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })} 的本地草稿`);
        } else if (!dirtyRef.current || draftVersionRef.current !== draftVersion) {
          if (dirtyRef.current && draftVersionRef.current !== null && draftVersionRef.current !== draftVersion) setDraftStatus("服务器数据已更新，旧版本草稿未恢复");
          else setDraftStatus("");
          dirtyRef.current = false;
          restoredDraftRef.current = false;
          setPlayers(loadedPlayers);
          setWinnerSide(result.data.match.winnerSide || "red");
        }
        draftVersionRef.current = draftVersion;
      }
    } catch (cause) {
      setDetail(null); setPlayers([]); setLoadError(cause instanceof Error ? cause.message : "比赛档案加载失败，请检查网络后重试");
    }
  }, [matchId, tournamentId]);

  useEffect(() => { void load(); }, [load]);
  const recognitionActive = ["QUEUED", "RUNNING"].includes(detail?.match.recognition?.status || "");
  useEffect(() => {
    if (!recognitionActive) return;
    const timer = window.setInterval(() => void load(), 2_000);
    return () => window.clearInterval(timer);
  }, [load, recognitionActive]);
  const screenshotByType = useMemo(() => new Map(detail?.match.screenshots.map((item) => [item.type, item]) || []), [detail]);
  const recognizedPlayers = useMemo(() => recognitionPlayers(detail?.match.recognition?.normalizedResult), [detail]);
  const canEdit = Boolean(detail?.access.canManage && detail.match.status !== "SUBMITTED");
  playersRef.current = players;
  winnerSideRef.current = winnerSide;

  const persistDraft = useCallback(() => {
    if (!detail || !canEdit || !dirtyRef.current) return;
    try {
      writeMatchDraft(window.localStorage, {
        userId: detail.access.currentUserId,
        matchId,
        evidenceRevision: detail.match.evidenceRevision,
        baseUpdatedAt: detail.match.updatedAt,
      }, { players: playersRef.current, winnerSide: winnerSideRef.current });
      const prefix = restoredDraftRef.current ? "已恢复本地草稿并重新保存" : "草稿已保存";
      restoredDraftRef.current = false;
      setDraftStatus(`${prefix} ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`);
    } catch {
      setDraftStatus("浏览器无法保存草稿，请先不要关闭页面");
    }
  }, [canEdit, detail, matchId]);

  useEffect(() => {
    if (!dirtyRef.current) return;
    const timer = window.setTimeout(persistDraft, 500);
    return () => window.clearTimeout(timer);
  }, [persistDraft, players, winnerSide]);
  useEffect(() => {
    const flush = () => persistDraft();
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", flush);
    };
  }, [persistDraft]);

  function markDraftDirty() {
    dirtyRef.current = true;
    setDraftStatus("正在保存本地草稿…");
  }
  function clearCurrentDraft() {
    if (detail) clearMatchDraft(window.localStorage, { userId: detail.access.currentUserId, matchId });
    dirtyRef.current = false;
    restoredDraftRef.current = false;
  }

  function updatePlayer(id: number, update: Partial<EditablePlayer>) {
    markDraftDirty();
    setPlayers((current) => current.map((player) => player.id === id ? { ...player, ...update } : player));
  }
  function updateStat(id: number, field: MatchStatField, value: string) {
    markDraftDirty();
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
    setUploadErrors((current) => ({ ...current, [type]: undefined }));
    setBusy(`upload-${type}`);
    try {
      const result = await uploadScreenshot(tournamentId, matchId, type, file);
      if (!result.ok) {
        const message = apiMessage(result.data, `${SCREEN_LABELS[type]}截图上传失败，请重试`);
        setUploadErrors((current) => ({ ...current, [type]: message }));
        return error(message);
      }
      success(`${SCREEN_LABELS[type]}截图已保存`);
      await load();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : `${SCREEN_LABELS[type]}截图上传失败，请检查网络后重试`;
      setUploadErrors((current) => ({ ...current, [type]: message }));
      error(message);
    } finally {
      setBusy(null);
    }
  }

  async function recognize() {
    setBusy("recognize");
    try {
      const result = await startRecognition<{ recognitionId: number; status: string }>(tournamentId, matchId);
      if (!result.ok) return error(apiMessage(result.data, "OCR 任务启动失败，请稍后重试"));
      success("OCR 任务 #" + result.data.recognitionId + " 已进入队列，可离开页面后再返回查看");
      await load();
    } catch (cause) {
      error(cause instanceof Error ? cause.message : "OCR 识别失败，请检查网络后重试");
    } finally {
      setBusy(null);
    }
  }

  async function cancelRecognitionJob() {
    setBusy("cancel-recognition");
    try {
      const result = await cancelRecognition(tournamentId, matchId);
      if (!result.ok) return error(apiMessage(result.data, "取消 OCR 任务失败，请刷新后重试"));
      success("OCR 任务已取消");
      await load();
    } catch (cause) {
      error(cause instanceof Error ? cause.message : "取消 OCR 任务失败，请检查网络后重试");
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
      clearCurrentDraft();
      setDraftStatus("本地草稿已同步到服务器");
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
      clearCurrentDraft();
      setDraftStatus("");
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
    if (!detail) return error("比赛档案尚未加载完成");
    const player = players.find((item) => item.id === Number(correction.playerId));
    if (!player) return error("请选择选手");
    const isStat = ALL_STATS.includes(correction.field as MatchStatField);
    setBusy("correct");
    try {
      const result = await correctMatch(matchId, {
        matchPlayerId: player.id, field: correction.field,
        value: correction.field === "gameNickname" || correction.field === "heroName" || correction.field === "roleType" ? correction.value : Number(correction.value),
        reason: correction.reason, expectedUpdatedAt: isStat ? player.statsUpdatedAt : player.updatedAt,
        expectedMatchRevision: detail.match.recordRevision,
      });
      if (!result.ok) return error(apiMessage(result.data, "纠错失败，请刷新数据后重试"));
      success("纠错已写入审计记录"); await load();
    } catch (cause) {
      error(cause instanceof Error ? cause.message : "纠错失败，请检查网络后重试");
    } finally {
      setBusy(null);
    }
  }

  if (!detail) return <main className="page-shell page-shell--wide"><div className="feature-empty" role={loadError ? "alert" : "status"}>{loadError || "正在读取比赛档案…"}{loadError && <div className="feature-row-actions"><Link className="btn-subtle" href={`${routePrefix}/tournaments/${tournamentId}`}>返回房间</Link><button className="btn-subtle" onClick={() => void load()}>重试</button></div>}</div></main>;
  const activeStatFields = STAT_FIELDS_BY_SCREENSHOT[activeType];
  const tableColumnCount = 6 + activeStatFields.length;
  const redPlayers = players.filter((player) => player.side === "red");
  const bluePlayers = players.filter((player) => player.side === "blue");
  const redTotalKills = canEdit ? redPlayers.reduce((sum, player) => sum + Number(player.stats.kills), 0) : detail.match.redTotalKills ?? 0;
  const blueTotalKills = canEdit ? bluePlayers.reduce((sum, player) => sum + Number(player.stats.kills), 0) : detail.match.blueTotalKills ?? 0;
  const ownSide = detail.access.ownSide ?? players.find(p => p.memberId === detail.access.currentUserId)?.side ?? null;
  const visibleSides = detail.access.canManage ? ["red", "blue"] as const : ownSide ? [ownSide] : [];
  const playedAt = new Date(detail.match.playedAt).toLocaleString("zh-CN");

  return (
    <main className="page-shell page-shell--wide match-workspace">
      <nav className="feature-breadcrumb" aria-label="面包屑"><Link href={`${routePrefix}/tournaments/${tournamentId}`}>{detail.match.tournamentName}</Link><span aria-hidden="true">/</span><span>比赛档案</span></nav>

      <header className="match-record-header">
        <div className="match-record-title">
          <span className="match-record-label">赛事正式记录</span>
          <div><h1>比赛档案</h1><strong>#{String(matchId).padStart(3, "0")}</strong><span className="badge badge-gold" style={{ fontSize: 11 }}>BETA 测试</span></div>
          <p>{detail.match.tournamentName} · {playedAt}</p>
        </div>
        <div className="match-record-summary">
          <div className="match-record-score" aria-label={`当前比分，红方 ${redTotalKills}，蓝方 ${blueTotalKills}`}>
            <span className="match-record-side match-record-side--red"><small>红方</small><strong>{redTotalKills}</strong></span>
            <b aria-hidden="true">:</b>
            <span className="match-record-side match-record-side--blue"><strong>{blueTotalKills}</strong><small>蓝方</small></span>
          </div>
          <div className="match-record-statuses"><span>{localizedStatus(MATCH_STATUS_LABELS, detail.match.status, "状态未知")}</span><span className={`consistency consistency--${detail.match.consistencyStatus.toLowerCase()}`}>{localizedStatus(CONSISTENCY_LABELS, detail.match.consistencyStatus, "一致性未检查")}</span></div>
        </div>
      </header>

      {detail.access.canManage && <MatchWorkflowProgress status={detail.match.status} screenshotCount={detail.match.screenshots.length} recognitionStatus={detail.match.recognition?.status} />}
      {draftStatus && <p className="feature-note match-draft-note" role="status" aria-live="polite">{draftStatus}</p>}

      <section className="match-sheet" aria-labelledby="confirm-title">
        <div className="match-section-heading">
          <div className="match-section-copy"><span className="match-section-index">01</span><div><span className="match-section-label">比赛数据</span><h2 id="confirm-title">{detail.access.canManage ? "十人数据复核" : "本队比赛数据"}</h2><p>{detail.access.canManage ? "识别结果仅作录入辅助，成员身份与比赛数据仍需人工确认。" : "仅展示自己所在队伍已正式提交的比赛记录。"}</p></div></div>
          {canEdit && <button className="btn-primary feature-action" disabled={Boolean(busy)} onClick={confirm}>{busy === "confirm" ? "保存中…" : "保存复核结果"}</button>}
        </div>
        <div className="data-tabs" role="tablist" aria-label="数据分类">{MATCH_SCREENSHOT_TYPES.map((type) => <button id={`match-data-tab-${type}`} key={type} role="tab" tabIndex={activeType === type ? 0 : -1} aria-selected={activeType === type} aria-controls="match-data-panel" onKeyDown={(event) => moveDataTab(event, type)} onClick={() => setActiveType(type)}>{SCREEN_LABELS[type]}</button>)}</div>
        <p className="match-result-table-hint" id="match-result-table-hint">{detail.access.canManage ? "桌面端按双方对照；" : "当前为本队数据；"}窄屏会自动排成逐选手记录，无需横向滑动。</p>
        <div id="match-data-panel" className="match-result-table-wrap" tabIndex={0} role="tabpanel" aria-labelledby={`match-data-tab-${activeType}`} aria-describedby="match-result-table-hint">
          <table className="match-result-table">
            <caption>{detail.access.canManage ? "十人比赛数据复核表" : "本队比赛数据表"}，当前数据分类：{SCREEN_LABELS[activeType]}</caption>
            <thead>
              <tr><th scope="col">阵营 / 位置</th><th scope="col">成员身份</th><th scope="col">游戏昵称</th><th scope="col">英雄</th><th scope="col">实际分路</th><th scope="col">评分</th>{activeStatFields.map((field) => <th scope="col" key={field}>{STAT_LABELS[field]}</th>)}</tr>
            </thead>
            {visibleSides.map((side) => {
              const sidePlayers = side === "red" ? redPlayers : bluePlayers;
              const totalKills = side === "red" ? redTotalKills : blueTotalKills;
              return <tbody className={`match-result-team match-result-team--${side}`} key={side}>
                <tr className="match-result-team-heading"><th colSpan={tableColumnCount} scope="rowgroup"><span>{side === "red" ? "红方阵容" : "蓝方阵容"}</span><strong>总击杀 {totalKills}</strong></th></tr>
                {sidePlayers.map((player) => {
                  const member = detail.eligibleMembers.find((item) => item.id === player.memberId);
                  const playerLabel = `${side === "red" ? "红方" : "蓝方"} ${player.slot}`;
                  const reviewReasons = manualReviewReasons(recognizedPlayers.find((item) => item.side === player.side && item.slot === player.slot));
                  return <tr key={player.id}>
                    <th className="match-result-sticky" scope="row"><span className="player-slot">{side === "red" ? "红" : "蓝"} {player.slot}</span>{reviewReasons.length > 0 && <small title={reviewReasons.join("；")}>需人工复核</small>}</th>
                    <td className="match-result-member" data-label="成员身份">{canEdit ? <select aria-label={`${playerLabel}成员身份`} value={player.memberId ?? "guest"} onChange={(event) => { const guest = event.target.value === "guest"; updatePlayer(player.id, { memberId: guest ? null : Number(event.target.value), isGuest: guest }); }}><option value="guest">补位 / 游客</option>{detail.eligibleMembers.map((item) => <option value={item.id} key={item.id}>{item.gameNickname || item.username}</option>)}</select> : <span>{player.isGuest ? "补位 / 游客" : member ? member.gameNickname || member.username : "正式成员"}</span>}</td>
                    <td data-label="游戏昵称">{canEdit ? <input aria-label={`${playerLabel}游戏昵称`} value={player.gameNickname} maxLength={32} onChange={(event) => updatePlayer(player.id, { gameNickname: event.target.value })} /> : <strong title={player.gameNickname}>{player.gameNickname || "未命名"}</strong>}</td>
                    <td data-label="英雄">{canEdit ? <input aria-label={`${playerLabel}英雄`} value={player.heroName} maxLength={64} onChange={(event) => updatePlayer(player.id, { heroId: null, heroName: event.target.value })} /> : <span title={player.heroName}>{player.heroName || "—"}</span>}</td>
                    <td data-label="实际分路">{canEdit ? <select aria-label={`${playerLabel}实际分路`} value={player.roleType} onChange={(event) => updatePlayer(player.id, { roleType: event.target.value })}>{MATCH_ROLE_TYPES.map((role) => <option value={role} key={role}>{ROLE_LABELS[role]}</option>)}</select> : <span>{ROLE_LABELS[player.roleType] || player.roleType}</span>}</td>
                    <td className="match-result-number" data-label="评分">{canEdit ? <input aria-label={`${playerLabel}评分`} type="number" min="0" max="100" step="0.1" value={player.score} onChange={(event) => updatePlayer(player.id, { score: event.target.value })} /> : player.score}</td>
                    {activeStatFields.map((field) => <td className="match-result-number" data-label={STAT_LABELS[field]} key={field}>{canEdit ? <input aria-label={`${playerLabel}${STAT_LABELS[field]}`} type="number" min="0" step={field.includes("Rate") ? "0.01" : "1"} value={player.stats[field]} onChange={(event) => updateStat(player.id, field, event.target.value)} /> : player.stats[field]}</td>)}
                  </tr>;
                })}
              </tbody>;
            })}
          </table>
        </div>
      </section>

      {detail.access.canManage && <details className="match-evidence-disclosure" open={canEdit && detail.match.screenshots.length < 6}>
        <summary>
          <span><strong>数据依据</strong><small>比赛截图 {detail.match.screenshots.length}/6 · {localizedStatus(RECOGNITION_LABELS, detail.match.recognition?.status, "未识别")}</small></span>
          <span className="match-evidence-toggle" aria-hidden="true">查看</span>
        </summary>
        <div className="match-evidence-content">
          <div className="match-section-heading"><div className="match-section-copy"><span className="match-section-index">02</span><div><span className="match-section-label">原始凭据</span><h2>截图与识别</h2><p>用于录入、复核和争议追溯，不代替人工确认。</p><p role="status" aria-live="polite">{localizedStatus(RECOGNITION_LABELS, detail.match.recognition?.status, "未识别")}{detail.match.recognition?.attemptCount ? " · 第 " + detail.match.recognition.attemptCount + " 次执行" : ""}</p></div></div><div className="feature-row-actions"><button className="btn-primary feature-action" disabled={!canEdit || Boolean(busy) || recognitionActive || detail.match.screenshots.length !== 6} onClick={recognize}>{busy === "recognize" ? "入队中…" : recognitionActive ? "识别任务处理中" : "开始识别"}</button>{recognitionActive && <button className="btn-subtle" disabled={Boolean(busy)} onClick={cancelRecognitionJob}>{busy === "cancel-recognition" ? "取消中…" : "取消识别"}</button>}</div></div>
          {detail.match.recognition?.errorCode && <p className="feature-note" role="alert">{recognitionFailureMessage(detail.match.recognition.errorCode)}</p>}
          <div className="screenshot-grid">
            {MATCH_SCREENSHOT_TYPES.map((type) => {
              const shot = screenshotByType.get(type);
              return <article className={`screenshot-slot ${shot ? "screenshot-slot--ready" : ""}`} key={type}>
                <div><strong>{SCREEN_LABELS[type]}</strong><span>{shot ? "已上传" : "待上传"}</span></div>
                <p>{shot ? `${shot.originalFilename} · ${(shot.size / 1024 / 1024).toFixed(2)} MB` : "支持 JPG / PNG / WebP"}</p>
                <p role="status">{shot ? localizedStatus(RECOGNITION_LABELS, shot.recognitionStatus, "等待识别") : "尚无文件"}</p>
                {uploadErrors[type] && <p className="feature-note" role="alert">{uploadErrors[type]}。请重新选择该类截图重试。</p>}
                <div className="feature-row-actions">
                  {canEdit && <label className="btn-subtle file-button">{busy === `upload-${type}` ? "上传中…" : shot ? "替换" : "上传"}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={Boolean(busy)} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(type, file); event.currentTarget.value = ""; }} /></label>}
                  {shot && detail.access.isSuperAdmin && <a className="btn-subtle" href={`/api/tournaments/${tournamentId}/matches/${matchId}/screenshots/${type}`} target="_blank" rel="noreferrer">查看原图</a>}
                </div>
              </article>;
            })}
          </div>
        </div>
      </details>}

      {detail.access.canManage && <section className="match-sheet match-finalize" aria-labelledby="submit-title">
        <div className="match-section-copy"><span className="match-section-index">03</span><div><span className="match-section-label">赛果确认</span><h2 id="submit-title">正式提交</h2><p>提交后锁定比分、十人数据与战术标注。</p></div></div>
        <div className="match-score-editor"><label>胜方<select disabled={!canEdit} value={winnerSide} onChange={(event) => { markDraftDirty(); setWinnerSide(event.target.value as "red" | "blue"); }}><option value="red">红方</option><option value="blue">蓝方</option></select></label><strong><span>红</span>{redTotalKills}<b>:</b>{blueTotalKills}<span>蓝</span></strong>{canEdit && <button className="btn-primary" disabled={Boolean(busy) || detail.match.status !== "CONFIRMED"} onClick={() => setSubmitConfirmationOpen(true)}>正式提交并锁定</button>}</div>
      </section>}

      <div className="feature-two-columns match-secondary-grid">
        <section className="match-secondary-section dispute-form"><span className="match-section-label">赛后复核</span><h2>数据异议</h2><p>档案提交后，可指定选手或整场发起核查。</p><label>异议范围<select value={disputePlayerId} onChange={(event) => setDisputePlayerId(event.target.value)}><option value="">整场比赛</option>{players.map((player) => <option value={player.id} key={player.id}>{player.gameNickname}</option>)}</select></label><label>异议说明<textarea rows={4} minLength={5} maxLength={1000} placeholder="说明需要核查的数据与理由" value={disputeMessage} onChange={(event) => setDisputeMessage(event.target.value)} /></label><button className="btn-subtle" disabled={busy === "dispute" || disputeMessage.trim().length < 5 || detail.match.status !== "SUBMITTED"} onClick={dispute}>{busy === "dispute" ? "提交中…" : "提交异议"}</button>{detail.match.disputes.map((item) => <p className="feature-note" key={item.id}>#{item.id} · {item.status} · {item.message}</p>)}</section>
        {ownSide && <section className="match-secondary-section"><span className="match-section-label">队内工具</span><h2>本队战术复盘</h2><p>仅本队成员进入对应战术室；提交前各自标注，提交后队内只读复盘。</p><div className="feature-row-actions"><Link className={`btn-subtle match-team-link match-team-link--${ownSide}`} href={`${routePrefix}/tournaments/${tournamentId}/matches/${matchId}/tactics/${ownSide}`}>进入本队战术室</Link></div></section>}
      </div>

      {detail.access.isSuperAdmin && detail.match.status === "SUBMITTED" && <section className="match-sheet"><div className="match-section-heading"><div className="match-section-copy"><span className="match-section-index">04</span><div><span className="match-section-label">审计操作</span><h2>超管纠错</h2></div></div></div><div className="correction-grid"><label>选手<select value={correction.playerId} onChange={(event) => setCorrection({ ...correction, playerId: event.target.value })}><option value="">选择选手</option>{players.map((player) => <option key={player.id} value={player.id}>{player.gameNickname}</option>)}</select></label><label>字段<select value={correction.field} onChange={(event) => setCorrection({ ...correction, field: event.target.value })}><option value="score">评分</option><option value="gameNickname">昵称</option><option value="heroName">英雄</option><option value="roleType">分路</option>{ALL_STATS.map((field) => <option value={field} key={field}>{STAT_LABELS[field]}</option>)}</select></label><label>新值<input value={correction.value} onChange={(event) => setCorrection({ ...correction, value: event.target.value })} /></label><label>修改原因<input placeholder="至少 5 字" value={correction.reason} onChange={(event) => setCorrection({ ...correction, reason: event.target.value })} /></label><button className="btn-primary" disabled={busy === "correct" || correction.reason.trim().length < 5} onClick={correct}>{busy === "correct" ? "保存中…" : "保存审计纠错"}</button></div></section>}
      <ConfirmDialog open={submitConfirmationOpen} title="正式提交并锁定比赛档案？" description="提交后原图、十人数据和战术标注都会进入只读复盘状态。请确认胜方与比分无误。" confirmLabel="确认提交并锁定" danger={false} busy={busy === "submit"} onClose={() => setSubmitConfirmationOpen(false)} onConfirm={() => void submit()} />
    </main>
  );
}
