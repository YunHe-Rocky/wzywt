"use client";

import { apiRequest, type ApiResult } from "@/features/shared/client/api";
import type { HeroDetail, HeroListItem } from "@/core/game";

export function getHeroes<T = HeroListItem>(filters: {
  roleType?: string;
  heroType?: string;
} = {}): Promise<ApiResult<T[]>> {
  const params = new URLSearchParams();
  if (filters.roleType) params.set("role_type", filters.roleType);
  if (filters.heroType) params.set("hero_type", filters.heroType);
  const query = params.toString();
  return apiRequest<T[]>(`/api/heroes${query ? `?${query}` : ""}`);
}

export function getHero<T = HeroDetail>(
  heroId: string | number,
): Promise<ApiResult<T & { error?: string }>> {
  return apiRequest(`/api/heroes/${heroId}`);
}
