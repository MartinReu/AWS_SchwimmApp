/**
 * Presence-Helfer, der regelmäßige Heartbeats an das Backend schickt.
 * Damit erkennt der Server, ob ein Spieler noch aktiv ist und hält Slots bei Tab-Wechseln oder kurzen Unterbrechungen frei.
 * Wird auf Game/Lose/Win-Seiten gestartet und stoppt automatisch bei Visibility- oder Pagehide-Events.
 */
import { presencePing } from "../api/lobbies";

type PresenceOptions = {
  lobbyId?: string | null;
  playerId?: string | null;
  clientSessionId?: string | null;
  intervalMs?: number;
};

type ActivePresenceOptions = {
  lobbyId: string;
  playerId: string;
  clientSessionId?: string;
  intervalMs: number;
};

type HeartbeatReason = "init" | "interval" | "visible" | "pagehide";

const DEFAULT_INTERVAL_MS = 12000;

let heartbeatHandle: number | null = null;
let visibilityHandler: (() => void) | null = null;
let pageHideHandler: (() => void) | null = null;
let currentOptions: ActivePresenceOptions | null = null;

/** Startet Presence-Heartbeats und reagiert auf Sichtbarkeitswechsel/Tabwechsel. */
export function startPresence(options: PresenceOptions) {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};
  stopPresence();
  const normalized = normalizeOptions(options);
  if (!normalized) return () => {};
  currentOptions = normalized;

  const handleVisibility = () => {
    if (document.visibilityState === "visible") {
      beginHeartbeat();
      void sendHeartbeat("visible");
    } else {
      pauseHeartbeat();
    }
  };

  const handlePageHide = () => {
    pauseHeartbeat();
    void sendHeartbeat("pagehide");
  };

  visibilityHandler = handleVisibility;
  pageHideHandler = handlePageHide;
  document.addEventListener("visibilitychange", handleVisibility);
  window.addEventListener("pagehide", handlePageHide);
  window.addEventListener("beforeunload", handlePageHide);

  if (document.visibilityState === "visible") {
    void sendHeartbeat("init");
    beginHeartbeat();
  }

  return stopPresence;
}

/** Stoppt Heartbeats und räumt Event-Listener wieder auf. */
export function stopPresence() {
  pauseHeartbeat();
  if (typeof document === "undefined" || typeof window === "undefined") {
    visibilityHandler = null;
    pageHideHandler = null;
    currentOptions = null;
    return;
  }
  if (visibilityHandler) {
    document.removeEventListener("visibilitychange", visibilityHandler);
    visibilityHandler = null;
  }
  if (pageHideHandler) {
    window.removeEventListener("pagehide", pageHideHandler);
    window.removeEventListener("beforeunload", pageHideHandler);
    pageHideHandler = null;
  }
  currentOptions = null;
}

function beginHeartbeat() {
  if (!currentOptions || heartbeatHandle !== null) return;
  heartbeatHandle = window.setInterval(() => {
    void sendHeartbeat("interval");
  }, currentOptions.intervalMs);
}

function pauseHeartbeat() {
  if (heartbeatHandle !== null) {
    window.clearInterval(heartbeatHandle);
    heartbeatHandle = null;
  }
}

/**
 * Prüft die minimal notwendigen Optionen und ergänzt Defaults,
 * damit Heartbeats nur laufen, wenn Lobby- & Spieler-IDs bekannt sind.
 */
function normalizeOptions(options: PresenceOptions): ActivePresenceOptions | null {
  const lobbyId = (options.lobbyId || "").trim();
  const playerId = (options.playerId || "").trim();
  if (!lobbyId || !playerId) return null;
  const clientSessionId = options.clientSessionId?.trim();
  const intervalMs =
    typeof options.intervalMs === "number" && options.intervalMs >= 5000
      ? options.intervalMs
      : DEFAULT_INTERVAL_MS;
  return {
    lobbyId,
    playerId,
    clientSessionId: clientSessionId || undefined,
    intervalMs,
  };
}

/**
 * Sendet einen Heartbeat ans Backend.
 * reason bestimmt, ob keepAlive beim Page-Verlassen gesetzt wird.
 */
async function sendHeartbeat(reason: HeartbeatReason) {
  if (!currentOptions) return;
  try {
    await presencePing({
      lobbyId: currentOptions.lobbyId,
      playerId: currentOptions.playerId,
      clientSessionId: currentOptions.clientSessionId,
      keepAlive: reason === "pagehide",
    });
  } catch {
    // Heartbeats are best-effort – ignore failures.
  }
}
