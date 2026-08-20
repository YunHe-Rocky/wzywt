"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { PointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createLayer, createMarker, deleteLayer, deleteMarker, deleteRoute, getTactics, saveRoute, updateLayer } from "@/features/tactics/client/api";
import { type TacticColorKey, type TacticPoint } from "@/features/tactics/model";
import {
  TACTIC_CLOCK_MAX_SECONDS,
  type TacticClearRecords,
  formatTacticTime,
  getTacticTimeline,
  parseTacticTime,
  tacticResourceStateLabel,
} from "@/features/tactics/timeline";
import { useToast } from "@/web/components/ui/Toast";

interface RouteItem { id: number; ownerMemberId: number; colorKey: TacticColorKey; geometry: { version: 1; points: TacticPoint[]; arrow: boolean }; revision: number; canEdit: boolean; ownerMember: { username: string } }
interface MarkerItem { id: number; ownerMemberId: number; type: "POINT" | "TEXT"; x: number; y: number; text: string | null; revision: number; canEdit: boolean; ownerMember: { username: string } }
interface LayerItem { id: number; name: string; description: string | null; startTime: number | null; endTime: number | null; updatedAt: string; routes: RouteItem[]; markers: MarkerItem[] }
interface RoomData { room: { id: number; side: "red" | "blue"; layers: LayerItem[] }; access: { userId: number; canManageLayers: boolean; canDraw: boolean; ownColorKey: TacticColorKey | null; sharedAnnotationsVisible: boolean } }
type ToolMode = "route" | "point" | "text";
// colorKey remains a stable member-slot identity; the room faction supplies its visual palette.
const COLOR: Record<TacticColorKey, string> = { crimson: "var(--tactic-member-1)", azure: "var(--tactic-member-2)", amber: "var(--tactic-member-3)", jade: "var(--tactic-member-4)", violet: "var(--tactic-member-5)" };
const BOARD_WIDTH = 1500;
const BOARD_HEIGHT = 870;
const CLOCK_PRESETS = [30, 120, 600, 1200] as const;

function apiMessage(data: unknown, fallback: string) { return typeof data === "object" && data !== null && "error" in data && typeof data.error === "string" ? data.error : fallback; }
function secondsLabel(value: number | null) { return value === null ? "未设时间" : formatTacticTime(value); }
function layerContainsTime(layer: LayerItem, clock: number) { return (layer.startTime === null || layer.startTime <= clock) && (layer.endTime === null || layer.endTime >= clock); }

