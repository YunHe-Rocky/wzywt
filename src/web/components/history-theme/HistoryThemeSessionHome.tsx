"use client";

import { useEffect, useRef, useState } from "react";
import { HISTORY_PREVIEW_STYLES, historyPreviewStyle } from "@/features/history-theme/preview";
import { ActiveThemeCard } from "./ActiveThemeCard";
import { HistoryThemeDetail } from "./HistoryThemeDetail";
import { useHistoryThemeSession } from "./HistoryThemeSessionProvider";

export function HistoryThemeSessionHome() {
  const { preview } = useHistoryThemeSession();
  const [detail, setDetail] = useState(false);
  const container = useRef<HTMLElement>(null);
  useEffect(() => setDetail(false), [preview]);
  if (!preview) return null;
  const style = historyPreviewStyle(preview.theme);
  const appearance = HISTORY_PREVIEW_STYLES[style];
  const show = (value: boolean) => {
    setDetail(value);
    requestAnimationFrame(() => container.current?.focus({ preventScroll: true }));
  };
  return <section ref={container} className="history-session-home" data-preview-appearance={style} tabIndex={-1} aria-label="当前主题预览">
    <div className="history-session-heading"><span className="history-session-seal" aria-hidden="true">{appearance.mark}</span><div><p>{appearance.name}</p><h2>{appearance.caption}</h2></div><small>会话预览 · 示例展示时间</small></div>
    {detail ? <HistoryThemeDetail theme={preview.theme} onBack={() => show(false)} backLabel="返回主题卡片" onOther={() => show(false)} /> : <ActiveThemeCard theme={preview.theme} now={preview.now} onOpen={() => show(true)} />}
  </section>;
}
