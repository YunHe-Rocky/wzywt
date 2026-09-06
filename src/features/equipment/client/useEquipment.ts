"use client";

import type { EquipListItem } from "@/core/game";
import { usePageResources } from "@/features/resource-scheduler/client";

export function useEquipment() {
  const { immediate, loading, error, loadResource, retry } = usePageResources("equipment");
  const items = (immediate["equipment.list"]?.data as EquipListItem[] | undefined) ?? [];
  return {
    items,
    loading,
    error: Boolean(error),
    refetch: () => error ? (retry(), Promise.resolve([])) : loadResource<EquipListItem[]>("equipment.list", true),
  };
}