export function TacticBoard() {
  const params = useParams<{ id: string; matchId: string; side: string }>();
  const routePrefix = usePathname().startsWith("/m/") ? "/m" : "";
  const { id: tournamentId, matchId, side } = params;
  const svgRef = useRef<SVGSVGElement>(null);
  const activePointerRef = useRef<number | null>(null);
  const draftRef = useRef<TacticPoint[]>([]);
  const [data, setData] = useState<RoomData | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [followClock, setFollowClock] = useState(true);
  const [clockSeconds, setClockSeconds] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [clearRecords, setClearRecords] = useState<TacticClearRecords>({});
  const [mode, setMode] = useState<ToolMode>("route");
  const [draft, setDraft] = useState<TacticPoint[]>([]);
  const [history, setHistory] = useState<TacticPoint[][]>([]);
  const [future, setFuture] = useState<TacticPoint[][]>([]);
  const [markerText, setMarkerText] = useState("");
  const [coordinate, setCoordinate] = useState({ x: "0.5", y: "0.5" });
  const [layerName, setLayerName] = useState("");
  const [layerStart, setLayerStart] = useState("");
  const [layerEnd, setLayerEnd] = useState("");
  const [busy, setBusy] = useState(false);
  const { success, error } = useToast();

  const load = useCallback(async () => {
    const result = await getTactics<RoomData>(tournamentId, matchId, side);
    if (!result.ok) return error(apiMessage(result.data, "战术室加载失败或无权访问"));
    setData(result.data);
    setActiveIndex((index) => Math.min(index, Math.max(0, result.data.room.layers.length - 1)));
  }, [error, matchId, side, tournamentId]);
  useEffect(() => { void load(); }, [load]);

  const layers = useMemo(() => data?.room.layers || [], [data?.room.layers]);
  const activeLayer = layers[activeIndex] || null;
  const visibleLayers = useMemo(() => layers.map((layer, index) => ({ layer, index })).filter(({ index }) => Math.abs(index - activeIndex) <= 1), [activeIndex, layers]);
  const ownRoute = data?.access.canDraw ? activeLayer?.routes.find((route) => route.canEdit) : undefined;
  const timeline = useMemo(() => getTacticTimeline(clockSeconds, clearRecords), [clockSeconds, clearRecords]);
  const quickResources = useMemo(() => timeline.filter(({ id }) => ["lane", "buff", "jungle", "tyrant", "overlord", "tempest"].includes(id)), [timeline]);
  const timerStorageKey = `tactic-timers:${matchId}:${side}`;

  useEffect(() => {
    try { const saved = window.localStorage.getItem(timerStorageKey); if (saved) setClearRecords(JSON.parse(saved) as TacticClearRecords); }
    catch { setClearRecords({}); }
  }, [timerStorageKey]);
  useEffect(() => {
    try { window.localStorage.setItem(timerStorageKey, JSON.stringify(clearRecords)); }
    catch { /* 本地存储不可用时，当前推演仍可继续。 */ }
  }, [clearRecords, timerStorageKey]);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setClockSeconds((current) => current >= TACTIC_CLOCK_MAX_SECONDS ? 0 : current + 1), 1000);
    return () => window.clearInterval(timer);
  }, [playing]);
  useEffect(() => {
    if (!followClock || layers.length === 0) return;
    const matching = layers.map((layer, index) => ({ layer, index })).filter(({ layer }) => layerContainsTime(layer, clockSeconds));
    if (matching.length === 0) return;
    matching.sort((a, b) => (b.layer.startTime ?? -1) - (a.layer.startTime ?? -1));
    setActiveIndex(matching[0].index);
  }, [clockSeconds, followClock, layers]);

  useEffect(() => {
    const points = ownRoute?.geometry.points || [];
    draftRef.current = points; setDraft(points); setHistory([]); setFuture([]);
  }, [ownRoute]);
  useEffect(() => {
    setLayerStart(activeLayer?.startTime === null || activeLayer?.startTime === undefined ? "" : formatTacticTime(activeLayer.startTime));
    setLayerEnd(activeLayer?.endTime === null || activeLayer?.endTime === undefined ? "" : formatTacticTime(activeLayer.endTime));
  }, [activeLayer?.id, activeLayer?.startTime, activeLayer?.endTime]);

  function replaceDraft(next: TacticPoint[]) { draftRef.current = next; setDraft(next); }
  function pushDraft(next: TacticPoint[]) { setHistory((items) => [...items.slice(-49), draftRef.current]); replaceDraft(next); setFuture([]); }
  function undo() {
    const previous = history.at(-1);
    if (!previous) return;
    setFuture((items) => [draftRef.current, ...items]);
    replaceDraft(previous);
    setHistory((items) => items.slice(0, -1));
  }
  function redo() {
    const next = future[0];
    if (!next) return;
    setHistory((items) => [...items, draftRef.current]);
    replaceDraft(next);
    setFuture((items) => items.slice(1));
  }
  function normalizedPoint(clientX: number, clientY: number, board: SVGSVGElement): TacticPoint {
    const bounds = board.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width)), y: Math.max(0, Math.min(1, (clientY - bounds.top) / bounds.height)) };
  }
  function appendPointerSamples(event: PointerEvent<SVGSVGElement>) {
    const coalescedSamples = event.nativeEvent.getCoalescedEvents?.();
    const nativeSamples = coalescedSamples && coalescedSamples.length > 0 ? coalescedSamples : [event.nativeEvent];
    const next = [...draftRef.current];
    for (const sample of nativeSamples) {
      const point = normalizedPoint(sample.clientX, sample.clientY, event.currentTarget);
      const previous = next.at(-1);
      if (previous && Math.hypot(point.x - previous.x, point.y - previous.y) < 0.004) continue;
      if (next.length < 64) next.push(point);
      else next[next.length - 1] = point;
    }
    if (next.length !== draftRef.current.length || next.at(-1) !== draftRef.current.at(-1)) replaceDraft(next);
  }
  function boardPointerDown(event: PointerEvent<SVGSVGElement>) {
    if (!data?.access.canDraw || !activeLayer || busy || (event.pointerType === "mouse" && event.button !== 0)) return;
    event.preventDefault();
    const point = normalizedPoint(event.clientX, event.clientY, event.currentTarget);
    if (mode !== "route") {
      void addMarkerAt(point);
      return;
    }
    activePointerRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    setHistory((items) => [...items.slice(-49), draftRef.current]);
    setFuture([]);
    replaceDraft([point]);
  }
  function boardPointerMove(event: PointerEvent<SVGSVGElement>) {
    if (activePointerRef.current !== event.pointerId || mode !== "route") return;
    event.preventDefault();
    appendPointerSamples(event);
  }
  function finishRoutePointer(event: PointerEvent<SVGSVGElement>) {
    if (activePointerRef.current !== event.pointerId) return;
    appendPointerSamples(event);
    activePointerRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  async function addMarkerAt(point: TacticPoint) {
    if (!activeLayer) return;
    if (mode === "text" && !markerText.trim()) return error("先输入文字点位内容");
    setBusy(true);
    const result = await createMarker(tournamentId, matchId, side, activeLayer.id, { type: mode === "text" ? "TEXT" : "POINT", x: point.x, y: point.y, text: mode === "text" ? markerText.trim() : null });
    setBusy(false);
    if (!result.ok) return error(apiMessage(result.data, "点位保存失败"));
    success("点位已保存"); await load();
  }
  async function addAccessiblePoint() {
    const point = { x: Number(coordinate.x), y: Number(coordinate.y) };
    if (![point.x, point.y].every((value) => Number.isFinite(value) && value >= 0 && value <= 1)) return error("坐标必须在 0 到 1 之间");
    if (mode === "route") pushDraft([...draft, point].slice(-64)); else await addMarkerAt(point);
  }
  async function saveCurrentRoute() {
    if (!activeLayer || draft.length < 2) return error("路线至少需要两个点");
    setBusy(true);
    const input: { geometry: { version: 1; points: TacticPoint[]; arrow: boolean }; expectedRevision?: number } = { geometry: { version: 1, points: draft, arrow: true } };
    if (ownRoute) input.expectedRevision = ownRoute.revision;
    const result = await saveRoute(tournamentId, matchId, side, activeLayer.id, input); setBusy(false);
    if (!result.ok) return error(apiMessage(result.data, "路线保存失败")); success("路线已保存"); await load();
  }
  async function removeOwnRoute() {
    if (!ownRoute) return;
    const result = await deleteRoute(tournamentId, matchId, side, ownRoute.id, ownRoute.revision);
    if (!result.ok) return error(apiMessage(result.data, "路线删除失败")); success("路线已删除"); await load();
  }
  function parseLayerRange() {
    const startTime = parseTacticTime(layerStart);
    const endTime = parseTacticTime(layerEnd);
    if ((layerStart.trim() && startTime === null) || (layerEnd.trim() && endTime === null)) { error("时间格式应为 mm:ss，例如 2:00"); return null; }
    if (startTime !== null && endTime !== null && endTime < startTime) { error("图层结束时间不能早于开始时间"); return null; }
    return { startTime, endTime };
  }
  async function addLayer() {
    if (!layerName.trim()) return;
    const range = parseLayerRange(); if (!range) return;
    setBusy(true); const result = await createLayer(tournamentId, matchId, side, { name: layerName.trim(), description: null, ...range }); setBusy(false);
    if (!result.ok) return error(apiMessage(result.data, "图层创建失败")); setLayerName(""); success("图层已创建"); await load(); setActiveIndex(layers.length);
  }
  async function saveLayerRange() {
    if (!activeLayer) return;
    const range = parseLayerRange(); if (!range) return;
    setBusy(true); const result = await updateLayer(tournamentId, matchId, side, activeLayer.id, { name: activeLayer.name, description: activeLayer.description, expectedUpdatedAt: activeLayer.updatedAt, ...range }); setBusy(false);
    if (!result.ok) return error(apiMessage(result.data, "图层时间保存失败")); success("图层时间已保存"); await load();
  }
  async function removeLayer() {
    if (!activeLayer) return;
    const result = await deleteLayer(tournamentId, matchId, side, activeLayer.id, activeLayer.updatedAt);
    if (!result.ok) return error(apiMessage(result.data, "图层删除失败")); success("图层已删除"); await load();
  }
  async function removeMarker(item: MarkerItem) {
    const result = await deleteMarker(tournamentId, matchId, side, item.id, item.revision);
    if (!result.ok) return error(apiMessage(result.data, "点位删除失败")); await load();
  }
  function recordClear(resourceId: keyof TacticClearRecords) { setClearRecords((current) => ({ ...current, [resourceId]: clockSeconds })); }

  if (!data) return <main className="tactic-shell"><div className="feature-empty">正在验证战术室权限…</div></main>;
  return <main className={`tactic-shell tactic-shell--${side}`}>
    <header className="tactic-header"><div><nav className="feature-breadcrumb"><Link href={`${routePrefix}/tournaments/${tournamentId}/matches/${matchId}`}>比赛档案 #{matchId}</Link><span>/</span><span>{side === "red" ? "红方" : "蓝方"}战术室</span></nav><h1>{side === "red" ? "红方" : "蓝方"}战术推演</h1><p>一个比赛时钟同时驱动时间图层、兵线、野区和远古生物。</p></div><span className="feature-status">{data.access.sharedAnnotationsVisible ? "REVIEW OPEN" : "TEAM PRIVATE"}</span></header>
    <div className="tactic-privacy-notice" data-open={data.access.sharedAnnotationsVisible} role="status"><strong>{data.access.sharedAnnotationsVisible ? "复盘已公开" : "独立标注中"}</strong><span>{data.access.sharedAnnotationsVisible ? "房主已正式提交比赛数据，现在可以查看队友标注；战术板已锁定为只读。" : "当前只显示你的路线与点位，房主也无法查看。房主正式提交比赛数据后，全队标注才会公开。"}</span></div>
    <section className="tactic-clock-panel" aria-label="比赛时间轴">
      <div className="tactic-clock-control">
        <button className="tactic-play" aria-label={playing ? "暂停比赛时钟" : "播放比赛时钟"} onClick={() => setPlaying((value) => !value)}>{playing ? "暂停" : "播放"}</button>
        <div className="tactic-clock-readout"><span>比赛时间</span><strong>{formatTacticTime(clockSeconds)}</strong></div>
        <input aria-label="比赛时间" type="range" min="0" max={TACTIC_CLOCK_MAX_SECONDS} step="1" value={clockSeconds} onChange={(event) => setClockSeconds(Number(event.target.value))} />
        <div className="tactic-clock-presets">{CLOCK_PRESETS.map((value) => <button key={value} onClick={() => setClockSeconds(value)}>{formatTacticTime(value)}</button>)}</div>
      </div>
      <div className="tactic-resource-strip" aria-label="当前资源节奏">{quickResources.map((item) => <div key={item.id} data-state={item.state}><span>{item.name}</span><strong>{tacticResourceStateLabel(item, clockSeconds)}</strong></div>)}</div>
      <details className="tactic-resource-details"><summary>记录击杀与查看完整刷新表</summary><div className="tactic-resource-table-wrap"><table className="tactic-resource-table"><thead><tr><th>资源</th><th>首刷</th><th>刷新规则</th><th>当前 / 下一次</th><th>本地推演</th></tr></thead><tbody>{timeline.map((item) => <tr key={item.id} data-state={item.state}><th>{item.name}</th><td>{formatTacticTime(item.firstSpawnAt)}</td><td>{item.id === "lane" ? `每 ${item.respawnSeconds}s` : `击杀后 ${item.respawnSeconds}s`}</td><td>{tacticResourceStateLabel(item, clockSeconds)}</td><td>{item.id === "lane" ? "自动计算" : <button disabled={item.state === "pending" || item.state === "retired"} onClick={() => recordClear(item.id)}>记为此刻击杀</button>}</td></tr>)}</tbody></table></div><p className="tactic-rule-note">龙与野怪从实际击杀时刻计算再次刷新。</p></details>
    </section>
    <section className="tactic-stage-panel tactic-stage-panel--focused">
        <div className="tactic-stage-switcher" aria-label="战术阶段"><div className="tactic-layer-list">{layers.map((layer, index) => <button key={layer.id} aria-current={index === activeIndex} onClick={() => { setFollowClock(false); setActiveIndex(index); }}><strong>{layer.name}</strong><small>{secondsLabel(layer.startTime)}{layer.endTime === null ? "" : ` – ${secondsLabel(layer.endTime)}`}</small></button>)}</div><button className="tactic-follow" aria-pressed={followClock} onClick={() => setFollowClock((value) => !value)}>{followClock ? "跟随时间" : "手动阶段"}</button></div>
        <div className="tactic-toolbar" aria-label="绘制工具">
          {(["route", "point", "text"] as ToolMode[]).map((tool) => <button key={tool} disabled={!data.access.canDraw} aria-pressed={mode === tool} onClick={() => setMode(tool)}>{tool === "route" ? "拖动路线" : tool === "point" ? "添加点位" : "添加文字"}</button>)}
          {mode === "text" && <input className="tactic-inline-text" aria-label="地图文字" disabled={!data.access.canDraw} value={markerText} maxLength={120} placeholder="输入文字后点地图" onChange={(event) => setMarkerText(event.target.value)} />}
          <span className="tactic-toolbar-spacer" />
          <button disabled={!data.access.canDraw || history.length === 0} onClick={undo}>撤销</button><button disabled={!data.access.canDraw || future.length === 0} onClick={redo}>重做</button><button className="toolbar-primary" disabled={!data.access.canDraw || busy || draft.length < 2} onClick={saveCurrentRoute}>保存路线</button>
        </div>
        {!activeLayer ? <div className="feature-empty">房主需要先创建一个战术图层。</div> : <div className="tactic-board-wrap">
          <svg ref={svgRef} className="tactic-board" data-readonly={!data.access.canDraw} viewBox={`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`} role="img" aria-label={data.access.canDraw ? "王者峡谷战术板，按住并拖动绘制路线，点击添加点位" : "王者峡谷战术复盘，只读查看已公开标注"} onPointerDown={boardPointerDown} onPointerMove={boardPointerMove} onPointerUp={finishRoutePointer} onPointerCancel={finishRoutePointer}>
            <image href="/images/tactic-map-source.jpg" x="-350" y="-90" width="2048" height="963" />
            <rect width={BOARD_WIDTH} height={BOARD_HEIGHT} fill="rgba(2, 12, 18, .08)" pointerEvents="none" />
            <defs><marker id="tactic-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="context-stroke" /></marker></defs>
            {visibleLayers.map(({ layer, index }) => <g key={layer.id} opacity={index === activeIndex ? 1 : 0.22} pointerEvents={index === activeIndex ? "auto" : "none"}>
              {layer.routes.filter((route) => !(index === activeIndex && route.canEdit)).map((route) => <polyline key={route.id} points={route.geometry.points.map((point) => `${point.x * BOARD_WIDTH},${point.y * BOARD_HEIGHT}`).join(" ")} fill="none" stroke={COLOR[route.colorKey]} strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" markerEnd={route.geometry.arrow ? "url(#tactic-arrow)" : undefined} />)}
              {layer.markers.map((marker) => { const key = layer.routes.find((route) => route.ownerMemberId === marker.ownerMemberId)?.colorKey || "crimson"; return <g key={marker.id} transform={`translate(${marker.x * BOARD_WIDTH} ${marker.y * BOARD_HEIGHT})`}><circle r="18" fill={COLOR[key]} stroke="var(--bg-root)" strokeWidth="5" />{marker.type === "TEXT" && <text x="28" y="7" className="tactic-marker-text">{marker.text}</text>}</g>; })}
            </g>)}
            {draft.length > 0 && <g><polyline points={draft.map((point) => `${point.x * BOARD_WIDTH},${point.y * BOARD_HEIGHT}`).join(" ")} fill="none" stroke={COLOR[data.access.ownColorKey || "crimson"]} strokeWidth="14" strokeDasharray="22 12" strokeLinecap="round" strokeLinejoin="round" />{draft.map((point, index) => <circle key={`${point.x}-${point.y}-${index}`} cx={point.x * BOARD_WIDTH} cy={point.y * BOARD_HEIGHT} r="10" fill={COLOR[data.access.ownColorKey || "crimson"]} />)}</g>}
          </svg>
          <div className="tactic-board-caption"><strong>{formatTacticTime(clockSeconds)} · {activeLayer.name}</strong><span>{activeLayer.description || "点击真实峡谷地图开始标记"}</span></div>
        </div>}
        <details className="tactic-advanced"><summary>图层与精确编辑</summary><div className="tactic-advanced-grid">
          {data.access.canManageLayers && !data.access.sharedAnnotationsVisible && <div className="tactic-layer-manager"><h3>管理时间图层</h3><label>图层名称<input value={layerName} maxLength={64} placeholder="新图层名称" onChange={(event) => setLayerName(event.target.value)} /></label><div className="tactic-layer-time-inputs"><label>开始<input value={layerStart} placeholder="2:00" inputMode="numeric" onChange={(event) => setLayerStart(event.target.value)} /></label><label>结束<input value={layerEnd} placeholder="10:00" inputMode="numeric" onChange={(event) => setLayerEnd(event.target.value)} /></label></div><div className="tactic-advanced-actions"><button className="btn-subtle" disabled={busy || !layerName.trim()} onClick={addLayer}>新建图层</button><button className="btn-subtle" disabled={busy || !activeLayer} onClick={saveLayerRange}>保存时间</button><button className="btn-danger" disabled={!activeLayer || busy} onClick={removeLayer}>删除图层</button></div></div>}
          <div><h3>精确坐标</h3><div className="tactic-accessible-editor"><label>X（0–1）<input disabled={!data.access.canDraw} type="number" min="0" max="1" step="0.01" value={coordinate.x} onChange={(event) => setCoordinate({ ...coordinate, x: event.target.value })} /></label><label>Y（0–1）<input disabled={!data.access.canDraw} type="number" min="0" max="1" step="0.01" value={coordinate.y} onChange={(event) => setCoordinate({ ...coordinate, y: event.target.value })} /></label><button className="btn-subtle" disabled={!data.access.canDraw || !activeLayer || busy} onClick={addAccessiblePoint}>按坐标添加</button></div><button className="text-action" disabled={!data.access.canDraw || !ownRoute} onClick={removeOwnRoute}>删除本人路线</button></div>
        </div>{activeLayer && <div className="tactic-owned-items"><p>本人点位</p>{activeLayer.markers.filter((marker) => marker.canEdit).map((marker) => <button className="text-action" key={marker.id} disabled={!data.access.canDraw} onClick={() => removeMarker(marker)}>删除 {marker.type === "TEXT" ? marker.text : `(${marker.x.toFixed(2)}, ${marker.y.toFixed(2)})`}</button>)}</div>}</details>
    </section>
  </main>;
}
