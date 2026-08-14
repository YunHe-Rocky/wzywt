"use client";

import { apiRequest, jsonRequest } from "@/features/shared/client/api";

const base = (tournamentId: string | number) => `/api/tournaments/${tournamentId}/matches`;
const matchBase = (tournamentId: string | number, matchId: string | number) => `${base(tournamentId)}/${matchId}`;

export function listMatches<T>(tournamentId: string | number) {
  return apiRequest<T>(base(tournamentId));
}

export function createMatch<T>(tournamentId: string | number, playedAt?: string) {
  return jsonRequest<T>(base(tournamentId), "POST", { playedAt });
}

export function getMatch<T>(tournamentId: string | number, matchId: string | number) {
  return apiRequest<T>(matchBase(tournamentId, matchId));
}

export function uploadScreenshot<T>(tournamentId: string | number, matchId: string | number, type: string, file: File) {
  const body = new FormData();
  body.set("file", file);
  return apiRequest<T>(`${matchBase(tournamentId, matchId)}/screenshots/${type}`, { method: "POST", body });
}

export function startRecognition<T>(tournamentId: string | number, matchId: string | number) {
  return jsonRequest<T>(`${matchBase(tournamentId, matchId)}/recognitions`, "POST");
}

export function confirmMatch<T>(tournamentId: string | number, matchId: string | number, input: unknown) {
  return jsonRequest<T>(`${matchBase(tournamentId, matchId)}/confirmation`, "PUT", input);
}

export function submitMatchRecord<T>(tournamentId: string | number, matchId: string | number, input: unknown) {
  return jsonRequest<T>(`${matchBase(tournamentId, matchId)}/submit`, "POST", input);
}

export function createDispute<T>(tournamentId: string | number, matchId: string | number, input: unknown) {
  return jsonRequest<T>(`${matchBase(tournamentId, matchId)}/disputes`, "POST", input);
}

export function correctMatch<T>(matchId: string | number, input: unknown) {
  return jsonRequest<T>(`/api/admin/matches/${matchId}/corrections`, "PATCH", input);
}
