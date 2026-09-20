"use client";

import "@/web/styles/yanwu-workspaces.css";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useState } from "react";
import type { MatchScreenshotType } from "@/features/matches/model";
import { ConfirmDialog } from "@/web/components/ui/ConfirmDialog";
import { MatchWorkflowProgress } from "@/web/components/match/MatchWorkflowProgress";
import { MatchCorrectionForm } from "@/web/components/match-workspace/MatchCorrectionForm";
import { MatchDisputeForm } from "@/web/components/match-workspace/MatchDisputeForm";
import { MatchEvidence } from "@/web/components/match-workspace/MatchEvidence";
import { MatchFinalize } from "@/web/components/match-workspace/MatchFinalize";
import { MatchRecordHeader } from "@/web/components/match-workspace/MatchRecordHeader";
import { MatchStatsSheet } from "@/web/components/match-workspace/MatchStatsSheet";
import { useMatchActions } from "@/web/components/match-workspace/useMatchActions";
import { useMatchDraft } from "@/web/components/match-workspace/useMatchDraft";

export function MatchWorkspace() {
  const params = useParams<{ id: string; matchId: string; }>();
  const routePrefix = usePathname().startsWith("/m/") ? "/m" : "";
  const tournamentId = params.id;
  const matchId = params.matchId;
  const [activeType, setActiveType] = useState<MatchScreenshotType>("DATA");
  const {
    detail, loadError, load, players, winnerSide, updateWinnerSide, canEdit,
    draftStatus, setDraftStatus, clearCurrentDraft, updatePlayer, updateStat, recognitionActive,
  } = useMatchDraft(tournamentId, matchId);
  const {
    busy, uploadErrors, upload, recognize, cancelRecognitionJob, confirm, submit,
    submitConfirmationOpen, setSubmitConfirmationOpen, dispute, disputeMessage,
    setDisputeMessage, disputePlayerId, setDisputePlayerId, correction, setCorrection, correct,
  } = useMatchActions({ tournamentId, matchId, detail, players, winnerSide, load, clearCurrentDraft, setDraftStatus });

  if (!detail) return <main className="page-shell page-shell--wide">
    <div className="feature-empty" role={loadError ? "alert" : "status"}>{loadError || "正在读取比赛档案…"}{loadError && <div className="feature-row-actions">
      <Link className="btn-subtle" href={`${routePrefix}/tournaments/${tournamentId}`}>返回房间</Link>
      <button className="btn-subtle" onClick={() => void load()}>重试</button>
    </div>}</div>
  </main>;
  const redPlayers = players.filter((player) => player.side === "red");
  const bluePlayers = players.filter((player) => player.side === "blue");
  const redTotalKills = canEdit ? redPlayers.reduce((sum, player) => sum + Number(player.stats.kills), 0) : detail.match.redTotalKills ?? 0;
  const blueTotalKills = canEdit ? bluePlayers.reduce((sum, player) => sum + Number(player.stats.kills), 0) : detail.match.blueTotalKills ?? 0;
  const ownSide = detail.access.ownSide ?? players.find(p => p.memberId === detail.access.currentUserId)?.side ?? null;
  const visibleSides = detail.access.canManage ? ["red", "blue"] as const : ownSide ? [ownSide] : [];

  return (
    <main className="page-shell page-shell--wide match-workspace">
      <MatchRecordHeader
        match={detail.match}
        matchId={matchId}
        roomHref={`${routePrefix}/tournaments/${tournamentId}`}
        redTotalKills={redTotalKills}
        blueTotalKills={blueTotalKills}
      />
      {detail.access.canManage && <MatchWorkflowProgress
        status={detail.match.status}
        screenshotCount={detail.match.screenshots.length}
        recognitionStatus={detail.match.recognition?.status}
      />}
      {draftStatus && <p className="feature-note match-draft-note" role="status" aria-live="polite">{draftStatus}</p>}
      <MatchStatsSheet
        detail={detail}
        players={players}
        canEdit={canEdit}
        busy={busy}
        visibleSides={visibleSides}
        redTotalKills={redTotalKills}
        blueTotalKills={blueTotalKills}
        confirm={confirm}
        updatePlayer={updatePlayer}
        updateStat={updateStat}
        activeType={activeType}
        setActiveType={setActiveType}
      />
      {detail.access.canManage && <MatchEvidence
        detail={detail}
        tournamentId={tournamentId}
        matchId={matchId}
        canEdit={canEdit}
        busy={busy}
        recognitionActive={recognitionActive}
        uploadErrors={uploadErrors}
        upload={upload}
        recognize={recognize}
        cancelRecognitionJob={cancelRecognitionJob}
      />}
      {detail.access.canManage && <MatchFinalize
        status={detail.match.status}
        canEdit={canEdit}
        busy={busy}
        winnerSide={winnerSide}
        redTotalKills={redTotalKills}
        blueTotalKills={blueTotalKills}
        updateWinnerSide={updateWinnerSide}
        requestSubmit={() => setSubmitConfirmationOpen(true)}
      />}
      <div className="feature-two-columns match-secondary-grid">
        <MatchDisputeForm
          players={players}
          disputes={detail.match.disputes}
          status={detail.match.status}
          busy={busy}
          disputePlayerId={disputePlayerId}
          disputeMessage={disputeMessage}
          setDisputePlayerId={setDisputePlayerId}
          setDisputeMessage={setDisputeMessage}
          dispute={dispute}
        />
        {ownSide && <section className="match-secondary-section">
          <span className="match-section-label">队内工具</span>
          <h2>本队战术复盘</h2>
          <p>仅本队成员进入对应战术室；提交前各自标注，提交后队内只读复盘。</p>
          <div className="feature-row-actions">
            <Link
              className={`btn-subtle match-team-link match-team-link--${ownSide}`}
              href={`${routePrefix}/tournaments/${tournamentId}/matches/${matchId}/tactics/${ownSide}`}
            >进入本队战术室</Link>
          </div>
        </section>}
      </div>

      {detail.access.isSuperAdmin && detail.match.status === "SUBMITTED" && <MatchCorrectionForm players={players} busy={busy} correction={correction} setCorrection={setCorrection} correct={correct} />}
      <ConfirmDialog
        open={submitConfirmationOpen}
        title="正式提交并锁定比赛档案？"
        description="提交后原图、十人数据和战术标注都会进入只读复盘状态。请确认胜方与比分无误。"
        confirmLabel="确认提交并锁定"
        danger={false}
        busy={busy === "submit"}
        onClose={() => setSubmitConfirmationOpen(false)}
        onConfirm={() => void submit()}
      />
    </main>
  );
}
