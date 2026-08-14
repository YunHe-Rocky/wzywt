"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/features/shared/client/api";

interface Stats {
  userCount: number;
  tournamentCount: number;
  activeTournamentCount: number;
  heroCount: number;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void apiRequest<Stats>("/api/admin/stats", { signal: controller.signal })
      .then(({ ok, data }) => { if (ok && !controller.signal.aborted) setStats(data); })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const cards = [
    { label: "用户总数", value: stats?.userCount, color: "text-[#4488f0]" },
    { label: "赛事总数", value: stats?.tournamentCount, color: "text-gold" },
    { label: "进行中赛事", value: stats?.activeTournamentCount, color: "text-[#00e5a0]" },
    { label: "英雄数量", value: stats?.heroCount, color: "text-[#7c5cfc]" },
  ];

  return (
    <div className="px-6 py-8">
      <h1 className="text-xl font-bold mb-6">仪表盘</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl p-5 border border-border-light"
            style={{ background: "rgba(255,255,255,0.5)", backdropFilter: "blur(12px)" }}>
            <div className="text-[11px] text-text-muted uppercase tracking-wider mb-2">{c.label}</div>
            <div className={`text-3xl font-bold ${c.color}`}>
              {stats ? c.value : "-"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
