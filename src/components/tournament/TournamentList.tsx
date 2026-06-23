"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Tournament {
  id: number; name: string; code: string; deadline: string; status: string;
  _count: { players: number };
  admins: { userId: number; role: string }[];
}

export function TournamentList() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [deadline, setDeadline] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  useEffect(() => { refresh(); }, []);

  async function refresh() {
    const res = await fetch("/api/tournaments");
    const data = await res.json();
    if (data.tournaments) setTournaments(data.tournaments);
  }

  async function create() {
    setError("");
    if (!name || !deadline) { setError("请填写完整"); return; }
    const res = await fetch("/api/tournaments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, deadline: new Date(deadline).toISOString() }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error); return; }
    setShowCreate(false);
    setName("");
    setDeadline("");
    refresh();
    router.push(`/tournaments/${data.tournament.id}`);
  }

  async function joinByCode() {
    setError("");
    if (!joinCode.trim()) { setError("请输入赛事号"); return; }
    const res = await fetch("/api/tournaments/join-by-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: joinCode.trim() }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error); return; }
    router.push(`/tournaments/${data.tournamentId}`);
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">赛事大厅</h1>
        <button onClick={() => setShowCreate(!showCreate)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm">
          {showCreate ? "取消" : "创建赛事"}
        </button>
      </div>

      {/* Join by code */}
      <div className="bg-gray-900 rounded-lg p-4 mb-6 flex gap-3">
        <input type="text" placeholder="输入6位赛事号" value={joinCode}
          onChange={(e) => setJoinCode(e.target.value)} maxLength={6}
          className="flex-1 px-3 py-2 bg-gray-800 rounded border border-gray-700 outline-none focus:border-blue-500" />
        <button onClick={joinByCode}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm whitespace-nowrap">
          加入赛事
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="bg-gray-900 rounded-lg p-6 mb-6 space-y-4">
          <input type="text" placeholder="赛事名称" value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 bg-gray-800 rounded border border-gray-700 outline-none focus:border-blue-500" />
          <input type="datetime-local" value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className="w-full px-3 py-2 bg-gray-800 rounded border border-gray-700 outline-none focus:border-blue-500" />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button onClick={create}
            className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded text-sm">创建</button>
        </div>
      )}

      {/* Tournament list */}
      {tournaments.length === 0 ? (
        <p className="text-gray-400 text-center py-8">暂无赛事，创建一个吧</p>
      ) : (
        <div className="space-y-3">
          {tournaments.map((t) => (
            <button key={t.id} onClick={() => router.push(`/tournaments/${t.id}`)}
              className="w-full text-left bg-gray-900 rounded-lg p-4 hover:bg-gray-800 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium">{t.name}</span>
                  <span className="ml-3 text-sm text-gray-400">#{t.code}</span>
                </div>
                <div className="text-sm text-gray-400">
                  <span className="mr-3">{t._count.players}人</span>
                  <span>{new Date(t.deadline).toLocaleString("zh-CN")}</span>
                </div>
              </div>
              <div className="mt-1">
                <span className={`text-xs px-2 py-0.5 rounded ${
                  t.status === "recruiting" ? "bg-green-900 text-green-300" :
                  t.status === "locked" ? "bg-yellow-900 text-yellow-300" : "bg-gray-700 text-gray-400"
                }`}>
                  {t.status === "recruiting" ? "报名中" : t.status === "locked" ? "已锁定" : "已结束"}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
