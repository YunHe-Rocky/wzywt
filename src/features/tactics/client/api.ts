"use client";

import { apiRequest, jsonRequest } from "@/features/shared/client/api";

const roomBase = (tournamentId: string | number, matchId: string | number, side: string) =>
  `/api/tournaments/${tournamentId}/matches/${matchId}/tactics/${side}`;

export function getTactics<T>(tournamentId: string | number, matchId: string | number, side: string) {
  return apiRequest<T>(roomBase(tournamentId, matchId, side));
}

export function createLayer<T>(tournamentId: string | number, matchId: string | number, side: string, input: unknown) {
  return jsonRequest<T>(roomBase(tournamentId, matchId, side), "POST", input);
}

export function updateLayer<T>(tournamentId: string | number, matchId: string | number, side: string, layerId: number, input: unknown) {
  return jsonRequest<T>(`${roomBase(tournamentId, matchId, side)}/layers/${layerId}`, "PATCH", input);
}

export function deleteLayer<T>(tournamentId: string | number, matchId: string | number, side: string, layerId: number, expectedUpdatedAt: string) {
  return jsonRequest<T>(`${roomBase(tournamentId, matchId, side)}/layers/${layerId}`, "DELETE", { expectedUpdatedAt });
}

export function saveRoute<T>(tournamentId: string | number, matchId: string | number, side: string, layerId: number, input: unknown) {
  return jsonRequest<T>(`${roomBase(tournamentId, matchId, side)}/layers/${layerId}/route`, "PUT", input);
}

export function deleteRoute<T>(tournamentId: string | number, matchId: string | number, side: string, routeId: number, expectedRevision: number) {
  return jsonRequest<T>(`${roomBase(tournamentId, matchId, side)}/routes/${routeId}`, "DELETE", { expectedRevision });
}

export function createMarker<T>(tournamentId: string | number, matchId: string | number, side: string, layerId: number, input: unknown) {
  return jsonRequest<T>(`${roomBase(tournamentId, matchId, side)}/layers/${layerId}/markers`, "POST", input);
}

export function updateMarker<T>(tournamentId: string | number, matchId: string | number, side: string, markerId: number, input: unknown) {
  return jsonRequest<T>(`${roomBase(tournamentId, matchId, side)}/markers/${markerId}`, "PATCH", input);
}

export function deleteMarker<T>(tournamentId: string | number, matchId: string | number, side: string, markerId: number, expectedRevision: number) {
  return jsonRequest<T>(`${roomBase(tournamentId, matchId, side)}/markers/${markerId}`, "DELETE", { expectedRevision });
}
