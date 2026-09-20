"use client";

import { useState } from "react";
import { cancelRecognition, confirmMatch, correctMatch, createDispute, startRecognition, submitMatchRecord, uploadScreenshot } from "@/features/matches/client/api";
import { participationRateFromPercentage, type MatchScreenshotType, type MatchStatField } from "@/features/matches/model";
import { useToast } from "@/web/components/ui/Toast";
import { ALL_STATS, SCREEN_LABELS, apiMessage, type DetailData, type EditablePlayer } from "./model";

interface MatchActionsOptions {
  tournamentId: string;
  matchId: string;
  detail: DetailData | null;
  players: EditablePlayer[];
  winnerSide: "red" | "blue";
  load: () => Promise<void>;
  clearCurrentDraft: () => void;
  setDraftStatus: (status: string) => void;
}

export function useMatchActions({ tournamentId, matchId, detail, players, winnerSide, load, clearCurrentDraft, setDraftStatus }: MatchActionsOptions) {
  const [busy, setBusy] = useState<string | null>(null);
  const [disputeMessage, setDisputeMessage] = useState("");
  const [disputePlayerId, setDisputePlayerId] = useState("");
  const [correction, setCorrection] = useState({ playerId: "", field: "score", value: "", reason: "" });
  const [submitConfirmationOpen, setSubmitConfirmationOpen] = useState(false);
  const [uploadErrors, setUploadErrors] = useState<Partial<Record<MatchScreenshotType, string>>>({});
  const { success, error } = useToast();

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
      const correctionValue = correction.field === "gameNickname" || correction.field === "heroName" || correction.field === "roleType"
        ? correction.value
        : correction.field === "participationRate"
          ? participationRateFromPercentage(Number(correction.value))
          : Number(correction.value);
      const result = await correctMatch(matchId, {
        matchPlayerId: player.id, field: correction.field,
        value: correctionValue,
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

  return {
    busy, uploadErrors, upload, recognize, cancelRecognitionJob, confirm, submit,
    submitConfirmationOpen, setSubmitConfirmationOpen, dispute, disputeMessage,
    setDisputeMessage, disputePlayerId, setDisputePlayerId, correction, setCorrection, correct,
  };
}
