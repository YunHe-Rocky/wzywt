"use client";

import { useEffect, useState, useCallback } from "react";
import type { EquipListItem } from "@/core/game";
import { getEquipment } from "./api";

export function useEquipment() {
  const [items, setItems] = useState<EquipListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchItems = useCallback(() => {
    setLoading(true);
    setError(false);
    getEquipment()
      .then(({ ok, status, data }) => {
        if (!ok) throw new Error(`HTTP ${status}`);
        setItems(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => { setError(true); setLoading(false); });
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  return { items, loading, error, refetch: fetchItems };
}
