/**
 * Game-spezifische REST-Aufrufe (Runden, Lives, Finish).
 * Wird vom Game-, Lose- und Win-Screen genutzt, um Live-Daten zu erhalten und Aktionen zu triggern.
 */
import { DEFAULT_API_BASE_URL, parseJson } from "./http";
import type { LifeState, Round, Score } from "./types";

const API_BASE = DEFAULT_API_BASE_URL;

/** Lädt die aktuelle Runde einer Lobby inkl. Lives & Scores. */
export async function getCurrentRound(
  lobbyId: string
): Promise<{ round: Round; lives: LifeState[]; scores: Score[] }> {
  const res = await fetch(`${API_BASE}/rounds/current?lobbyId=${encodeURIComponent(lobbyId)}`);
  return parseJson(res);
}

/** Startet eine neue Runde und liefert das Lives-Setup zurück. */
export async function startNextRound(
  lobbyId: string
): Promise<{ round: Round; lives: LifeState[] }> {
  const res = await fetch(`${API_BASE}/rounds/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lobbyId }),
  });
  return parseJson(res);
}

/** PATCH-Endpoint zum Aktualisieren der Leben eines Spielers. */
export async function updateLife(roundId: string, playerId: string, livesRemaining: number): Promise<LifeState> {
  const res = await fetch(`${API_BASE}/rounds/${encodeURIComponent(roundId)}/life`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ playerId, livesRemaining }),
  });
  return parseJson(res);
}

/** Markiert eine Runde als beendet und vergibt Punkte. */
export async function finishRound(roundId: string, winnerPlayerId: string,): Promise<{ round: Round; scores: Score[] }> {
  const res = await fetch(`${API_BASE}/rounds/${encodeURIComponent(roundId)}/finish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ winnerPlayerId, finishedByPlayerId: winnerPlayerId }),
  });
  return parseJson(res);
}
