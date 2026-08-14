"use client";

import { useEffect, useState, useCallback } from "react";
import type { EquipDetail } from "@/core/game";
import { getEquipmentItem } from "./api";

export function useEquipmentItem(itemId: string | number) {
  const [item, setItem] = useState<EquipDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchItem = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const { data } = await getEquipmentItem(itemId, signal);
      if (!signal?.aborted) setItem(data.error ? null : data);
    } catch {
      if (!signal?.aborted) setItem(null);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [itemId]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchItem(controller.signal);
    return () => controller.abort();
  }, [fetchItem]);

  return { item, loading, refetch: () => fetchItem() };
}
