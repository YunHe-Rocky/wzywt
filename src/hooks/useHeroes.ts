"use client";

import { useEffect, useState, useCallback } from "react";
import type { HeroListItem } from "@/engine";

export function useHeroes(roleType?: string, heroType?: string) {
  const [heroes, setHeroes] = useState<HeroListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchHeroes = useCallback(() => {
    const params = new URLSearchParams();
    if (roleType) params.set("role_type", roleType);
    if (heroType) params.set("hero_type", heroType);
    setLoading(true);
    setError(false);
    fetch(`/api/heroes?${params.toString()}`)
      .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then((data) => { setHeroes(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, [roleType, heroType]);

  useEffect(() => { fetchHeroes(); }, [fetchHeroes]);

  return { heroes, loading, error, refetch: fetchHeroes };
}
