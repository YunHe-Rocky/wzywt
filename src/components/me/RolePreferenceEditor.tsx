"use client";

import { useEffect, useState } from "react";

const ROLE_LABELS: Record<string, string> = {
  top: "对抗路", jungle: "打野", mid: "中路", adc: "发育路", support: "游走",
};

interface Pref { roleType: string; preferenceRank: number }

export function RolePreferenceEditor() {
  const [prefs, setPrefs] = useState<Pref[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch("/api/users/me/roles").then((r) => r.json()).then((d) => {
      if (d.preferences?.length) {
        setPrefs(d.preferences.sort((a: Pref, b: Pref) => a.preferenceRank - b.preferenceRank));
      } else {
        setPrefs([
          { roleType: "top", preferenceRank: 1 },
          { roleType: "jungle", preferenceRank: 2 },
          { roleType: "mid", preferenceRank: 3 },
          { roleType: "adc", preferenceRank: 4 },
          { roleType: "support", preferenceRank: 5 },
        ]);
      }
    });
  }, []);

  function moveUp(index: number) {
    if (index === 0) return;
    const next = [...prefs];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    setPrefs(next.map((p, i) => ({ ...p, preferenceRank: i + 1 })));
  }

  function moveDown(index: number) {
    if (index === 4) return;
    const next = [...prefs];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    setPrefs(next.map((p, i) => ({ ...p, preferenceRank: i + 1 })));
  }

  async function save() {
    setSaving(true);
    setMsg("");
    const res = await fetch("/api/users/me/roles", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preferences: prefs }),
    });
    setSaving(false);
    setMsg(res.ok ? "保存成功" : "保存失败");
  }

  return (
    <div className="bg-gray-900 rounded-lg p-6">
      <h2 className="text-lg font-bold mb-4">分路偏好排序</h2>
      <p className="text-sm text-gray-400 mb-4">从最想玩到最不想玩排列，系统分队时会尽量满足</p>
      <div className="space-y-2">
        {prefs.map((p, i) => (
          <div key={p.roleType} className="flex items-center gap-3 bg-gray-800 rounded px-4 py-3">
            <span className="text-gray-500 w-6 text-center">{i + 1}</span>
            <span className="flex-1">{ROLE_LABELS[p.roleType]}</span>
            <button onClick={() => moveUp(i)} disabled={i === 0}
              className="px-2 py-1 text-xs bg-gray-700 rounded hover:bg-gray-600 disabled:opacity-30">↑</button>
            <button onClick={() => moveDown(i)} disabled={i === 4}
              className="px-2 py-1 text-xs bg-gray-700 rounded hover:bg-gray-600 disabled:opacity-30">↓</button>
          </div>
        ))}
      </div>
      <button onClick={save} disabled={saving}
        className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm disabled:opacity-50">
        {saving ? "保存中..." : "保存"}
      </button>
      {msg && <p className={`mt-2 text-sm ${msg === "保存成功" ? "text-green-400" : "text-red-400"}`}>{msg}</p>}
    </div>
  );
}
