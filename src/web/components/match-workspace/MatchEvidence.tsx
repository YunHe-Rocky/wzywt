"use client";

import { useMemo } from "react";
import { MATCH_SCREENSHOT_TYPES, type MatchScreenshotType } from "@/features/matches/model";
import { recognitionFailureMessage } from "@/features/matches/recognition-errors";
import { RECOGNITION_LABELS, SCREEN_LABELS, localizedStatus, type DetailData } from "./model";

interface MatchEvidenceProps {
  detail: DetailData;
  tournamentId: string;
  matchId: string;
  canEdit: boolean;
  busy: string | null;
  recognitionActive: boolean;
  uploadErrors: Partial<Record<MatchScreenshotType, string>>;
  upload: (type: MatchScreenshotType, file: File) => Promise<void>;
  recognize: () => Promise<void>;
  cancelRecognitionJob: () => Promise<void>;
}

export function MatchEvidence({ detail, tournamentId, matchId, canEdit, busy, recognitionActive, uploadErrors, upload, recognize, cancelRecognitionJob }: MatchEvidenceProps) {
  const screenshotByType = useMemo(() => new Map(detail.match.screenshots.map((item) => [item.type, item])), [detail]);
  return (
    <details className="match-evidence-disclosure" open={canEdit && detail.match.screenshots.length < 6}>
      <summary>
        <span>
          <strong>数据依据</strong>
          <small>比赛截图 {detail.match.screenshots.length}/6 · {localizedStatus(RECOGNITION_LABELS, detail.match.recognition?.status, "未识别")}</small>
        </span>
        <span className="match-evidence-toggle" aria-hidden="true">查看</span>
      </summary>
      <div className="match-evidence-content">
        <div className="match-section-heading">
          <div className="match-section-copy">
            <span className="match-section-index">02</span>
            <div>
              <span className="match-section-label">原始凭据</span>
              <h2>截图与识别</h2>
              <p>用于录入、复核和争议追溯，不代替人工确认。</p>
              <p role="status" aria-live="polite">{localizedStatus(RECOGNITION_LABELS, detail.match.recognition?.status, "未识别")}{detail.match.recognition?.attemptCount ? " · 第 " + detail.match.recognition.attemptCount + " 次执行" : ""}</p>
            </div>
          </div>
          <div className="feature-row-actions">
            <button
              className="btn-primary feature-action"
              disabled={!canEdit || Boolean(busy) || recognitionActive || detail.match.screenshots.length !== 6}
              onClick={recognize}
            >{busy === "recognize" ? "入队中…" : recognitionActive ? "识别任务处理中" : "开始识别"}</button>{recognitionActive && <button className="btn-subtle" disabled={Boolean(busy)} onClick={cancelRecognitionJob}>{busy === "cancel-recognition" ? "取消中…" : "取消识别"}</button>}</div>
        </div>
        {detail.match.recognition?.errorCode && <p className="feature-note" role="alert">{recognitionFailureMessage(detail.match.recognition.errorCode)}</p>}
        <div className="screenshot-grid">
          {MATCH_SCREENSHOT_TYPES.map((type) => {
            const shot = screenshotByType.get(type);
            return <article className={`screenshot-slot ${shot ? "screenshot-slot--ready" : ""}`} key={type}>
              <div>
                <strong>{SCREEN_LABELS[type]}</strong>
                <span>{shot ? "已上传" : "待上传"}</span>
              </div>
              <p>{shot ? `${shot.originalFilename} · ${(shot.size / 1024 / 1024).toFixed(2)} MB` : "支持 JPG / PNG / WebP"}</p>
              <p role="status">{shot ? localizedStatus(RECOGNITION_LABELS, shot.recognitionStatus, "等待识别") : "尚无文件"}</p>
              {uploadErrors[type] && <p className="feature-note" role="alert">{uploadErrors[type]}。请重新选择该类截图重试。</p>}
              <div className="feature-row-actions">
                {canEdit && <label className="btn-subtle file-button">{busy === `upload-${type}` ? "上传中…" : shot ? "替换" : "上传"}<input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={Boolean(busy)}
                  onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(type, file); event.currentTarget.value = ""; }}
                />
                </label>}
                {shot && detail.access.isSuperAdmin && <a className="btn-subtle" href={`/api/tournaments/${tournamentId}/matches/${matchId}/screenshots/${type}`} target="_blank" rel="noreferrer">查看原图</a>}
              </div>
            </article>;
          })}
        </div>
      </div>
    </details>

  );
}
