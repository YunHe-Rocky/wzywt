"use client";

import { apiRequest, jsonRequest, type ApiResult } from "@/features/shared/client/api";

interface ErrorResponse {
  error?: string;
  [key: string]: unknown;
}

export function getHeroPowers(): Promise<ApiResult<ErrorResponse>> {
  return apiRequest("/api/users/me/heroes");
}

export function addHeroPower(body: {
  roleType: string;
  heroId: number;
  heroName: string;
  powerScore: number;
}): Promise<ApiResult<ErrorResponse>> {
  return jsonRequest("/api/users/me/heroes", "POST", body);
}

export function removeHeroPower(id: number): Promise<ApiResult<ErrorResponse>> {
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
