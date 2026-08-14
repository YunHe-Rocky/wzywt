"use client";

import { useEffect, useState, useCallback } from "react";
import type { HeroListItem } from "@/core/game";
import { getHeroes } from "./api";

export function useHeroes(roleType?: string, heroType?: string) {
  const [heroes, setHeroes] = useState<HeroListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchHeroes = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(false);
    try {
      const { ok, status, data } = await getHeroes({ roleType, heroType }, signal);
      if (!ok) throw new Error(`HTTP ${status}`);
      if (!signal?.aborted) setHeroes(Array.isArray(data) ? data : []);
    } catch {
      if (!signal?.aborted) setError(true);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [roleType, heroType]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchHeroes(controller.signal);
    return () => controller.abort();
  }, [fetchHeroes]);

  return { heroes, loading, error, refetch: () => fetchHeroes() };
}
