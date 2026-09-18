"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  formatThemeWindowShanghai,
  HISTORY_THEME_CATEGORY_LABELS,
  isThemeCardActive,
  themeCardExpiryDelay,
  type ThemeCardView,
} from "@/features/history-theme/presentation";

export interface ActiveThemeCardProps {
  theme?: ThemeCardView | null;
  loading?: boolean;
  error?: boolean;
  hrefPrefix?: "" | "/m";
  onOpen?: () => void;
  now?: number;
}

export function ActiveThemeCard({
  theme,
  loading = false,
  error = false,
  hrefPrefix = "",
  onOpen,
  now,
}: ActiveThemeCardProps) {
  const [expiryTick, setExpiryTick] = useState(0);

  useEffect(() => {
    if (!theme || loading || error || now !== undefined) return;
    const delay = themeCardExpiryDelay(theme, Date.now());
    if (delay === null) return;
    const timeout = window.setTimeout(() => setExpiryTick(value => value + 1), Math.max(1, delay + 20));
    return () => window.clearTimeout(timeout);
  }, [error, expiryTick, loading, now, theme]);

  if (error) return null;
  if (loading) {
    return <section className="history-theme-card history-theme-card--loading" data-history-theme-card-loading role="status" aria-label="正在加载历史主题">
      <span className="history-theme-skeleton history-theme-skeleton--short" />
      <span className="history-theme-skeleton history-theme-skeleton--title" />
      <span className="history-theme-skeleton" />
    </section>;
  }
  if (!theme) return null;

  const currentNow = now ?? Date.now();
  const validity = formatThemeWindowShanghai(theme);
  if (!validity || !isThemeCardActive(theme, currentNow)) return null;

  const content = <div className="history-theme-card-copy">
    <div className="history-theme-card-kicker"><span>{HISTORY_THEME_CATEGORY_LABELS[theme.category]}</span><span>{theme.natureLabel}</span></div>
    <h2>{theme.title}</h2>
    <p>{theme.summary}</p>
  </div>;

  return <section className={`history-theme-card history-theme-card--${theme.category.toLowerCase()}`} data-history-theme-card data-tone={theme.tone}>
    {onOpen
      ? <div className="history-theme-card-action">{content}<div className="history-theme-card-footer"><time>{validity}</time><button type="button" className="history-theme-card-open" onClick={onOpen}>查看主题详情 <span aria-hidden="true">→</span></button></div></div>
      : <Link className="history-theme-card-action" href={`${hrefPrefix}/history-themes/${encodeURIComponent(theme.slug)}`}>{content}<div className="history-theme-card-footer"><time>{validity}</time><span>查看主题详情 <span aria-hidden="true">→</span></span></div></Link>}
  </section>;
}
