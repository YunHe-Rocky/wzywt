"use client";

import { useEffect, useState, useCallback } from "react";
import type { EquipListItem } from "@/core/game";
import { getEquipment } from "./api";

export function useEquipment() {
  const [items, setItems] = useState<EquipListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchItems = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(false);
    try {
      const { ok, status, data } = await getEquipment(signal);
      if (!ok) throw new Error(`HTTP ${status}`);
      if (!signal?.aborted) setItems(Array.isArray(data) ? data : []);
    } catch {
      if (!signal?.aborted) setError(true);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetchItems(controller.signal);
    return () => controller.abort();
  }, [fetchItems]);

  return { items, loading, error, refetch: () => fetchItems() };
}
