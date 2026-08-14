"use client";

import { apiRequest, jsonRequest, type ApiResult } from "@/features/shared/client/api";

interface ErrorResponse {
  error?: string;
  [key: string]: unknown;
}

export function getRolePreferences<T = ErrorResponse>(signal?: AbortSignal): Promise<ApiResult<T>> {
  return apiRequest("/api/users/me/roles", { signal });
}

export function updateRolePreferences<T = ErrorResponse>(preferences: unknown): Promise<ApiResult<T>> {
  return jsonRequest("/api/users/me/roles", "PUT", { preferences });
}

export function getHeroPowers<T = ErrorResponse>(signal?: AbortSignal): Promise<ApiResult<T>> {
  return apiRequest("/api/users/me/heroes", { signal });
}

export function addHeroPower<T = ErrorResponse>(body: {
  roleType: string;
  heroId: number;
  heroName: string;
  powerScore: number;
}): Promise<ApiResult<T>> {
  return jsonRequest("/api/users/me/heroes", "POST", body);
}

export function removeHeroPower<T = ErrorResponse>(id: number): Promise<ApiResult<T>> {
  return apiRequest(`/api/users/me/heroes?id=${id}`, { method: "DELETE" });
}

export function uploadAvatar(file: File): Promise<ApiResult<ErrorResponse & { avatar?: string }>> {
  const formData = new FormData();
  formData.append("avatar", file);
  return apiRequest("/api/me/avatar", { method: "POST", body: formData });
}

export function updateGameProfile(body: {
  gameNickname: string;
  gameId: string;
}): Promise<ApiResult<ErrorResponse & {
  gameNickname?: string | null;
  gameId?: string | null;
}>> {
  return jsonRequest("/api/me/profile", "PATCH", body);
}
