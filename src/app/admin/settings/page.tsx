"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { apiRequest, jsonRequest } from "@/features/shared/client/api";

type Settings = Record<string, string>;
type Progress = { phase: string; current: number; total: number; message: string } | null;

const LABELS: Record<string, string> = {
  hero_list_page: "英雄列表页 (HTML)",
  hero_list_json: "英雄列表 (JSON)",
  hero_detail_base: "英雄详情页基地址",
  hero_img_base: "英雄图片基地址",
  skin_img_base: "皮肤图片基地址",
};

const DEFAULTS: Settings = {
  hero_list_page: "https://pvp.qq.com/web201605/herolist.shtml",
  hero_list_json: "https://pvp.qq.com/web201605/js/herolist.json",
  hero_detail_base: "https://pvp.qq.com/web201605/herodetail",
  hero_img_base: "https://game.gtimg.cn/images/yxzj/img201606/heroimg/{id}/{id}.jpg",
  skin_img_base: "https://game.gtimg.cn/images/yxzj/img201606/skin/hero-info/{id}/{id}-bigskin-{idx}.jpg",
};

export default function AdminSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [revision, setRevision] = useState(0);
  const [settings, setSettings] = useState<Settings>({});
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<Progress>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRequestRef = useRef<AbortController | null>(null);

  // Load settings on mount
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setLoadError("");
    void apiRequest<{ settings?: Settings; error?: string }>("/api/admin/settings", { signal: controller.signal })
      .then(({ ok, data }) => { if (controller.signal.aborted) return; if (!ok) throw new Error("配置加载失败，请重试"); setSettings(data.settings || {}); })
      .catch(() => { if (!controller.signal.aborted) setLoadError("配置加载失败，请重试"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision]);

  // Poll sync progress while running
  useEffect(() => {
    if (!running) return;
    pollRef.current = setInterval(async () => {
      if (pollRequestRef.current) return;
      const controller = new AbortController();
      pollRequestRef.current = controller;
      try {
        const { data: d } = await apiRequest<{ progress?: NonNullable<Progress> }>("/api/admin/sync-status", {
          signal: controller.signal,
          timeoutMs: 5_000,
        });
        if (d.progress) {
          setProgress(d.progress);
          if (d.progress.phase === "done" || d.progress.phase === "error") {
            setRunning(false);
            setSaveMsg({ ok: d.progress.phase === "done", text: d.progress.message });
            // Auto-clear progress after 8s
            setTimeout(() => setProgress(null), 8000);
          }
        }
      } catch { /* poll failed, keep going */ }
      finally {
        if (pollRequestRef.current === controller) pollRequestRef.current = null;
      }
    }, 1000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRequestRef.current?.abort();
      pollRequestRef.current = null;
    };
  }, [running]);

  // Cleanup poll on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRequestRef.current?.abort();
    };
  }, []);

  const handleSave = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveMsg(null);
    try {
      const { data } = await jsonRequest<{ ok?: boolean; error?: string }>("/api/admin/settings", "PUT", settings);
      setSaveMsg({ ok: !!data.ok, text: data.ok ? "配置已保存" : (data.error || "保存失败") });
    } catch {
      setSaveMsg({ ok: false, text: "网络错误" });
    }
    setSaving(false);
  }, [settings]);

  const handleReset = useCallback(() => {
    setSettings({ ...DEFAULTS });
    setSaveMsg({ ok: true, text: "已恢复默认值，请点击保存" });
  }, []);

  const handleSync = useCallback(async () => {
    setRunning(true);
    setProgress({ phase: "start", current: 0, total: 0, message: "正在启动同步..." });
    setSaveMsg(null);
    try {
      const { data } = await apiRequest<{ ok?: boolean; error?: string }>("/api/heroes", { method: "POST" });
      if (data.ok) return;
      setRunning(false);
      setSaveMsg({ ok: false, text: data.error || "触发失败" });
    } catch (error) {
      setRunning(false);
      setSaveMsg({ ok: false, text: error instanceof Error ? error.message : "网络错误" });
    }
  }, []);

  const handleChange = useCallback((key: string, value: string) => {
    setSettings((s) => ({ ...s, [key]: value }));
  }, []);

  const pct = progress && progress.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : 0;

  return <div className="admin-page admin-settings">
    <header className="admin-page-heading"><div><p className="feature-kicker">SYSTEM SETTINGS</p><h1>系统设置</h1><p>管理数据来源，查看同步进度。</p></div></header>
    {loading ? <p className="admin-empty" role="status">正在加载配置…</p> : loadError ? <div className="admin-error" role="alert"><p>{loadError}</p><button className="btn-subtle" onClick={() => setRevision(value => value+1)}>重试加载</button></div> : <>
      <section className="admin-form-section"><h2>数据爬取地址</h2><p>修改后点击保存，下次同步生效。留空字段不会被保存。</p>
        <form onSubmit={handleSave}><div className="admin-form-fields">{Object.keys(LABELS).map(key => <label key={key}><span>{LABELS[key]}</span><input value={settings[key] || ""} onChange={e => handleChange(key,e.target.value)} placeholder={DEFAULTS[key]} /></label>)}</div>
          <div className="admin-row-actions"><button type="submit" className="btn-primary" disabled={saving}>{saving ? "保存中..." : "保存配置"}</button><button type="button" className="btn-subtle" onClick={handleReset}>恢复默认</button></div>
        </form>
      </section>
      <section className="admin-form-section"><h2>英雄数据同步</h2><p>从配置的地址拉取最新英雄数据，包括技能、皮肤、图片。同步需要约 60–90 秒。</p>
        <button type="button" className="btn-subtle" disabled={running} onClick={handleSync}>{running ? "同步中..." : "立即同步英雄"}</button>
        {progress && <div role="status"><div className="admin-progress-copy"><span>{progress.message}</span>{progress.total > 0 && <span>{pct}%</span>}</div><div className="admin-progress-track" data-error={progress.phase === "error"} role="progressbar" aria-label="英雄同步进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.total > 0 ? pct : undefined}><div style={{ width: progress.total > 0 ? pct+"%" : "8%" }} /></div></div>}
      </section>
      {saveMsg && <p role={saveMsg.ok ? "status" : "alert"} className={saveMsg.ok ? "admin-notice" : "admin-error"}>{saveMsg.text}</p>}
    </>}
  </div>;
}
