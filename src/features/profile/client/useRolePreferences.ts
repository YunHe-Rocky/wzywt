"use client";

import { useEffect, useState, useCallback } from "react";
import { normalizeHeroPowerScore } from "@/core/game";
import {
  normalizePeakScore,
  normalizeRolePreferenceSettings,
} from "@/features/profile/model";
import {
  addHeroPower,
  getHeroPowers,
  getRolePreferences,
  removeHeroPower,
  updateRolePreferences,
} from "@/features/profile/client/api";

const ROLES = ["top", "jungle", "mid", "adc", "support"] as const;

interface Pref { roleType: string; preferenceRank: number; roleRank: number; peakScore: number; peakRank: number; }
interface HeroEntry { id: number; heroId: number; heroName: string; powerScore: number; }

export function useRolePreferences() {
  const [prefs, setPrefs] = useState<Pref[]>([]);
  const [heroesByRole, setHeroesByRole] = useState<Record<string, HeroEntry[]>>({});
  const [sharedRank, setSharedRank] = useState(0);
  const [activeTab, setActiveTab] = useState<string>("top");
  const [selHero, setSelHero] = useState("");
  const [selHeroName, setSelHeroName] = useState("");
  const [selPower, setSelPower] = useState("");
  const [saving, setSaving] = useState(false);
  const [animatingIdx, setAnimatingIdx] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void getRolePreferences<{ preferences?: Pref[] }>(controller.signal).then(({ data }) => {
      if (controller.signal.aborted) return;
      if (data.preferences?.length) {
        const s = normalizeRolePreferenceSettings(data.preferences)
          .sort((a, b) => a.preferenceRank - b.preferenceRank);
        setPrefs(s); setSharedRank(s[0]?.roleRank || 0);
      } else {
        setPrefs(ROLES.map((r, i) => ({ roleType: r, preferenceRank: i + 1, roleRank: 0, peakScore: 0, peakRank: 0 })));
      }
    }).catch(() => {
      if (!controller.signal.aborted) setPrefs(ROLES.map((r, i) => ({ roleType: r, preferenceRank: i + 1, roleRank: 0, peakScore: 0, peakRank: 0 })));
    });
    void getHeroPowers<{ heroPowers?: Record<string, HeroEntry[]> }>(controller.signal).then(({ data }) => {
      if (!controller.signal.aborted && data.heroPowers) {
        const grouped: Record<string, HeroEntry[]> = {};
        ROLES.forEach((role) => { grouped[role] = data.heroPowers?.[role] || []; });
        setHeroesByRole(grouped);
      }
    }).catch(() => undefined);
    return () => controller.abort();
  }, []);

  const moveUp = useCallback((i: number) => {
    if (i === 0) return; setAnimatingIdx(i);
    const n = [...prefs]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; setPrefs(n.map((p, j) => ({ ...p, preferenceRank: j + 1 })));
    setTimeout(() => setAnimatingIdx(null), 300);
  }, [prefs]);

  const moveDown = useCallback((i: number) => {
    if (i === 4) return; setAnimatingIdx(i);
    const n = [...prefs]; [n[i], n[i + 1]] = [n[i + 1], n[i]]; setPrefs(n.map((p, j) => ({ ...p, preferenceRank: j + 1 })));
    setTimeout(() => setAnimatingIdx(null), 300);
  }, [prefs]);

  const setSharedRankAndSync = useCallback((r: number) => { setSharedRank(r); setPrefs(prev => prev.map(p => ({ ...p, roleRank: r }))); }, []);
  const setPeakScore = useCallback((role: string, score: number) => {
    setPrefs(prev => prev.map(p => (
      p.roleType === role
        ? { ...p, peakScore: normalizePeakScore(p.peakRank, score) }
        : p
    )));
  }, []);
  const setPeakRank = useCallback((role: string, rank: number) => {
    setPrefs(prev => prev.map(p => (
      role === "all" || p.roleType === role
        ? { ...p, peakRank: rank, peakScore: normalizePeakScore(rank, p.peakScore) }
        : p
    )));
  }, []);

  const savePrefs = useCallback(async (onSuccess: () => void, onError: (msg: string) => void) => {
    setSaving(true);
    try {
      const res = await updateRolePreferences(normalizeRolePreferenceSettings(prefs).map(p => ({
          role_type: p.roleType,
          preference_rank: p.preferenceRank,
          role_rank: p.roleRank,
          peak_score: p.peakScore,
          peak_rank: p.peakRank,
        })));
      res.ok ? onSuccess() : onError("保存失败");
    } catch (error) {
      onError(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }, [prefs]);

  const addHero = useCallback(async (role: string, onSuccess: () => void, onError: (msg: string) => void) => {
    if (!selHero || !selHeroName || !selPower) return;
    let powerScore: number;
    try {
      powerScore = normalizeHeroPowerScore(selPower);
    } catch (error) {
      onError(error instanceof Error ? error.message : "英雄战力无效");
      return;
    }
    try {
      const res = await addHeroPower<HeroEntry & { error?: string }>({ roleType: role, heroId: parseInt(selHero), heroName: selHeroName, powerScore });
      if (res.ok) {
        setHeroesByRole(p => ({ ...p, [role]: [...(p[role] || []), res.data] }));
        setSelHero(""); setSelHeroName(""); setSelPower("");
        onSuccess();
      } else {
        onError(res.data.error || "添加失败");
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : "添加失败");
    }
  }, [selHero, selHeroName, selPower]);

  const removeHero = useCallback(async (id: number, role: string, onSuccess: () => void) => {
    try {
      const result = await removeHeroPower(id);
      if (!result.ok) return;
      setHeroesByRole(p => ({ ...p, [role]: p[role].filter(h => h.id !== id) }));
      onSuccess();
    } catch {
      // Keep local state unchanged when the server mutation is not confirmed.
    }
  }, []);

  return {
    prefs, heroesByRole, sharedRank, activeTab, selHero, selHeroName, selPower, saving,
    setActiveTab, setSelHero, setSelHeroName, setSelPower,
    moveUp, moveDown, animatingIdx, setSharedRankAndSync, setPeakScore, setPeakRank, savePrefs, addHero, removeHero,
  };
}
