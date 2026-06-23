"use client";

import { useEffect, useState } from "react";

const ROLE_LABELS: Record<string, string> = {
  top: "对抗路", jungle: "打野", mid: "中路", adc: "发育路", support: "游走",
};
const ROLES = ["top", "jungle", "mid", "adc", "support"];

interface HeroEntry { id: number; heroId: number; heroName: string; powerScore: number }
interface HeroOption { heroId: number; name: string; title: string }

export function HeroPowerEditor() {
  const [grouped, setGrouped] = useState<Record<string, HeroEntry[]>>({});
  const [heroOptions, setHeroOptions] = useState<Record<string, HeroOption[]>>({});
  const [activeRole, setActiveRole] = useState<string | null>(null);
  const [selectedHero, setSelectedHero] = useState("");
  const [powerScore, setPowerScore] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch("/api/users/me/heroes").then((r) => r.json()).then((d) => {
      if (d.heroPowers) setGrouped(d.heroPowers);
    });
  }, []);

  async function loadHeroes(role: string) {
    if (heroOptions[role]) { setActiveRole(role); return; }
    const res = await fetch(`/api/heroes?role_type=${role}`);
    const data = await res.json();
    setHeroOptions((prev) => ({ ...prev, [role]: data }));
    setActiveRole(role);
  }

  async function addHero() {
    if (!activeRole || !selectedHero || !powerScore) return;
    const hero = heroOptions[activeRole]?.find((h) => String(h.heroId) === selectedHero);
    if (!hero) return;

    setMsg("");
    const res = await fetch("/api/users/me/heroes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roleType: activeRole,
        heroId: hero.heroId,
        heroName: hero.name,
        powerScore: parseInt(powerScore),
      }),
    });
    if (res.ok) {
      const created = await res.json();
      setGrouped((prev) => ({
        ...prev,
        [activeRole]: [...(prev[activeRole] || []), created],
      }));
      setSelectedHero("");
      setPowerScore("");
      setMsg("添加成功");
    } else {
      const err = await res.json();
      setMsg(err.error || "添加失败");
    }
  }

  async function removeHero(id: number, role: string) {
    await fetch(`/api/users/me/heroes?id=${id}`, { method: "DELETE" });
    setGrouped((prev) => ({
      ...prev,
      [role]: prev[role].filter((h) => h.id !== id),
    }));
  }

  return (
    <div className="bg-gray-900 rounded-lg p-6">
      <h2 className="text-lg font-bold mb-4">英雄战力</h2>
      <p className="text-sm text-gray-400 mb-4">每个分路选1-3个擅长的英雄，填写战力</p>
      <div className="space-y-4">
        {ROLES.map((role) => (
          <div key={role}>
            <button onClick={() => loadHeroes(role)}
              className="text-left w-full flex items-center justify-between bg-gray-800 rounded px-4 py-3 hover:bg-gray-700">
              <span>{ROLE_LABELS[role]}</span>
              <span className="text-sm text-gray-400">
                {(grouped[role] || []).map((h) => `${h.heroName}(${h.powerScore})`).join(", ") || "未选择"}
              </span>
            </button>
            {activeRole === role && (
              <div className="mt-2 ml-4 space-y-2">
                {(grouped[role] || []).map((h) => (
                  <div key={h.id} className="flex items-center gap-2 text-sm">
                    <span className="text-gray-300">{h.heroName} — {h.powerScore} 战力</span>
                    <button onClick={() => removeHero(h.id, role)}
                      className="text-red-400 hover:text-red-300 text-xs">删除</button>
                  </div>
                ))}
                {(grouped[role] || []).length < 3 && (
                  <div className="flex items-center gap-2">
                    <select value={selectedHero} onChange={(e) => setSelectedHero(e.target.value)}
                      className="bg-gray-800 rounded px-2 py-1 text-sm border border-gray-700">
                      <option value="">选择英雄</option>
                      {(heroOptions[role] || []).map((h) => (
                        <option key={h.heroId} value={h.heroId}>{h.name} ({h.title})</option>
                      ))}
                    </select>
                    <input type="number" placeholder="战力" value={powerScore}
                      onChange={(e) => setPowerScore(e.target.value)}
                      className="w-24 bg-gray-800 rounded px-2 py-1 text-sm border border-gray-700" />
                    <button onClick={addHero}
                      className="px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded text-sm">添加</button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      {msg && <p className={`mt-2 text-sm ${msg === "添加成功" ? "text-green-400" : "text-red-400"}`}>{msg}</p>}
    </div>
  );
}
