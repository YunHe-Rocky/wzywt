"use client";

import { apiRequest, type ApiResult } from "@/features/shared/client/api";
import type { EquipDetail, EquipListItem } from "@/core/game";

export function getEquipment<T = EquipListItem>(): Promise<ApiResult<T[]>> {
  return apiRequest("/api/equipment");
}

export function getEquipmentItem<T = EquipDetail>(
  itemId: string | number,
): Promise<ApiResult<T & { error?: string }>> {
  return apiRequest(`/api/equipment/${itemId}`);
}
