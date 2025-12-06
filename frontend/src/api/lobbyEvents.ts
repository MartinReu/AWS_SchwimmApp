/**
 * SSE-Utilities für Lobby-Ereignisse (z. B. Löschung einer Lobby).
 * Stellt einen Subscribe-Helper bereit, der optional auf eine konkrete Lobby-ID filtert und bei Eintreffen den Callback feuert.
 */
import { DEFAULT_API_BASE_URL } from "./http";

export type LobbyDeletedEvent = {
  type: "LOBBY_DELETED";
  lobbyId: string;
  lobbyName?: string;
  removedPlayers?: number;
  removedRounds?: number;
  playerIds?: string[];
  timestamp?: string;
};

export type LobbyEventCallbacks = {
  onDeleted?: (event: LobbyDeletedEvent) => void;
  onError?: (error: Error) => void;
};

export type LobbyEventSubscribeOptions = {
  lobbyId?: string | null;
};

/**
 * Abonniert Lobby-bezogene SSE-Events (Thema "lobby") und ruft die Callbacks bei Löschung auf.
 * Gibt eine Cleanup-Funktion zurück, die den EventSource-Stream sauber schließt.
 */
export function subscribeLobbyEvents(
  { lobbyId, onDeleted, onError }: LobbyEventSubscribeOptions & LobbyEventCallbacks
): () => void {
  if (typeof window === "undefined" || typeof EventSource === "undefined") return () => {};

  const params = new URLSearchParams();
  if (lobbyId) params.set("lobbyId", lobbyId);
  params.set("topic", "lobby");

  const source = new EventSource(`${DEFAULT_API_BASE_URL}/events?${params.toString()}`);

  const handleLobbyDeleted = (event: MessageEvent<string>) => {
    try {
      const payload = JSON.parse(event.data) as LobbyDeletedEvent | null;
      if (!payload || payload.type !== "LOBBY_DELETED") return;
      onDeleted?.(payload);
    } catch (error) {
      onError?.(error as Error);
    }
  };

  source.addEventListener("lobby_deleted", handleLobbyDeleted);

  source.onerror = () => {
    onError?.(new Error("Lobby-Events unterbrochen"));
  };

  return () => {
    source.removeEventListener("lobby_deleted", handleLobbyDeleted);
    source.close();
  };
}
