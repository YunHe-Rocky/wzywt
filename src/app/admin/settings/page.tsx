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
    void apiRequest<{ settings?: Settings }>("/api/admin/settings", { signal: controller.signal })
      .then(({ data }) => setSettings(data.settings || {}))
      .catch(() => undefined)
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

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

  const barColor = progress?.phase === "error"
    ? "var(--red)"
    : progress?.phase === "done"
      ? "var(--gold)"
      : "linear-gradient(90deg, var(--gold-dim), var(--gold-light))";

  const barAnim = progress && progress.phase !== "done" && progress.phase !== "error" && progress.total === 0
    ? "pulse 1.5s infinite"
    : "none";

  if (loading) {
    return <div className="px-6 py-8 text-text-muted">加载中...</div>;
  }

  return (
    <div className="px-6 py-8 max-w-2xl">
      <h1 className="text-xl font-bold mb-6">系统设置</h1>

      {/* ── 爬取配置 ── */}
      <section className="mb-6">
        <h2 className="text-sm font-semibold text-text mb-4">数据爬取地址</h2>
        <p className="text-[12px] text-text-muted mb-4">
          修改后点击保存，下次同步生效。留空字段不会被保存。
        </p>
        <form onSubmit={handleSave}>
          <div className="flex flex-col gap-3 mb-5">
            {Object.keys(LABELS).map((key) => (
              <label key={key} className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">
                  {LABELS[key]}
                </span>
                <input
                  value={settings[key] || ""}
                  onChange={(e) => handleChange(key, e.target.value)}
                  placeholder={DEFAULTS[key]}
                  className="w-full px-3 py-2 rounded-md border border-gold/10 bg-input text-text text-[13px] placeholder:text-text-muted/40 focus:border-gold/20 focus:outline-none transition-colors"
                />
              </label>
            ))}
          </div>

          <div className="flex gap-3 items-center">
            <button type="submit" disabled={saving}
              className="px-5 py-2 rounded-md text-sm font-semibold bg-gradient-to-b from-gold-light via-gold to-gold-dim text-white disabled:opacity-50 transition-opacity">
              {saving ? "保存中..." : "保存配置"}
            </button>
            <button type="button" onClick={handleReset}
              className="px-4 py-2 rounded-md text-sm text-text-muted hover:text-text transition-colors">
              恢复默认
            </button>
          </div>
        </form>
      </section>

      {/* ── 同步控制 ── */}
      <section>
        <h2 className="text-sm font-semibold text-text mb-4">英雄数据同步</h2>
        <p className="text-[12px] text-text-muted mb-4">
          从配置的地址拉取最新英雄数据，包括技能、皮肤、图片。同步需要约 60-90 秒。
        </p>

        <button type="button" disabled={running} onClick={handleSync}
          className="px-5 py-2 rounded-md text-sm font-semibold border border-gold/20 text-gold hover:bg-gold/5 disabled:opacity-50 transition-all">
          {running ? "同步中..." : "立即同步英雄"}
        </button>

        {/* Progress bar */}
        {progress && (
          <div className="mt-4">
            <div className="flex justify-between text-[11px] text-text-muted mb-1.5">
              <span>{progress.message}</span>
              {progress.total > 0 && <span className="tabular-nums">{pct}%</span>}
            </div>
            <div className="w-full h-2 rounded-full bg-border-light overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: progress.total > 0 ? `${pct}%` : "8%", background: barColor, animation: barAnim }}
              />
            </div>
          </div>
        )}
      </section>

      {/* Feedback */}
      {saveMsg && (
        <div className={`mt-6 text-[13px] ${saveMsg.ok ? "text-gold" : "text-red"}`}>
          {saveMsg.text}
        </div>
      )}
    </div>
  );
}
