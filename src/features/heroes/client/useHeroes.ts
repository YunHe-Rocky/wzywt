"use client";

import { useEffect, useState, useCallback } from "react";
import type { HeroListItem } from "@/core/game";
import { getHeroes } from "./api";

export function useHeroes(roleType?: string, heroType?: string) {
  const [heroes, setHeroes] = useState<HeroListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchHeroes = useCallback(() => {
    setLoading(true);
    setError(false);
    getHeroes({ roleType, heroType })
      .then(({ ok, status, data }) => {
        if (!ok) throw new Error(`HTTP ${status}`);
        setHeroes(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => { setError(true); setLoading(false); });
  }, [roleType, heroType]);

  useEffect(() => { fetchHeroes(); }, [fetchHeroes]);

  return { heroes, loading, error, refetch: fetchHeroes };
}
