/**
 * SSE-Client für Rundenevents (aktuell nur ROUND_FINISHED).
 * Bindet die EventSource an eine Lobby und leitet Statusänderungen an Callbacks weiter.
 */
import { DEFAULT_API_BASE_URL } from "./http";
import type { Round, Score } from "./types";

export type RoundFinishedEvent = {
  type: "ROUND_FINISHED";
  lobbyId: string;
  roundId: string;
  round?: Round;
  scores?: Score[];
};

export type RoundEventCallbacks = {
  onFinished?: (event: RoundFinishedEvent) => void;
  onError?: (error: Error) => void;
};

export type RoundEventSubscribeOptions = {
  lobbyId?: string | null;
};

/**
 * Subscribed auf Round-bezogene SSE-Events (z. B. ROUND_FINISHED) für eine Lobby.
 * Liefert eine Cleanup-Funktion, die den EventSource-Stream schließt.
 */
export function subscribeRoundEvents(
  { lobbyId, onFinished, onError }: RoundEventSubscribeOptions & RoundEventCallbacks
): () => void {
  if (typeof window === "undefined" || typeof EventSource === "undefined") return () => {};

  const params = new URLSearchParams();
  if (lobbyId) params.set("lobbyId", lobbyId);
  params.set("topic", "round");

  const source = new EventSource(`${DEFAULT_API_BASE_URL}/events?${params.toString()}`);

  const handleRoundFinished = (event: MessageEvent<string>) => {
    try {
      const payload = JSON.parse(event.data) as RoundFinishedEvent | null;
      if (!payload || payload.type !== "ROUND_FINISHED") return;
      onFinished?.(payload);
    } catch (error) {
      onError?.(error as Error);
    }
  };

  source.addEventListener("round_finished", handleRoundFinished);

  source.onerror = () => {
    onError?.(new Error("Round-Events unterbrochen"));
  };

  return () => {
    source.removeEventListener("round_finished", handleRoundFinished);
    source.close();
  };
}
