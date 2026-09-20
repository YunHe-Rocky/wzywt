"use client";

import { type KeyboardEvent, useMemo } from "react";
import { MATCH_SCREENSHOT_TYPES, STAT_FIELDS_BY_SCREENSHOT, type MatchScreenshotType, type MatchStatField } from "@/features/matches/model";
import { SCREEN_LABELS, STAT_LABELS, recognitionPlayers, type DetailData, type EditablePlayer } from "./model";

import { MatchPlayerRow } from "./MatchPlayerRow";

interface MatchStatsSheetProps {
  detail: DetailData;
  players: EditablePlayer[];
  canEdit: boolean;
  busy: string | null;
  visibleSides: readonly ("red" | "blue")[];
  redTotalKills: number;
  blueTotalKills: number;
  confirm: () => Promise<void>;
  updatePlayer: (id: number, update: Partial<EditablePlayer>) => void;
  updateStat: (id: number, field: MatchStatField, value: string) => void;
  activeType: MatchScreenshotType;
  setActiveType: (type: MatchScreenshotType) => void;
}

export function MatchStatsSheet({ detail, players, canEdit, busy, visibleSides, redTotalKills, blueTotalKills, confirm, updatePlayer, updateStat, activeType, setActiveType }: MatchStatsSheetProps) {
  const recognizedPlayers = useMemo(() => recognitionPlayers(detail.match.recognition?.normalizedResult), [detail]);
  const activeStatFields = STAT_FIELDS_BY_SCREENSHOT[activeType];
  const tableColumnCount = 6 + activeStatFields.length;
  const redPlayers = players.filter((player) => player.side === "red");
  const bluePlayers = players.filter((player) => player.side === "blue");

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

  return (
    <section className="match-sheet" aria-labelledby="confirm-title">
      <div className="match-section-heading">
        <div className="match-section-copy">
          <span className="match-section-index">01</span>
          <div>
            <span className="match-section-label">比赛数据</span>
            <h2 id="confirm-title">{detail.access.canManage ? "十人数据复核" : "本队比赛数据"}</h2>
            <p>{detail.access.canManage ? "识别结果仅作录入辅助，成员身份与比赛数据仍需人工确认。" : "仅展示自己所在队伍已正式提交的比赛记录。"}</p>
          </div>
        </div>
        {canEdit && <button className="btn-primary feature-action" disabled={Boolean(busy)} onClick={confirm}>{busy === "confirm" ? "保存中…" : "保存复核结果"}</button>}
      </div>
      <div className="data-tabs" role="tablist" aria-label="数据分类">{MATCH_SCREENSHOT_TYPES.map((type) => <button
        id={`match-data-tab-${type}`}
        key={type}
        role="tab"
        tabIndex={activeType === type ? 0 : -1}
        aria-selected={activeType === type}
        aria-controls="match-data-panel"
        onKeyDown={(event) => moveDataTab(event, type)}
        onClick={() => setActiveType(type)}
      >{SCREEN_LABELS[type]}</button>)}</div>
      <p className="match-result-table-hint" id="match-result-table-hint">{detail.access.canManage ? "桌面端按双方对照；" : "当前为本队数据；"}窄屏会自动排成逐选手记录，无需横向滑动。</p>
      <div
        id="match-data-panel"
        className="match-result-table-wrap"
        tabIndex={0}
        role="tabpanel"
        aria-labelledby={`match-data-tab-${activeType}`}
        aria-describedby="match-result-table-hint"
      >
        <table className="match-result-table">
          <caption>{detail.access.canManage ? "十人比赛数据复核表" : "本队比赛数据表"}，当前数据分类：{SCREEN_LABELS[activeType]}</caption>
          <thead>
            <tr>
              <th scope="col">阵营 / 位置</th>
              <th scope="col">成员身份</th>
              <th scope="col">游戏昵称</th>
              <th scope="col">英雄</th>
              <th scope="col">实际分路</th>
              <th scope="col">评分</th>{activeStatFields.map((field) => <th scope="col" key={field}>{STAT_LABELS[field]}</th>)}</tr>
          </thead>
          {visibleSides.map((side) => {
            const sidePlayers = side === "red" ? redPlayers : bluePlayers;
            const totalKills = side === "red" ? redTotalKills : blueTotalKills;
            return <tbody className={`match-result-team match-result-team--${side}`} key={side}>
              <tr className="match-result-team-heading">
                <th colSpan={tableColumnCount} scope="rowgroup">
                  <span>{side === "red" ? "红方阵容" : "蓝方阵容"}</span>
                  <strong>总击杀 {totalKills}</strong>
                </th>
              </tr>
              {sidePlayers.map((player) => (
                <MatchPlayerRow
                  key={player.id} player={player} eligibleMembers={detail.eligibleMembers}
                  recognizedPlayer={recognizedPlayers.find((item) => item.side === player.side && item.slot === player.slot)}
                  activeStatFields={activeStatFields} canEdit={canEdit}
                  updatePlayer={updatePlayer} updateStat={updateStat}
                />
              ))}
            </tbody>;
          })}
        </table>
      </div>
    </section>

  );
}
