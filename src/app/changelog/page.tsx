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
        <h1 style={{ margin: "24px 0 8px" }}>更新日志</h1>
        <p style={{ color: "var(--text-muted)", marginBottom: 24 }}>查看已发布的版本更新与功能修复。</p>
        {loading ? (
          <div className="card" role="status" style={{ padding: 24 }}>正在加载更新日志…</div>
        ) : error ? (
          <div className="card" role="alert" style={{ padding: 24 }}>
            <p>更新日志加载失败，请稍后重试。</p>
            <button type="button" className="btn-ghost" onClick={() => setAttempt(value => value + 1)}>重新加载</button>
          </div>
        ) : entries.length === 0 ? (
          <div className="card" style={{ padding: 24 }}>暂无已发布的更新日志</div>
        ) : (
          <div style={{ display: "grid", gap: 16 }}>
            {entries.map(entry => (
              <article className="card" key={entry.slug} style={{ padding: 24, minWidth: 0, overflowWrap: "anywhere" }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", color: "var(--text-muted)", fontSize: 13 }}>
                  <time dateTime={entry.date}>{entry.date}</time>
                  {entry.version && <span className="badge badge-muted">{entry.version}</span>}
                </div>
                <h2 style={{ fontSize: 20, margin: "12px 0" }}>
                  <Link href={`${prefix}/changelog/${encodeURIComponent(entry.slug)}`} style={{ color: "var(--text)", textDecoration: "none" }}>{entry.title}</Link>
                </h2>
                <p style={{ color: "var(--text-muted)", whiteSpace: "pre-wrap", margin: 0 }}>{entry.desc}</p>
              </article>
            ))}
          </div>
        )}
      </div>
    </PageEntrance>
  );
}
