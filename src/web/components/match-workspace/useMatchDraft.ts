"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getMatch } from "@/features/matches/client/api";
import type { MatchStatField } from "@/features/matches/model";
import { clearMatchDraft, matchDraftVersion, readMatchDraft, shouldPreserveActiveMatchDraft, writeMatchDraft, type MatchDraftIdentity } from "@/web/match-draft-storage";
import { apiMessage, emptyStats, isEditablePlayer, mergeRecognitionPlayers, normalizeEditablePlayerParticipationRates, type DetailData, type EditablePlayer } from "./model";

export function useMatchDraft(tournamentId: string, matchId: string) {
  const [detail, setDetail] = useState<DetailData | null>(null);
  const [loadError, setLoadError] = useState("");
  const [players, setPlayers] = useState<EditablePlayer[]>([]);
  const [winnerSide, setWinnerSide] = useState<"red" | "blue">("red");
  const [draftStatus, setDraftStatus] = useState("");
  const dirtyRef = useRef(false);
  const restoredDraftRef = useRef(false);
  const draftVersionRef = useRef<string | null>(null);
  const playersRef = useRef<EditablePlayer[]>([]);
  const winnerSideRef = useRef<"red" | "blue">("red");
  const loadGeneration = useRef(0);
  const loadController = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    const generation = ++loadGeneration.current;
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    setLoadError("");
    try {
      const result = await getMatch<DetailData>(tournamentId, matchId, controller.signal);
      if (controller.signal.aborted || generation !== loadGeneration.current) return;
      if (!result.ok) { setDetail(null); setPlayers([]); setLoadError(apiMessage(result.data, "比赛档案加载失败，请确认登录状态后重试")); return; }
      setDetail(result.data);
      const persistedPlayerIds = new Set(result.data.match.players.filter((player) => player.stats !== null).map((player) => player.id));
      const loadedPlayers = mergeRecognitionPlayers(result.data.match.players.map((player) => ({
        ...player,
        heroName: player.heroName || "",
        score: player.score ?? 0,
        statsUpdatedAt: player.stats?.updatedAt || null,
        stats: { ...emptyStats(), ...(player.stats || {}) },
      })), result.data.match.recognition?.normalizedResult, persistedPlayerIds);
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
          setPlayers(normalizeEditablePlayerParticipationRates(saved.players));
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
      if (controller.signal.aborted || generation !== loadGeneration.current) return;
      setDetail(null); setPlayers([]); setLoadError(cause instanceof Error ? cause.message : "比赛档案加载失败，请检查网络后重试");
    }
  }, [matchId, tournamentId]);

  useEffect(() => {
    void load();
    return () => { loadController.current?.abort(); };
  }, [load]);
  const recognitionActive = ["QUEUED", "RUNNING"].includes(detail?.match.recognition?.status || "");
  useEffect(() => {
    if (!recognitionActive) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (stopped) return;
      if (document.visibilityState !== "hidden") await load();
      if (!stopped) timer = setTimeout(() => void poll(), 2_000);
    };
    timer = setTimeout(() => void poll(), 2_000);
    return () => { stopped = true; clearTimeout(timer); };
  }, [load, recognitionActive]);
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

  function updateWinnerSide(side: "red" | "blue") {
    markDraftDirty();
    setWinnerSide(side);
  }

  return {
    detail, loadError, load, players, winnerSide, updateWinnerSide, canEdit,
    draftStatus, setDraftStatus, clearCurrentDraft, updatePlayer, updateStat, recognitionActive,
  };
}
