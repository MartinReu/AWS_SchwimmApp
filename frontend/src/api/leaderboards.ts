/**
 * Leaderboard-API-Layer mit optionalem dediziertem Service.
 * Nutzt VITE_LEADERBOARDS_API_URL wenn gesetzt, sonst die klassischen REST-Routen der Mock-API.
 * Stellt sowohl Fetching als auch ein optionales SSE/Polling-Abonnement bereit.
 */

export type LeaderboardPlayerEntry = {
  id: string;
  name: string;
  pointsTotal?: number;
};

export type LeaderboardEntry = {
  lobbyId: string;
  lobbyName: string;
  players: LeaderboardPlayerEntry[];
  createdAt: string;
  rounds?: number;
};

export type FetchLeaderboardsParams = {
  search?: string;
  signal?: AbortSignal;
};

const DEFAULT_BASE_URL = (import.meta.env.VITE_LEADERBOARDS_API_URL ||
  import.meta.env.VITE_API_URL ||
  "http://localhost:4000"
).replace(/\/$/, "");

const HAS_DEDICATED_ENDPOINT = Boolean(import.meta.env.VITE_LEADERBOARDS_API_URL);

/** Holt Leaderboard-Einträge, optional nach Lobbynamen gefiltert. */
export async function fetchLeaderboards({
  search,
  signal,
}: FetchLeaderboardsParams = {}): Promise<LeaderboardEntry[]> {
  const trimmedSearch = search?.trim();
  const preferredPath = HAS_DEDICATED_ENDPOINT ? "/leaderboards" : "/leaderboard";
  const candidates = HAS_DEDICATED_ENDPOINT ? [preferredPath, "/leaderboard"] : [preferredPath];

  for (const path of candidates) {
    try {
      const res = await fetch(buildUrl(path, trimmedSearch, path === "/leaderboard"), { signal });
      if (!res.ok) throw await buildError(res);
      const data = (await res.json()) as unknown;
      return normalizePayload(data);
    } catch (error) {
      if (isAbortError(error)) throw error;
      // Only try the next candidate if it exists.
      if (path === candidates[candidates.length - 1]) throw error as Error;
    }
  }
  return [];
}

export type LeaderboardSubscriptionCallbacks = {
  onAdded?: (entry: LeaderboardEntry) => void;
  onUpdated?: (entry: LeaderboardEntry) => void;
  onRemoved?: (lobbyId: string) => void;
  onError?: (error: Error) => void;
};

/**
 * Optionales Realtime-Abo.
 * Nutzt EventSource, wenn VITE_LEADERBOARDS_STREAM_URL vorhanden ist, andernfalls Polling als Fallback.
 */
export type LeaderboardSubscriptionOptions = {
  pollIntervalMs?: number;
};

export function subscribeLeaderboards(
  callbacks: LeaderboardSubscriptionCallbacks = {},
  options: LeaderboardSubscriptionOptions = {}
): () => void {
  const streamUrl = import.meta.env.VITE_LEADERBOARDS_STREAM_URL;
  if (!streamUrl || typeof window === "undefined" || typeof EventSource === "undefined") {
    const { pollIntervalMs = 5000 } = options;
    if (!pollIntervalMs || pollIntervalMs <= 0 || typeof window === "undefined") {
      return () => {};
    }
    let cache = new Map<string, LeaderboardEntry>();
    let cancelled = false;
    let initialized = false;

    const poll = async () => {
      try {
        const next = await fetchLeaderboards();
        if (cancelled) return;
        const nextMap = new Map(next.map((entry) => [entry.lobbyId, entry]));

        if (!initialized) {
          cache = nextMap;
          initialized = true;
          return;
        }

        next.forEach((entry) => {
          const previous = cache.get(entry.lobbyId);
          if (!previous) callbacks.onAdded?.(entry);
          else if (!areEntriesEqual(previous, entry)) callbacks.onUpdated?.(entry);
        });

        cache.forEach((_value, lobbyId) => {
          if (!nextMap.has(lobbyId)) callbacks.onRemoved?.(lobbyId);
        });

        cache = nextMap;
      } catch (error) {
        callbacks.onError?.(error as Error);
      }
    };

    poll();
    const interval = window.setInterval(poll, pollIntervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }

  const source = new EventSource(streamUrl);

  source.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data) as LeaderboardStreamPayload;
      if (payload?.type === "added" && payload.entry) callbacks.onAdded?.(payload.entry);
      else if (payload?.type === "updated" && payload.entry) callbacks.onUpdated?.(payload.entry);
      else if (payload?.type === "removed" && payload.lobbyId) callbacks.onRemoved?.(payload.lobbyId);
    } catch (err) {
      callbacks.onError?.(err as Error);
    }
  };

  source.onerror = () => {
    callbacks.onError?.(new Error("Realtime-Verbindung unterbrochen"));
  };

  return () => {
    source.close();
  };
}

