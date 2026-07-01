"use client";

import { useEffect, useState, useCallback } from "react";
import type { EquipListItem } from "@/engine";

export function useEquipment() {
  const [items, setItems] = useState<EquipListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchItems = useCallback(() => {
    setLoading(true);
    setError(false);
    fetch("/api/equipment")
      .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then((data) => { setItems(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  return { items, loading, error, refetch: fetchItems };
}
