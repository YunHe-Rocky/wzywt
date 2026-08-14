"use client";

import { apiRequest, type ApiResult } from "@/features/shared/client/api";
import type { EquipDetail, EquipListItem } from "@/core/game";

export function getEquipment<T = EquipListItem>(signal?: AbortSignal): Promise<ApiResult<T[]>> {
  return apiRequest("/api/equipment", { signal });
}

export function getEquipmentItem<T = EquipDetail>(
  itemId: string | number,
  signal?: AbortSignal,
): Promise<ApiResult<T & { error?: string }>> {
  return apiRequest(`/api/equipment/${itemId}`, { signal });
}