type LeaderboardStreamPayload =
  | { type: "added" | "updated"; entry: LeaderboardEntry }
  | { type: "removed"; lobbyId: string };

type LegacyLobby = {
  id: string;
  lobbyId?: string;
  name?: string;
  lobbyName?: string;
  createdAt?: string;
  rounds?: number;
  players?: LegacyPlayer[];
};

type LegacyPlayer = {
  id: string;
  name: string;
  points?: number;
  pointsTotal?: number;
};

/** Zusammensetzen der Anfrage-URL unter Berücksichtigung legacy Query Keys. */
function buildUrl(path: string, search: string | undefined, useLegacyQueryParam: boolean) {
  const url = new URL(`${DEFAULT_BASE_URL}${path}`);
  if (search) {
    const key = useLegacyQueryParam ? "query" : "search";
    url.searchParams.set(key, search);
  }
  return url.toString();
}

/** Konvertiert HTTP-Antworten in Errors mit lesbaren Messages. */
async function buildError(res: Response) {
  const fallback = `HTTP ${res.status}`;
  try {
    const data = await res.json();
    if (typeof data?.error === "string") return new Error(data.error);
    if (typeof data?.message === "string") return new Error(data.message);
  } catch {
    // ignore JSON parse errors
  }
  return new Error(fallback);
}

/** Normalisiert verschieden strukturierte Arrays (neues Format vs. Legacy-Objekte). */
function normalizePayload(payload: unknown): LeaderboardEntry[] {
  if (!Array.isArray(payload)) return [];
  return payload.map((item) => normalizeEntry(item)).filter(Boolean) as LeaderboardEntry[];
}

/** Konvertiert ein einzelnes Objekt in den LeaderboardEntry-Typ, inklusive Legacy-Feldern. */
function normalizeEntry(item: unknown): LeaderboardEntry | null {
  if (!item || typeof item !== "object") return null;
  const lobby = item as LeaderboardEntry & LegacyLobby;
  const lobbyId = lobby.lobbyId || lobby.id;
  const lobbyName = lobby.lobbyName || lobby.name;
  if (!lobbyId || !lobbyName) return null;
  const rounds =
    typeof lobby.rounds === "number"
      ? lobby.rounds
      : typeof (lobby as LegacyLobby).rounds === "number"
        ? (lobby as LegacyLobby).rounds
        : undefined;

  const legacyPlayers = Array.isArray((lobby as LegacyLobby).players)
    ? (lobby as LegacyLobby).players
    : null;
  const rawPlayers: (LegacyPlayer | LeaderboardPlayerEntry)[] =
    legacyPlayers ??
    (Array.isArray(lobby.players) ? lobby.players : []);

  const players =
    rawPlayers.length > 0
      ? rawPlayers
          .map((player) => {
            const id = player.id;
            const name = player.name;
            if (!id || !name) return null;
            const total = resolvePoints(player);
            return {
              id,
              name,
              pointsTotal: total,
            };
          })
          .filter(Boolean) as LeaderboardPlayerEntry[]
      : [];

  return {
    lobbyId,
    lobbyName,
    players,
    createdAt: lobby.createdAt || new Date().toISOString(),
    rounds,
  };
}

function isAbortError(error: unknown): error is DOMException {
  return error instanceof DOMException && error.name === "AbortError";
}

/** Vereinheitlicht Punktefelder (points vs. pointsTotal) zu einer Zahl. */
function resolvePoints(player: LegacyPlayer | LeaderboardPlayerEntry) {
  if (typeof (player as LegacyPlayer).points === "number") return (player as LegacyPlayer).points;
  if ("pointsTotal" in player && typeof player.pointsTotal === "number") {
    return player.pointsTotal;
  }
  return undefined;
}

/** Vergleicht zwei Einträge (Name, Runden, Spielerliste), um Updates beim Polling zu erkennen. */
function areEntriesEqual(a: LeaderboardEntry, b: LeaderboardEntry) {
  if (a === b) return true;
  if (a.lobbyName !== b.lobbyName) return false;
  if ((a.rounds ?? 0) !== (b.rounds ?? 0)) return false;
  if (a.players.length !== b.players.length) return false;
  for (let i = 0; i < a.players.length; i++) {
    const playerA = a.players[i];
    const playerB = b.players[i];
    if (playerA.id !== playerB.id) return false;
    if (playerA.name !== playerB.name) return false;
    if ((playerA.pointsTotal ?? 0) !== (playerB.pointsTotal ?? 0)) return false;
  }
  return true;
}
