"use client";

import { useCallback, useMemo, useState } from "react";
import type { HeroListItem } from "@/core/game";
import { usePageResources } from "@/features/resource-scheduler/client";

export function useHeroes(roleType?: string, heroType?: string) {
  const { immediate, leaseId, loading, error, loadResource, retry } = usePageResources("heroes");
  const [failedLease, setFailedLease] = useState<string | null>(null);
  const resourceData = immediate["heroes.list"]?.data as HeroListItem[] | undefined;
  const heroes = useMemo(() => (resourceData ?? []).filter((hero) =>
    (!roleType || hero.roleType === roleType || hero.secondaryRoleTypes?.includes(roleType))
    && (!heroType || String(hero.heroType) === heroType)), [heroType, resourceData, roleType]);
  const refetch = useCallback(async (): Promise<HeroListItem[]> => {
    if (error) {
      setFailedLease(null);
      retry();
      return [];
    }
    if (loading || !leaseId) return [];
    try {
      const items = await loadResource<HeroListItem[]>("heroes.list", true);
      setFailedLease(null);
      return items;
    } catch {
      setFailedLease(leaseId);
      return [];
    }
  }, [error, leaseId, loading, loadResource, retry]);
  return {
    heroes,
    loading,
    error: Boolean(error) || (failedLease !== null && failedLease === leaseId),
    refetch,
  };
}
