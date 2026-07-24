"use client";

import { apiRequest, jsonRequest, type ApiResult } from "@/features/shared/client/api";

interface TournamentResponse {
  error?: string;
  [key: string]: any;
}

export interface JoinRoomPreview {
  room: {
    id: number;
    code: string;
    name: string;
    deadline: string;
    status: string;
    isPublic: boolean;
    announcement: string | null;
    playerCount: number;
  };
  existing: boolean;
  canJoin: boolean;
  unavailableReason: string | null;
  error?: string;
}

export const listTournaments = (): Promise<ApiResult<TournamentResponse>> =>
  apiRequest("/api/tournaments");

export const createTournament = (body: {
  name: string;
  deadline: string;
  isPublic: boolean;
  announcement?: string;
}): Promise<ApiResult<TournamentResponse>> =>
  jsonRequest("/api/tournaments", "POST", body);

export const joinTournamentByCode = (code: string): Promise<ApiResult<JoinRoomPreview>> =>
  jsonRequest("/api/tournaments/join-by-code", "POST", { code });

export const getTournament = (id: string | number): Promise<ApiResult<TournamentResponse>> =>
  apiRequest(`/api/tournaments/${id}`);

export const joinTournament = (id: string | number): Promise<ApiResult<TournamentResponse>> =>
  apiRequest(`/api/tournaments/${id}/join`, { method: "POST" });

export const leaveTournament = (id: string | number): Promise<ApiResult<TournamentResponse>> =>
  apiRequest(`/api/tournaments/${id}/leave`, { method: "POST" });

export const splitTournament = <T = TournamentResponse>(
  id: string | number,
): Promise<ApiResult<T>> =>
  apiRequest(`/api/tournaments/${id}/split`, { method: "POST" });

export const extendTournament = (
  id: string | number,
  newDeadline: string,
): Promise<ApiResult<TournamentResponse>> =>
  jsonRequest(`/api/tournaments/${id}/extend`, "POST", { newDeadline });

export const updateTournament = (
  id: string | number,
  body: Record<string, unknown>,
): Promise<ApiResult<TournamentResponse>> =>
  jsonRequest(`/api/tournaments/${id}`, "PUT", body);

export const addTemporaryPlayer = (
  id: string | number,
  tempName: string,
): Promise<ApiResult<TournamentResponse>> =>
  jsonRequest(`/api/tournaments/${id}/temp-player`, "POST", { tempName });

export const resignTournamentAdmin = (
  id: string | number,
): Promise<ApiResult<TournamentResponse>> =>
  apiRequest(`/api/tournaments/${id}/admin/resign`, { method: "POST" });

export const updateTournamentAdmin = (
  id: string | number,
  targetUserId: number,
  action: "promote" | "demote",
): Promise<ApiResult<TournamentResponse>> =>
  jsonRequest(`/api/tournaments/${id}/admin`, "POST", { targetUserId, action });

export const kickTournamentPlayer = (
  id: string | number,
  targetUserId: number,
): Promise<ApiResult<TournamentResponse>> =>
  jsonRequest(`/api/tournaments/${id}/kick`, "POST", { targetUserId });

export const getTournamentPicks = (
  id: string | number,
): Promise<ApiResult<TournamentResponse>> =>
  apiRequest(`/api/tournaments/${id}/picks`);

export const updateTournamentPick = (
  id: string | number,
  body: Record<string, unknown>,
): Promise<ApiResult<TournamentResponse>> =>
  jsonRequest(`/api/tournaments/${id}/picks`, "PUT", body);
