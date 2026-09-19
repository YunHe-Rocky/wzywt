"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PageEntrance } from "@/web/components/layout/PageEntrance";
import { listChangelogEntries, type ChangelogEntry } from "@/features/announcements/client/api";

export default function ChangelogPage() {
  const pathname = usePathname();
  const prefix = /^\/m(?:\/|$)/.test(pathname) ? "/m" : "";
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    void listChangelogEntries(controller.signal)
      .then(({ ok, data }) => {
        if (!ok || !Array.isArray(data.entries)) throw new Error("Invalid changelog response");
        if (!controller.signal.aborted) setEntries(data.entries);
      })
      .catch(() => { if (!controller.signal.aborted) setError(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt]);

  return (
    <PageEntrance>
      <div className="page-shell page-shell--medium">
        <Link href={prefix || "/"} className="arena-text-link">← 返回首页</Link>
        <header className="yanwu-document-heading"><p className="arena-eyebrow">演武纪事 / 更新目录</p><h1>更新日志</h1><p>翻阅每一次改变，也记下每一次相聚。</p></header>
        {loading ? (
          <div className="yanwu-feedback" role="status">正在加载更新日志…</div>
        ) : error ? (
          <div className="yanwu-feedback" role="alert">
            <p>更新日志加载失败，请稍后重试。</p>
            <button type="button" className="btn-ghost" onClick={() => setAttempt(value => value + 1)}>重新加载</button>
          </div>
        ) : entries.length === 0 ? (
          <div className="yanwu-feedback">暂无已发布的更新日志</div>
        ) : (
          <div className="yanwu-document-list">
            {entries.map(entry => (
              <article className="yanwu-document-entry" key={entry.slug}>
                <div className="yanwu-document-meta">
                  <time dateTime={entry.date}>{entry.date}</time>
                  {entry.version && <span className="badge badge-muted">{entry.version}</span>}
                </div>
                <div><h2>
                  <Link href={`${prefix}/changelog/${encodeURIComponent(entry.slug)}`} style={{ color: "var(--text)", textDecoration: "none" }}>{entry.title}</Link>
                </h2>
                <p>{entry.desc}</p></div>
              </article>
            ))}
          </div>
        )}
      </div>
    </PageEntrance>
  );
}
