"use client";

import Link from "next/link";
import {
  HISTORY_THEME_BLOCK_LABELS,
  HISTORY_THEME_CATEGORY_LABELS,
  safeSourceUrl,
  type HistoryThemeBlockView,
  type ThemeDetailView,
} from "@/features/history-theme/presentation";
import { MarkdownContent } from "@/web/components/content/MarkdownContent";

export interface HistoryThemeDetailProps {
  theme: ThemeDetailView;
  homeHref?: string;
  onBack?: () => void;
  backLabel?: string;
  onOther?: () => void;
}

const categoryIntroductions = {
  TRADITIONAL_FESTIVAL: "节俗、出处与当代参与",
  ANCIENT_BATTLE: "原文、今译与史料边界",
  MODERN_COMMEMORATION: "事实时间线与审定说明",
  HISTORICAL_FIGURE: "贡献、节点与原始资料",
} as const;

function withoutRemoteMarkdownImages(content: string): string {
  return content
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, (_match, alt: string) => `${alt || "图片"}（预览不加载图片）`)
    .replace(/!\[/g, "图片预览已禁用：[");
}

function HistoryBlock({ block }: { block: HistoryThemeBlockView }) {
  const title = block.title.trim() || HISTORY_THEME_BLOCK_LABELS[block.kind];
  const safeBody = withoutRemoteMarkdownImages(block.body);
  if (block.kind === "MAP") {
    return <section className="history-theme-content-block history-theme-content-block--map" data-block-kind={block.kind}>
      <h2>{title}</h2>
      <div className="history-theme-map-placeholder" role="img" aria-label="地图示意图占位，非精确复原"><span aria-hidden="true">◇</span><strong>示意图占位</strong><small>非精确复原</small></div>
      <MarkdownContent content={safeBody} />
    </section>;
  }
  if (block.kind === "QUIZ") {
    const [question = "问题待填写", ...explanation] = safeBody.split(/\r?\n/).filter(Boolean);
    return <section className="history-theme-content-block history-theme-content-block--quiz" data-block-kind={block.kind}>
      <h2>{title}</h2><p className="history-theme-quiz-question">{question}</p>
      <details><summary>展开解释</summary><MarkdownContent content={explanation.join("\n") || "解释待编辑。"} /></details>
    </section>;
  }
  return <section className={`history-theme-content-block history-theme-content-block--${block.kind.toLowerCase()}`} data-block-kind={block.kind}>
    <h2>{title}</h2><MarkdownContent content={safeBody} />
  </section>;
}

export function HistoryThemeDetail({ theme, homeHref = "/", onBack, onOther, backLabel = "返回编辑" }: HistoryThemeDetailProps) {
  const requiresReviewSummary = theme.category === "MODERN_COMMEMORATION" || theme.category === "HISTORICAL_FIGURE";
  return <article className={`history-theme-detail history-theme-detail--${theme.category.toLowerCase()}`} data-history-theme-detail data-category={theme.category}>
    <header className="history-theme-detail-hero">
      <div className="history-theme-detail-kicker"><span>{HISTORY_THEME_CATEGORY_LABELS[theme.category]}</span><span>{theme.natureLabel}</span></div>
      <h1>{theme.title}</h1><p>{theme.summary}</p>
      <dl className="history-theme-date-summary"><div><dt>日期</dt><dd>{theme.dateLabel}</dd></div><div><dt>口径说明</dt><dd>{theme.dateNote}</dd></div></dl>
    </header>

    {requiresReviewSummary && <aside className="history-theme-review-summary" aria-label="史实审核信息">
      <div><span>本页最后史实审核日期</span><strong>{theme.reviewedAt || "未核验"}</strong></div>
      <div><span>已列来源</span><strong>{theme.sources.length} 项</strong></div>
      <div><span>艺术复原</span><strong>{theme.reconstructionNote ? "已标注" : "无"}</strong></div>
      <div className="history-theme-feedback-boundary"><button type="button" disabled>发现问题</button><small>问题反馈服务未接入</small></div>
    </aside>}

    {theme.reconstructionNote && <aside className="history-theme-reconstruction-note"><strong>艺术复原说明</strong><p>{theme.reconstructionNote}</p></aside>}
    <p className="history-theme-template-note">{categoryIntroductions[theme.category]}</p>
    <div className="history-theme-detail-body">{theme.blocks.length === 0 ? <p className="history-theme-empty">暂无内容块。</p> : theme.blocks.map(block => <HistoryBlock key={block.id} block={block} />)}</div>

    <section className="history-theme-sources" aria-labelledby="history-theme-sources-title">
      <div className="history-theme-section-heading"><h2 id="history-theme-sources-title">来源与阅读记录</h2><span>{theme.sources.length} 项</span></div>
      {theme.sources.length === 0 ? <p className="history-theme-empty">尚未添加来源。</p> : theme.sources.map((source, index) => {
        const href = safeSourceUrl(source.url);
        return <details key={source.id} className="history-theme-source">
          <summary>{source.title.trim() || `来源 ${index + 1}`}</summary>
          <dl><div><dt>发布机构</dt><dd>{source.publisher || "未填写"}</dd></div><div><dt>来源类型</dt><dd>{source.sourceType || "未填写"}</dd></div><div><dt>访问日期</dt><dd>{source.accessedAt || "未填写"}</dd></div><div><dt>关联论断</dt><dd>{source.claimIds.join("、") || "未填写"}</dd></div></dl>
          {href ? <a href={href} target="_blank" rel="noopener noreferrer">打开来源 <span aria-hidden="true">↗</span></a> : <p className="history-theme-source-unavailable">未提供可安全打开的 HTTP(S) 网址。</p>}
        </details>;
      })}
    </section>

    <nav className="history-theme-detail-actions" aria-label="历史主题导航">
      {onBack ? <button type="button" onClick={onBack}>{backLabel}</button> : <Link href={homeHref}>返回首页</Link>}
      {onOther ? <button type="button" onClick={onOther}>查看其他主题</button> : <Link href={homeHref}>查看其他主题</Link>}
    </nav>
  </article>;
}
