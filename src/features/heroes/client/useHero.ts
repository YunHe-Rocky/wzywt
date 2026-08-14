"use client";

import { useEffect, useState, useCallback } from "react";
import type { HeroDetail } from "@/core/game";
import { getHero } from "./api";

export function useHero(heroId: string | number) {
  const [hero, setHero] = useState<HeroDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchHero = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const { data } = await getHero(heroId, signal);
      if (!signal?.aborted) setHero(data.error ? null : data);
    } catch {
      if (!signal?.aborted) setHero(null);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [heroId]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchHero(controller.signal);
    return () => controller.abort();
  }, [fetchHero]);

  return { hero, loading, refetch: () => fetchHero() };
}
