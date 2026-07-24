"use client";

import { useEffect, useState } from "react";

interface LogEntry {
  time: string;
  module: string;
  status: string;
  detail: string;
}

const MODULES = [
  { key: "news", label: "官方公告", desc: "监控 pvp.qq.com 新闻列表" },
  { key: "heroes", label: "英雄数据 + 技能", desc: "监控 herolist.json 变化" },
  { key: "skins", label: "高清皮肤图片", desc: "监控英雄数量变化" },
];

export default function MonitorPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const [lastCycle, setLastCycle] = useState(0);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const es = new EventSource("/api/heroes/watch");
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        const now = new Date().toLocaleTimeString("zh-CN");

        switch (msg.type) {
          case "connected":
            addLog("system", "connected", "SSE 已连接，监控就绪");
            break;
          case "monitor-check":
            setLastCycle(msg.cycle);
            for (const r of msg.results) {
              addLog(r.module, r.changed ? "changed" : "idle", r.detail);
            }
            break;
          case "scrape-triggered":
            for (const m of msg.modules) {
              addLog(m, "scraping", "开始爬取...");
            }
            break;
          case "scrape-result":
            for (const ev of msg.events) {
              if (ev.action === "scrape-done") {
                addLog(ev.module, "done", ev.detail);
              } else if (ev.action === "scrape-fail") {
                addLog(ev.module, "error", ev.detail);
              }
            }
            break;
          case "monitor-idle":
            setLastCycle(msg.cycle);
            break;
        }
      } catch {}
    };

    return () => es.close();
  }, []);

  function addLog(module: string, status: string, detail: string) {
    const time = new Date().toLocaleTimeString("zh-CN");
    setLogs((prev) => [{ time, module, status, detail }, ...prev].slice(0, 200));
  }

  async function triggerCheck() {
    setChecking(true);
    addLog("system", "manual", "手动触发检查...");
    try {
      const res = await fetch("/api/heroes/watch");
      // SSE will pick up the events
      setChecking(false);
    } catch {
      setChecking(false);
    }
  }

  const statusColor = (s: string) => {
    switch (s) {
      case "changed": return "var(--gold)";
      case "scraping": return "var(--blue)";
      case "done": return "var(--green)";
      case "error": return "var(--red)";
      case "idle": return "var(--text-muted)";
      case "connected": return "var(--green)";
      case "manual": return "var(--blue)";
      default: return "var(--text-secondary)";
    }
  };

  return (
    <div className="page-shell page-shell--medium">
      <div className="monitor-header">
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--text)", margin: "0 0 4px" }}>
            数据监控中心
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
            轻量监控官方数据源 · 变化时自动触发爬虫 · 热更新推送
            {connected && <span style={{ color: "var(--green)", marginLeft: 10 }}>● 在线</span>}
            {!connected && <span style={{ color: "var(--red)", marginLeft: 10 }}>● 离线</span>}
          </p>
        </div>
        <button
          onClick={triggerCheck}
          disabled={checking}
          className="btn-primary"
          style={{ fontSize: 13, padding: "10px 24px" }}
        >
          {checking ? "检查中..." : "立即检查"}
        </button>
      </div>

      {/* Module cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 12, marginBottom: 24 }}>
        {MODULES.map((m) => {
          const lastLog = logs.find((l) => l.module === m.key);
          const isActive = lastLog?.status === "scraping";
          return (
            <div key={m.key} className="card" style={{ padding: 20, borderColor: isActive ? "var(--gold)" : undefined }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>{m.label}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>{m.desc}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: statusColor(lastLog?.status || "idle") }}>
                {lastLog ? (lastLog.status === "idle" ? "✓ 无变化" : lastLog.status === "scraping" ? "⟳ 爬取中..." : lastLog.status === "done" ? "✓ 已更新" : lastLog.status === "changed" ? "⚠ 检测到变化" : lastLog.status) : "等待首次检查"}
              </div>
            </div>
          );
        })}
      </div>

      {/* Log */}
      <div className="card" style={{ padding: "16px 20px" }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", margin: "0 0 12px" }}>
          监控日志 {lastCycle > 0 && <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 400 }}>第 {lastCycle} 轮</span>}
        </h3>
        <div style={{ maxHeight: 400, overflowY: "auto" }}>
          {logs.length === 0 ? (
            <p style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", padding: "20px 0" }}>
              等待首次监控检查...
            </p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <tbody>
                {logs.slice(0, 50).map((log, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <td style={{ padding: "4px 8px", color: "var(--text-muted)", fontFamily: "monospace", fontSize: 11, whiteSpace: "nowrap" }}>
                      {log.time}
                    </td>
                    <td style={{ padding: "4px 8px", fontWeight: 600, whiteSpace: "nowrap", color: statusColor(log.status) }}>
                      {MODULES.find((m) => m.key === log.module)?.label || log.module}
                    </td>
                    <td style={{ padding: "4px 8px", color: "var(--text-secondary)" }}>
                      {log.detail}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
