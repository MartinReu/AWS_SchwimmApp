/**
 * Router-Hook zur Ableitung von Lobbyname und Lobby-ID.
 * Nutzt URL-Parameter, Query-Strings und Session-Fallbacks,
 * damit Game-, Lose- und Win-Seiten den Kontext rekonstruieren können.
 */
import { useMemo } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { loadSession } from "../utils/session";

/** Liefert Lobbyname und -ID aus Route params, Query und Session-Fallback. */
export function useLobbyParams() {
  const params = useParams();
  const [sp] = useSearchParams();
  const lobbyNameParam = params.lobbyName ?? "";
  const queryLobbyId = sp.get("lobbyId") ?? "";
  const session = loadSession();

  const lobbyIdFromSession =
    session && sameLobbyName(session.lobbyName, lobbyNameParam)
      ? session.lobbyId
      : "";

  return useMemo(
    () => ({
      lobbyName: lobbyNameParam,
      lobbyId: queryLobbyId || lobbyIdFromSession || "",
    }),
    [lobbyIdFromSession, lobbyNameParam, queryLobbyId]
  );
}

/** Vergleicht zwei Lobbynamen case-/whitespace-insensitiv. */
function sameLobbyName(a: string, b: string) {
  return normalizeLobby(a) === normalizeLobby(b);
}

/** Hilfsfunktion zum Normalisieren von Lobbynamen (trim + lowercase). */
function normalizeLobby(v: string) {
  return (v || "").trim().toLowerCase();
}
