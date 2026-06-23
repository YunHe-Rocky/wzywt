"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

interface PlayerInfo {
  userId: number; user: { id: number; username: string };
  isTemporary: boolean; tempName: string | null; isSpectator: boolean;
}
interface Tournament {
  id: number; name: string; code: string; deadline: string; status: string;
  players: PlayerInfo[];
  admins: { userId: number; role: string; user: { id: number; username: string } }[];
  applications: { id: number; tempName: string | null; applicant: { id: number; username: string } }[];
}
interface SplitResult {
  teamRed: { userId: number; roleType: string }[];
  teamBlue: { userId: number; roleType: string }[];
  powerDiff: number;
  preferenceScore: number;
  playerDetails: { userId: number; username: string; peakPower: number }[];
}

const ROLE_LABELS: Record<string, string> = {
  top: "对抗路", jungle: "打野", mid: "中路", adc: "发育路", support: "游走",
};

export function TournamentDetail() {
  const params = useParams();
  const id = params.id as string;
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [splitResult, setSplitResult] = useState<SplitResult | null>(null);
  const [adminMsg, setAdminMsg] = useState("");
  const [me, setMe] = useState<{ userId: number } | null>(null);

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => setMe(d.user));
    refreshTournament();
  }, [id]);

  async function refreshTournament() {
    const res = await fetch(`/api/tournaments/${id}`);
    if (res.ok) {
      const data = await res.json();
      setTournament(data.tournament);
    }
  }

  async function join() {
    const res = await fetch(`/api/tournaments/${id}/join`, { method: "POST" });
    if (res.ok) refreshTournament();
    else { const d = await res.json(); setAdminMsg(d.error); }
  }

  async function leave() {
    const res = await fetch(`/api/tournaments/${id}/leave`, { method: "POST" });
    if (res.ok) refreshTournament();
    else { const d = await res.json(); setAdminMsg(d.error); }
  }

  async function doSplit() {
    setAdminMsg("");
    const res = await fetch(`/api/tournaments/${id}/split`, { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      setSplitResult(data);
      setTournament((prev) => prev ? { ...prev, status: "locked" } : null);
    } else {
      setAdminMsg(data.error || "分队失败");
    }
  }

  async function doExtend() {
    const newDeadline = prompt("新截止时间（如 2026-06-30T20:00）：");
    if (!newDeadline) return;
    setAdminMsg("");
    const res = await fetch(`/api/tournaments/${id}/extend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newDeadline: new Date(newDeadline).toISOString() }),
    });
    if (res.ok) { refreshTournament(); setAdminMsg("已延长"); }
    else { const d = await res.json(); setAdminMsg(d.error); }
  }

  if (!tournament) return <div className="p-8 text-center text-gray-400">加载中...</div>;

  const isAdmin = tournament.admins.some((a) => a.userId === me?.userId);
  const isOwner = tournament.admins.some((a) => a.userId === me?.userId && a.role === "owner");
  const isPlayer = tournament.players.some((p) => p.userId === me?.userId);
  const playerCount = tournament.players.filter((p) => !p.isSpectator).length;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{tournament.name}</h1>
          <p className="text-sm text-gray-400 mt-1">
            #{tournament.code} · 截止 {new Date(tournament.deadline).toLocaleString("zh-CN")}
            {tournament.status === "recruiting" ? ` · ${playerCount}人已报名` : ""}
          </p>
        </div>
        <span className={`px-3 py-1 rounded text-sm ${
          tournament.status === "recruiting" ? "bg-green-900 text-green-300" :
          tournament.status === "locked" ? "bg-yellow-900 text-yellow-300" : "bg-gray-700 text-gray-400"
        }`}>
          {tournament.status === "recruiting" ? "报名中" : tournament.status === "locked" ? "已锁定" : "已结束"}
        </span>
      </div>

      {adminMsg && <p className={`text-sm ${adminMsg.includes("成功") || adminMsg.includes("延长") ? "text-green-400" : "text-red-400"}`}>{adminMsg}</p>}

      {/* Player List */}
      <div className="bg-gray-900 rounded-lg p-6">
        <h2 className="font-bold mb-3">选手列表 ({playerCount}人)</h2>
        <div className="flex flex-wrap gap-2">
          {tournament.players.map((p) => (
            <span key={p.userId} className={`px-3 py-1 rounded text-sm ${
              p.isSpectator ? "bg-gray-700 text-gray-400" : "bg-blue-900 text-blue-200"
            }`}>
              {p.isTemporary ? (p.tempName || "临时选手") : p.user.username}
              {p.isSpectator && " 📺"}
            </span>
          ))}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3">
        {tournament.status === "recruiting" && !isPlayer && (
          <button onClick={join} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm">加入赛事</button>
        )}
        {tournament.status === "recruiting" && isPlayer && !isOwner && (
          <button onClick={leave} className="px-4 py-2 bg-red-600 hover:bg-red-500 rounded text-sm">退出赛事</button>
        )}
        {(tournament.status === "recruiting" || tournament.status === "locked") && isAdmin && (
          <button onClick={doSplit} className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded text-sm">
            分队 ({playerCount}人)
          </button>
        )}
        {(tournament.status === "recruiting" || tournament.status === "locked") && isAdmin && (
          <button onClick={doExtend} className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 rounded text-sm">延长截止</button>
        )}
      </div>

      {/* Split Result */}
      {splitResult && (
        <div className="grid grid-cols-2 gap-6">
          <div className="bg-red-900/30 rounded-lg p-6 border border-red-800">
            <h3 className="font-bold text-lg text-red-400 mb-3">红队</h3>
            <div className="space-y-2">
              {splitResult.teamRed.map((p) => {
                const detail = splitResult.playerDetails.find((d) => d.userId === p.userId);
                return (
                  <div key={p.userId} className="flex justify-between text-sm">
                    <span>{detail?.username || "?"}</span>
                    <span className="text-gray-400">{ROLE_LABELS[p.roleType]} · {detail?.peakPower || 0}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="bg-blue-900/30 rounded-lg p-6 border border-blue-800">
            <h3 className="font-bold text-lg text-blue-400 mb-3">蓝队</h3>
            <div className="space-y-2">
              {splitResult.teamBlue.map((p) => {
                const detail = splitResult.playerDetails.find((d) => d.userId === p.userId);
                return (
                  <div key={p.userId} className="flex justify-between text-sm">
                    <span>{detail?.username || "?"}</span>
                    <span className="text-gray-400">{ROLE_LABELS[p.roleType]} · {detail?.peakPower || 0}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="col-span-2 text-center text-sm text-gray-400">
            战力差: {splitResult.powerDiff} · 偏好分: {splitResult.preferenceScore}
          </div>
        </div>
      )}
    </div>
  );
}
