"use client";

import { useEffect, useState, useCallback } from "react";
import type { HeroDetail } from "@/core/game";
import { getHero } from "./api";

export function useHero(heroId: string | number) {
  const [hero, setHero] = useState<HeroDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchHero = useCallback(() => {
    setLoading(true);
    getHero(heroId)
      .then(({ data }) => {
        if (data.error) { setHero(null); setLoading(false); return; }
        setHero(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [heroId]);

  useEffect(() => { fetchHero(); }, [fetchHero]);

  return { hero, loading, refetch: fetchHero };
}
