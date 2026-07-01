"use client";

import { useEffect, useState, useCallback } from "react";
import type { EquipDetail } from "@/engine";

export function useEquipmentItem(itemId: string | number) {
  const [item, setItem] = useState<EquipDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchItem = useCallback(() => {
    setLoading(true);
    fetch(`/api/equipment/${itemId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setItem(null); setLoading(false); return; }
        setItem(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [itemId]);

  useEffect(() => { fetchItem(); }, [fetchItem]);

  return { item, loading, refetch: fetchItem };
}
