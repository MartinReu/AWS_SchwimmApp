/**
 * React-Hooks rund um den Lobby-Beitritt.
 * `useJoinOrRejoin` kapselt API-Aufrufe inklusive Pending/Error-State,
 * während Hilfsfunktionen Fehlermeldungen normalisieren und abfragbar machen.
 */
import { useCallback, useState } from "react";
import type { Player } from "../api";
import {
  joinOrRejoin as joinOrRejoinApi,
  type JoinOrRejoinParams,
  type JoinOrRejoinResponse,
  type JoinOrRejoinErrorCode,
  type PlayerLifeSnapshot,
} from "../api/lobbies";

export type JoinCallParams = JoinOrRejoinParams & {
  expectExisting?: boolean;
};

export type JoinSuccess = {
  player: Player;
  response: JoinOrRejoinResponse;
  mode: "join" | "rejoin";
  sessionId?: string | null;
  sessionReplaced?: boolean;
  playerLives?: PlayerLifeSnapshot | null;
};

export type JoinMutationError = Error & {
  code?: JoinOrRejoinErrorCode;
  response?: JoinOrRejoinResponse;
};

/**
 * Mutation-Hook für Join/Rejoin-Anfragen inkl. Pending/Error-State.
 * Erwartet JoinCallParams (Lobby-/Playerdaten, optional expectExisting) und liefert bei Erfolg Spieler + Modus.
 * Wird in Home- und GamePage genutzt, um Join-Buttons zu betreiben.
 */
export function useJoinOrRejoin() {
  const [isPending, setIsPending] = useState(false);
  const [lastError, setLastError] = useState<JoinMutationError | null>(null);

  /**
   * Führt den eigentlichen API-Call aus, entscheidet anhand expectExisting ob Response als Rejoin interpretiert wird,
   * und propagiert Fehler als JoinMutationError.
   */
  const perform = useCallback(async (params: JoinCallParams): Promise<JoinSuccess> => {
    const { expectExisting, ...apiParams } = params;
    setIsPending(true);
    setLastError(null);
    try {
      const response = await joinOrRejoinApi(apiParams);
      if (!response.ok || !response.player) {
        throw createResponseError(response);
      }
      const mode = resolveMode(response, expectExisting);
      return {
        player: response.player,
        response,
        mode,
        sessionId: response.sessionId ?? null,
        sessionReplaced: response.sessionReplaced === true,
        playerLives: response.playerLives ?? null,
      };
    } catch (error) {
      const mapped = toJoinMutationError(error);
      setLastError(mapped);
      throw mapped;
    } finally {
      setIsPending(false);
    }
  }, []);

  /** Setzt den letzten Fehler zurück; nützlich für erneute Versuche oder UI-Reset. */
  const resetError = useCallback(() => setLastError(null), []);

  return { joinOrRejoin: perform, isPending, error: lastError, resetError };
}

/** Mappt Fehlercodes auf sprechende Nutzerfehlermeldungen für UI-Anzeigen. */
export function getJoinErrorMessage(error: unknown): string {
  const normalized = toJoinMutationError(error);
  const code = normalized.code;
  if (code === "LOBBY_FULL" || code === "MAX_PLAYERS") {
    return "Lobby ist voll (max. 8 Spieler). Rejoin nur möglich, wenn dein Name inaktiv ist.";
  }
  if (code === "NAME_ACTIVE") {
    return "Dieser Name ist bereits aktiv. Schließe die andere Sitzung oder versuche es in wenigen Sekunden erneut.";
  }
  if (code === "NAME_TAKEN") {
    return "Name existiert bereits in dieser Lobby.";
  }
  return "Beitreten nicht möglich. Bitte erneut versuchen.";
}

/**
 * Bestimmt, ob eine erfolgreiche Join-Antwort als neuer Join oder Rejoin behandelt wird.
 * `expectExisting` deckt Fälle ab, bei denen das Backend kein `mode` liefert, aber wir aus UI-Sicht Rejoin erwarten.
 */
function resolveMode(response: JoinOrRejoinResponse, expectExisting?: boolean) {
  if (response.mode === "rejoin") return "rejoin";
  return expectExisting ? "rejoin" : "join";
}

/**
 * Wrappt Responses ohne ok-Flag oder missing player in einen Error inkl. Code,
 * damit der Hook dieselbe Fehlerpipeline nutzen kann wie bei Netzwerkfehlern.
 */
function createResponseError(response: JoinOrRejoinResponse): JoinMutationError {
  const err = new Error(response.message || "Beitreten nicht möglich.") as JoinMutationError;
  err.code = response.errorCode ?? "UNKNOWN";
  err.response = response;
  return err;
}

/** Type Guard für Fehler, die vom Hook erzeugt werden (z. B. in GamePage). */
export function isJoinMutationError(error: unknown): error is JoinMutationError {
  return error instanceof Error;
}

/**
 * Vereinheitlicht unbekannte Fehler zu JoinMutationError mit bestmöglichem Code,
 * damit UI/Funktionen stets über `code` verfügen.
 */
function toJoinMutationError(error: unknown): JoinMutationError {
  if (error instanceof Error) {
    const joinError = error as JoinMutationError;
    joinError.code = normalizeJoinErrorCode(joinError.code, error.message);
    return joinError;
  }
  const fallback = new Error("Beitreten nicht möglich.") as JoinMutationError;
  fallback.code = "UNKNOWN";
  return fallback;
}

/**
 * Heuristik zur Rückgewinnung eines Fehlercodes, falls das Backend nur Text liefert.
 * Nutzt bestehende Codes oder durchsucht die Meldung nach bekannten Phrasen.
 */
function normalizeJoinErrorCode(
  code: unknown,
  message?: string
): JoinOrRejoinErrorCode | undefined {
  if (typeof code === "string") {
    const upper = code.toUpperCase() as JoinOrRejoinErrorCode;
    if (upper === "LOBBY_FULL" || upper === "MAX_PLAYERS" || upper === "NAME_ACTIVE" || upper === "NAME_TAKEN" || upper === "UNKNOWN") {
      return upper;
    }
  }
  if (!message) return undefined;
  const normalized = message.toLowerCase();
  if (normalized.includes("lobby ist voll") || normalized.includes("lobby is full")) {
    return "LOBBY_FULL";
  }
  if (normalized.includes("bereits aktiv") || normalized.includes("already active")) {
    return "NAME_ACTIVE";
  }
  if (
    normalized.includes("vergeben") ||
    normalized.includes("duplicate") ||
    normalized.includes("exists") ||
    normalized.includes("existiert")
  ) {
    return "NAME_TAKEN";
  }
  return undefined;
}
