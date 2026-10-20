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
  const [activeTab, setActiveTabState] = useState<string>("top");
  const [selHero, setSelHero] = useState("");
  const [selHeroName, setSelHeroName] = useState("");
  const [selPower, setSelPower] = useState("");
  const [saving, setSaving] = useState(false);
  const [animatingIdx, setAnimatingIdx] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [hasSavedPreferences, setHasSavedPreferences] = useState(false);
  const [loadRevision, setLoadRevision] = useState(0);
  const retry = useCallback(() => setLoadRevision(value => value + 1), []);

  const setActiveTab = useCallback((role: string) => {
    setActiveTabState(role);
    setSelHero(""); setSelHeroName(""); setSelPower("");
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError("");
    void Promise.all([
      getRolePreferences<{ preferences?: Pref[]; error?: string }>(controller.signal),
      getHeroPowers<{ heroPowers?: Record<string, HeroEntry[]>; error?: string }>(controller.signal),
    ]).then(([rolesResult, heroesResult]) => {
      if (controller.signal.aborted) return;
      if (!rolesResult.ok || rolesResult.data.error) throw new Error(rolesResult.data.error || "分路配置读取失败，请重试");
      if (!heroesResult.ok || heroesResult.data.error) throw new Error(heroesResult.data.error || "英雄战力读取失败，请重试");
      const settings = rolesResult.data.preferences?.length
        ? normalizeRolePreferenceSettings(rolesResult.data.preferences).sort((a, b) => a.preferenceRank - b.preferenceRank)
        : ROLES.map((roleType, i) => ({ roleType, preferenceRank: i + 1, roleRank: 0, peakScore: 0, peakRank: 0 }));
      setPrefs(settings);
      setHasSavedPreferences(Boolean(rolesResult.data.preferences?.length));
      setSharedRank(settings[0]?.roleRank || 0);
      setHeroesByRole(Object.fromEntries(ROLES.map(role => [role, heroesResult.data.heroPowers?.[role] || []])));
    }).catch(cause => {
      if (!controller.signal.aborted) setLoadError(cause instanceof Error ? cause.message : "分队配置读取失败，请检查网络后重试");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [loadRevision]);

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
    if (loading || loadError || prefs.length !== ROLES.length) { onError(loadError || "请等待分队配置完整读取后再保存"); return; }
    setSaving(true);
    try {
      const res = await updateRolePreferences(normalizeRolePreferenceSettings(prefs).map(p => ({
          role_type: p.roleType,
          preference_rank: p.preferenceRank,
          role_rank: p.roleRank,
          peak_score: p.peakScore,
          peak_rank: p.peakRank,
        })));
      if (res.ok) { setHasSavedPreferences(true); onSuccess(); } else onError("保存失败");
    } catch (error) {
      onError(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }, [prefs, loading, loadError]);

  const addHero = useCallback(async (role: string, onSuccess: () => void, onError: (msg: string) => void) => {
    if (!selHero || !selHeroName || !selPower) return;
    if (heroesByRole[role]?.some(hero => hero.heroId === Number(selHero))) {
      onError("该英雄已添加，请先删除原有战力项");
      return;
    }
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
        setHeroesByRole(p => ({ ...p, [role]: [...(p[role] || []).filter(hero => hero.heroId !== res.data.heroId), res.data] }));
        setSelHero(""); setSelHeroName(""); setSelPower("");
        onSuccess();
      } else {
        onError(res.data.error || "添加失败");
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : "添加失败");
    }
  }, [selHero, selHeroName, selPower, heroesByRole]);

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
    prefs, heroesByRole, sharedRank, activeTab, selHero, selHeroName, selPower, saving, loading, loadError, retry, hasSavedPreferences,
    setActiveTab, setSelHero, setSelHeroName, setSelPower,
    moveUp, moveDown, animatingIdx, setSharedRankAndSync, setPeakScore, setPeakRank, savePrefs, addHero, removeHero,
  };
}
