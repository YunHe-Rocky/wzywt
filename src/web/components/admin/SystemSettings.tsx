"use client";

import "@/web/styles/admin.css";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CRAWL_FIELDS, DEFAULT_CRAWL_CONFIG, crawlConfigErrors, crawlExample, type CrawlConfig } from "@/features/heroes/crawl-config";
import { readCrawlSettings, saveCrawlSettings, readHeroSyncProgress, startHeroSync, type SyncProgress } from "@/features/admin/client/settings";

const isActive = (progress: SyncProgress | null) => !!progress && ["queued", "running"].includes(progress.phase);
const sameConfig = (a: CrawlConfig, b: CrawlConfig) => CRAWL_FIELDS.every(({ key }) => a[key] === b[key]);

export function SystemSettings() {
  const prefix = usePathname().startsWith("/m/") ? "/m" : "";
  const [saved, setSaved] = useState<CrawlConfig | null>(null);
  const [draft, setDraft] = useState<CrawlConfig | null>(null);
  const [loadError, setLoadError] = useState("");
  const [revision, setRevision] = useState(0);
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState<"save" | "sync" | null>(null);
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [watching, setWatching] = useState(false);
  const [pollError, setPollError] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const job = useRef<string | undefined>(undefined);
  const statusGeneration = useRef(0);
  const action = useRef(false);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  useEffect(() => {
    const controller = new AbortController(); setLoadError("");
    void readCrawlSettings(controller.signal).then(result => {
      if (controller.signal.aborted) return;
      if (!result.ok || !result.data.settings) throw new Error(result.data.error || "配置加载失败");
      setSaved(result.data.settings); setDraft(result.data.settings);
    }).catch(cause => { if (!controller.signal.aborted) setLoadError(cause instanceof Error ? cause.message : "配置加载失败"); });
    return () => controller.abort();
  }, [revision]);

  useEffect(() => {
    const controller = new AbortController(); const generation = statusGeneration.current;
    void readHeroSyncProgress(controller.signal).then(result => {
      if (controller.signal.aborted || generation !== statusGeneration.current) return;
      if (!result.ok) throw new Error(result.data.error || "同步记录读取失败");
      setProgress(result.data.progress); job.current = result.data.progress?.jobId;
      setWatching(isActive(result.data.progress));
    }).catch(() => { if (!controller.signal.aborted) setPollError("暂时无法读取上次同步记录，可以重新读取。"); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!watching) return;
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>; let failures = 0;
    async function poll() {
      try {
        const result = await readHeroSyncProgress(controller.signal);
        if (controller.signal.aborted) return;
        if (!result.ok) throw new Error(result.data.error || "无法读取同步进度");
        const next = result.data.progress;
        if (!job.current || next?.jobId === job.current) {
          setProgress(next);
          if (!next || !isActive(next)) { setWatching(false); setPollError(""); return; }
        }
        failures = 0; setPollError("");
      } catch {
        if (controller.signal.aborted) return;
        failures += 1; setPollError("进度暂时无法读取，后台任务可能仍在运行。请重新读取进度。");
        if (failures >= 3) { setWatching(false); return; }
      }
      if (!controller.signal.aborted) timer = setTimeout(() => void poll(), 1500);
    }
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [watching]);

  const dirty = !!draft && !!saved && !sameConfig(draft, saved);
  const running = isActive(progress);
  const locked = !!busy || running;
  const errors = draft ? crawlConfigErrors(draft) : {};
  async function submit(sync: boolean) {
    if (!draft || !saved || action.current || running) return;
    setShowErrors(true); setNotice(""); setActionError("");
    if (Object.keys(errors).length) { setAdvanced(true); setActionError("请先修正标出的地址，或使用默认值。"); return; }
    action.current = true; setBusy(sync ? "sync" : "save");
    let didSave = false;
    try {
      if (dirty) {
        const result = await saveCrawlSettings(draft);
        if (!result.ok || !result.data.ok) throw new Error(result.data.error || "配置保存失败");
        didSave = true;
        if (!mounted.current) return;
        setSaved(result.data.settings); setDraft(result.data.settings);
      }
      if (sync) {
        statusGeneration.current += 1;
        const result = await startHeroSync();
        if (!result.ok || !result.data.ok) throw new Error(result.data.error || "未能启动同步");
        if (!mounted.current) return;
        job.current = result.data.jobId;
        setProgress({ jobId: result.data.jobId, phase: "queued", current: 0, total: 0, message: result.data.message || "同步任务已进入队列" });
        setPollError(""); setWatching(true); setNotice("");
      } else if (mounted.current) setNotice("配置已保存。下次同步会使用这些地址，现有英雄资料不会立即改变。");
    } catch (cause) {
      if (mounted.current) setActionError(`${didSave ? "配置已保存，但同步未启动。" : ""}${cause instanceof Error ? cause.message : "操作失败，请重试"}`);
    } finally { action.current = false; if (mounted.current) setBusy(null); }
  }
  const percent = progress && progress.total > 0 ? Math.min(100, Math.max(0, Math.round(progress.current / progress.total * 100))) : undefined;
  return <div className="admin-page admin-settings">
    <header className="admin-page-heading"><div><p className="feature-kicker">SYSTEM SETTINGS</p><h1>系统设置</h1><p>更新英雄资料，管理同步使用的数据来源。</p></div><Link className="btn-subtle" href={`${prefix}/heroes`}>查看英雄图鉴 ↗</Link></header>
    {loadError ? <div className="admin-error" role="alert"><p>{loadError}</p><button className="btn-subtle" onClick={() => setRevision(value => value + 1)}>重新加载配置</button></div> : !draft || !saved ? <p className="admin-empty" role="status">正在读取已保存的配置…</p> : <>
      <section className="settings-quickstart" aria-labelledby="settings-guide"><div><span className="feature-kicker">日常使用</span><h2 id="settings-guide">通常不需要填写地址</h2><p>保留官方来源，点击同步即可更新英雄、技能和皮肤图片。只有官方路径调整时，才需要修改高级配置。</p></div><ol><li><span>1</span>确认数据来源</li><li><span>2</span>启动同步</li><li><span>3</span>到图鉴查看更新</li></ol></section>
      <section className="admin-form-section settings-sync" aria-labelledby="sync-heading">
        <div className="settings-section-heading"><div><h2 id="sync-heading">英雄资料同步</h2><p>当前使用：<strong>{sameConfig(saved, DEFAULT_CRAWL_CONFIG) ? "官方默认来源" : "自定义官方路径"}</strong>{dirty && <span className="settings-unsaved"> · 有未保存修改</span>}</p></div><button className="btn-primary" disabled={locked} onClick={() => void submit(true)}>{busy === "sync" ? "正在提交…" : running ? "同步任务进行中…" : dirty ? "保存并同步英雄" : "同步英雄资料"}</button></div>
        <p className="settings-help">耗时取决于资料和图片数量。任务开始后可以离开页面，下次进入仍能查看进度。</p>
        {progress && <div className="settings-sync-result" data-phase={progress.phase} role={progress.phase === "error" ? "alert" : "status"}>
          <div className="admin-progress-copy"><strong>{progress.phase === "queued" ? "已排队" : progress.phase === "running" ? "正在同步" : progress.phase === "done" ? "同步完成" : "同步失败"}</strong>{progress.updatedAt && <time dateTime={progress.updatedAt}>{new Date(progress.updatedAt).toLocaleString("zh-CN")}</time>}</div>
          <p>{progress.message}</p>{running && <><div className="admin-progress-track" role="progressbar" aria-label="英雄同步进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><div style={{ width: `${percent ?? 8}%` }} /></div><p className="settings-help">{progress.phase === "queued" ? "开始后会自动显示进度。长时间未开始，可到运行监控查看状态。" : `${percent === undefined ? "正在处理资料" : `已完成 ${percent}%`}，请勿重复提交。`}</p></>}
          {progress.phase === "done" && <Link className="btn-subtle" href={`${prefix}/heroes`}>查看更新后的英雄资料</Link>}
        </div>}
        {pollError && <p role="alert" className="admin-error">{pollError}</p>}
        <div className="admin-row-actions"><button className="btn-subtle" disabled={!!busy || watching} onClick={() => { job.current = undefined; setWatching(true); }}>重新读取进度</button><Link className="btn-subtle" href={`${prefix}/admin/monitor`}>运行监控</Link></div>
      </section>
      <details className="settings-advanced" open={advanced} onToggle={event => setAdvanced(event.currentTarget.open)}><summary><span>高级配置 · 调整数据来源</span><small>一般保持默认即可</small></summary>
        <p className="settings-help">仅支持王者荣耀官方 HTTPS 地址。修改后可单独保存，也可保存后立即同步。下方示例以廉颇（编号 105）的第一款皮肤说明实际地址。</p>
        <form onSubmit={event => { event.preventDefault(); void submit(false); }} noValidate>
          <div className="admin-form-fields">{CRAWL_FIELDS.map(({ key, label, description }) => <div className="settings-source-field" key={key}>
            <label htmlFor={`crawl-${key}`}><span>{label}</span><input id={`crawl-${key}`} value={draft[key]} disabled={locked} spellCheck={false} autoCapitalize="none" autoComplete="off" aria-invalid={showErrors && !!errors[key]} aria-describedby={`crawl-${key}-help`} onChange={event => { setDraft({ ...draft, [key]: event.target.value }); setNotice(""); setActionError(""); }} /></label>
            <p id={`crawl-${key}-help`} className="settings-help">{description}</p>
            {showErrors && errors[key] && <p className="admin-error" role="alert">{errors[key]}</p>}
            <div className="settings-source-preview"><span>实际地址示例</span><code>{crawlExample(draft, key)}</code><button type="button" className="text-action" disabled={locked || draft[key] === DEFAULT_CRAWL_CONFIG[key]} onClick={() => { setDraft({ ...draft, [key]: DEFAULT_CRAWL_CONFIG[key] }); setNotice(""); }}>使用此项默认值</button></div>
          </div>)}</div>
          <div className="admin-row-actions"><button type="submit" className="btn-primary" disabled={locked || !dirty}>{busy === "save" ? "正在保存…" : "保存配置"}</button><button type="button" className="btn-subtle" disabled={locked || !dirty} onClick={() => { setDraft({ ...saved }); setNotice(""); setActionError(""); setShowErrors(false); }}>放弃未保存修改</button></div>
        </form>
      </details>
      {notice && <p className="admin-notice" role="status">{notice}</p>}{actionError && <p className="admin-error" role="alert">{actionError}</p>}
    </>}
  </div>;
}
