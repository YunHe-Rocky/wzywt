"use client";

import { apiRequest, jsonRequest, type ApiResult } from "@/features/shared/client/api";

export interface SessionUser {
  userId: number;
  username: string;
  role?: string;
  avatar?: string | null;
  gameNickname?: string | null;
  gameId?: string | null;
  securityQuestion?: string | null;
}

interface UserResponse {
  user: SessionUser | null;
}

interface ErrorResponse {
  error?: string;
  resetToken?: string;
  expiresIn?: number;
  [key: string]: unknown;
}

export function getCurrentUser(signal?: AbortSignal): Promise<ApiResult<UserResponse>> {
  return apiRequest<UserResponse>("/api/auth/me", { signal });
}

export function submitAuthentication(
  mode: "login" | "register",
  body: Record<string, unknown>,
): Promise<ApiResult<ErrorResponse>> {
  return jsonRequest<ErrorResponse>(`/api/auth/${mode}`, "POST", body);
}

export function getSecurityQuestion(
  username: string,
): Promise<ApiResult<ErrorResponse & { question?: string }>> {
  return apiRequest(`/api/auth/security-question?username=${encodeURIComponent(username)}`);
}

export function resetPassword(
  body: Record<string, unknown>,
): Promise<ApiResult<ErrorResponse>> {
  return jsonRequest("/api/auth/reset-password", "POST", body);
}

export function changePassword(
  body: Record<string, unknown>,
): Promise<ApiResult<ErrorResponse>> {
  return jsonRequest("/api/auth/change-password", "POST", body);
}

export function deleteAccount(answer: string): Promise<ApiResult<ErrorResponse>> {
  return jsonRequest("/api/auth/me", "DELETE", { answer });
}

export function logout(): Promise<ApiResult<ErrorResponse>> {
  return apiRequest("/api/auth/logout", { method: "POST" });
}
