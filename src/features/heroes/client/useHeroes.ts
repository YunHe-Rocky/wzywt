"use client";

import { useMemo } from "react";
import type { HeroListItem } from "@/core/game";
import { usePageResources } from "@/features/resource-scheduler/client";

export function useHeroes(roleType?: string, heroType?: string) {
  const { immediate, loading, error, loadResource } = usePageResources("heroes");
  const resourceData = immediate["heroes.list"]?.data as HeroListItem[] | undefined;
  const heroes = useMemo(() => (resourceData ?? []).filter((hero) =>
    (!roleType || hero.roleType === roleType || hero.secondaryRoleTypes?.includes(roleType))
    && (!heroType || String(hero.heroType) === heroType)), [heroType, resourceData, roleType]);
  return {
    heroes,
    loading,
    error: Boolean(error),
    refetch: () => loadResource<HeroListItem[]>("heroes.list", true),
  };
}
