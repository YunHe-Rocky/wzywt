"use client";

import { useMonitorDashboard } from "@/features/monitor/client/useMonitorDashboard";

const MODULES = [
  { key: "news", label: "官方公告", description: "检查官方新闻列表的内容变化" },
  { key: "heroes", label: "英雄与技能", description: "检查英雄目录和技能数据变化" },
  { key: "skins", label: "高清皮肤图片", description: "检查英雄与皮肤资源数量变化" },
];

const STATUS_LABELS: Record<string, string> = {
  changed: "检测到变化",
  scraping: "同步中",
  done: "已更新",
  error: "检查失败",
  idle: "无变化",
  connected: "连接成功",
  manual: "正在提交",
  queued: "已入队",
};

const RESOURCE_STATE_LABELS = {
  COLD: "未加载",
  WARMING: "加载中",
  HOT: "可用",
  IDLE: "空闲待释放",
  EVICTED: "已释放",
} as const;

const RESOURCE_SCOPE_LABELS = { public: "公共", user: "用户" } as const;

function statusLabel(status?: string) {
  return status ? STATUS_LABELS[status] || status : "等待首次检查";
}

export function MonitorDashboard() {
  const { logs, connected, lastCycle, checking, resources, leaseError, resourceError, triggerCheck } = useMonitorDashboard();

  return (
    <main className="page-shell page-shell--medium monitor-page">
      <header className="feature-hero monitor-hero">
        <div>
          <p className="feature-kicker">RESOURCE OBSERVABILITY</p>
          <h1>数据监控中心</h1>
          <p>轻量检查官方数据源，在检测到变化后由后台任务安全同步。</p>
        </div>
        <div className="monitor-hero-actions">
          <span className="monitor-connection" data-connected={connected} role="status">
            <span aria-hidden="true" />{connected ? "实时连接正常" : "实时连接已断开"}
          </span>
          <button className="btn-primary" disabled={checking || !connected} onClick={() => void triggerCheck()}>
            {checking ? "检查提交中…" : "立即检查"}
          </button>
        </div>
      </header>

      {(leaseError || resourceError) && (
        <div className="feature-error" role="alert">
          <strong>监控数据暂不可用</strong>
          <span>{leaseError || resourceError}。请确认管理员登录状态后刷新页面重试。</span>
        </div>
      )}

      <section className="monitor-modules" aria-labelledby="monitor-modules-title">
        <h2 id="monitor-modules-title" className="sr-only">数据源状态</h2>
        {MODULES.map((module) => {
          const latest = logs.find((log) => log.module === module.key);
          return (
            <article key={module.key} className="card monitor-module" data-status={latest?.status || "idle"}>
              <h3>{module.label}</h3>
              <p>{module.description}</p>
              <strong>{statusLabel(latest?.status)}</strong>
            </article>
          );
        })}
      </section>

      <section className="card monitor-section" aria-labelledby="resource-lifecycle-title">
        <div className="feature-heading">
          <div><h2 id="resource-lifecycle-title">动态资源生命周期</h2><p>公共与用户作用域资源的加载、复用和释放状态。</p></div>
        </div>
        <p className="data-table-hint" id="resource-table-hint">移动端可在表格区域内横向滑动查看完整指标。</p>
        <div className="data-table-wrap" role="region" tabIndex={0} aria-label="动态资源生命周期表" aria-describedby="resource-table-hint">
          <table className="monitor-table">
            <caption>动态资源生命周期、作用域、租约和缓存指标</caption>
            <thead><tr><th scope="col">资源</th><th scope="col">状态</th><th scope="col">作用域</th><th scope="col">租约</th><th scope="col">加载 / 复用</th><th scope="col">命中 / 过期</th><th scope="col">释放</th><th scope="col">版本</th></tr></thead>
            <tbody>
              {resources.length === 0 ? <tr><td colSpan={8}>暂无可显示的资源快照</td></tr> : resources.map((resource) => (
                <tr key={resource.key}>
                  <th scope="row">{resource.name}</th>
                  <td><span className="resource-state" data-state={resource.state}>{RESOURCE_STATE_LABELS[resource.state]}</span></td>
                  <td>{RESOURCE_SCOPE_LABELS[resource.scope]}</td><td>{resource.leases}</td><td>{resource.loads} / {resource.sharedLoads}</td><td>{resource.cacheHits} / {resource.staleHits}</td><td>{resource.evictions}</td><td className="monitor-version">{resource.version?.slice(0, 8) ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card monitor-section" aria-labelledby="monitor-log-title">
        <div className="feature-heading">
          <div><h2 id="monitor-log-title">监控日志</h2><p>{lastCycle > 0 ? `最近完成第 ${lastCycle} 轮检查` : "等待首次监控检查"}</p></div>
        </div>
        <div className="monitor-log-scroll" role="log" tabIndex={0} aria-label="最近监控日志" aria-live="polite" aria-relevant="additions">
          {logs.length === 0 ? <p className="feature-empty">还没有监控记录。实时连接成功后可点击“立即检查”。</p> : (
            <table className="monitor-log-table">
              <caption>最近监控事件</caption>
              <tbody>{logs.slice(0, 50).map((log) => <tr key={log.id} data-status={log.status}><td>{log.time}</td><th scope="row">{MODULES.find((module) => module.key === log.module)?.label || "系统"}</th><td><strong>{statusLabel(log.status)}</strong><span>{log.detail}</span></td></tr>)}</tbody>
            </table>
          )}
        </div>
      </section>
    </main>
  );
}
