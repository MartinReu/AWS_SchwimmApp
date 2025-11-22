/**
 * Lobby-API: CRUD für Lobbys/Spieler, Join-Rejoin-Logik, Presence-Pings und Delete-Fallbacks.
 * Abstraktionsschicht für alle Pages, die mit dem Mock/Backend sprechen.
 */
import { DEFAULT_API_BASE_URL, parseJson } from "./http";
import type { Lobby, Player } from "./types";

const CORE_API_BASE_URL = DEFAULT_API_BASE_URL;

/** Holt alle bekannten Lobbys vom Backend. */
export async function listLobbies(): Promise<Lobby[]> {
  const res = await fetch(`${CORE_API_BASE_URL}/lobbies`);
  return parseJson(res);
}

/** Liefert eine konkrete Lobby anhand der ID. */
export async function getLobby(lobbyId: string): Promise<Lobby> {
  const res = await fetch(`${CORE_API_BASE_URL}/lobbies/${encodeURIComponent(lobbyId)}`);
  return parseJson(res);
}

/** Erstellt eine neue Lobby mit dem angegebenen Namen. */
export async function createLobby(name: string): Promise<Lobby> {
  const res = await fetch(`${CORE_API_BASE_URL}/lobbies`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  return parseJson(res);
}

/** Listet alle Spieler einer Lobby (wird laufend gepollt). */
export async function listPlayers(lobbyId: string): Promise<Player[]> {
  const res = await fetch(`${CORE_API_BASE_URL}/players?lobbyId=${encodeURIComponent(lobbyId)}`);
  return parseJson(res);
}

type PlayerNamesResponse = { names?: string[] } | string[];

/** Liefert eine deduplizierte Liste aller bekannten Spielernamen. */
export async function fetchAllPlayerNames(): Promise<string[]> {
  const res = await fetch(`${CORE_API_BASE_URL}/players/all-names`);
  const payload = await parseJson<PlayerNamesResponse>(res);
  const names = Array.isArray(payload) ? payload : Array.isArray(payload?.names) ? payload.names : [];
  return normalizePlayerNameList(names);
}

/** Bereinigt und dedupliziert eine Liste von Spielernamen, stabilisiert die Sortierung. */
function normalizePlayerNameList(raw: string[]): string[] {
  const seen = new Map<string, string>();
  raw.forEach((entry) => {
    const trimmed = String(entry ?? "").trim();
    if (!trimmed) return;
    const normalized = trimmed.toLowerCase();
    if (!seen.has(normalized)) seen.set(normalized, trimmed);
  });
  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b, "de", { sensitivity: "base" }));
}

export type DeleteLobbyParams = {
  lobbyId?: string;
  lobbyName?: string;
  hard?: boolean;
  signal?: AbortSignal;
};

export type DeleteLobbyResult = {
  ok: boolean;
  code?: string;
  message?: string;
};

export type JoinOrRejoinParams = {
  lobbyId?: string;
  lobbyName?: string;
  playerName: string;
  clientSessionId?: string | null;
  forceRejoin?: boolean;
  signal?: AbortSignal;
};

export type JoinOrRejoinErrorCode = "LOBBY_FULL" | "NAME_ACTIVE" | "NAME_TAKEN" | "MAX_PLAYERS" | "UNKNOWN";

export type JoinOrRejoinResponse = {
  ok: boolean;
  mode: "join" | "rejoin";
  playerId: string;
  isActive: boolean;
  player?: Player;
  errorCode?: JoinOrRejoinErrorCode;
  message?: string;
};

export type PresencePingParams = {
  lobbyId?: string | null;
  playerId?: string | null;
  clientSessionId?: string | null;
  keepAlive?: boolean;
  signal?: AbortSignal;
};

const LOBBIES_BASE_URL = (
  import.meta.env.VITE_LOBBIES_API_URL ||
  import.meta.env.VITE_API_URL ||
  "http://localhost:4000"
).replace(/\/$/, "");

const rawLeaderboardsBase = import.meta.env.VITE_LEADERBOARDS_API_URL;
const LEADERBOARDS_BASE_URL = rawLeaderboardsBase ? rawLeaderboardsBase.replace(/\/$/, "") : null;

const DELETE_BASE_URLS: string[] = Array.from(
  new Set(
    [LOBBIES_BASE_URL, LEADERBOARDS_BASE_URL].filter(
      (url): url is string => typeof url === "string" && url.length > 0
    )
  )
);

const REQUEST_TIMEOUT_MS = 8000;
type PresenceEndpointBuilder = (ctx: { lobbyId: string; playerId: string }) => string;
const PRESENCE_ENDPOINTS: PresenceEndpointBuilder[] = [
  ({ lobbyId }) => `/lobbies/${lobbyId}/presence`,
  ({ lobbyId }) => `/lobbies/${lobbyId}/presence-ping`,
  ({ lobbyId, playerId }) => `/lobbies/${lobbyId}/players/${playerId}/presence`,
];
let presenceEndpointStatus: "unknown" | "supported" | "unsupported" = "unknown";

type RequestCandidate = {
  path: string;
  method: "DELETE" | "POST" | "PATCH";
  body?: BodyInit;
  headers?: Record<string, string>;
  baseUrl?: string;
};

type DeleteLogContext = {
  baseUrl?: string;
  path?: string;
};

/**
 * Versucht (je nach verfügbaren Endpoints) einen Join oder Rejoin.
 * Nutzt mehrere Kandidaten-URLs (ID/Name, join vs. join-or-rejoin), bis eine Variante funktioniert.
 */
export async function joinOrRejoin({
  lobbyId,
  lobbyName,
  playerName,
  clientSessionId,
  forceRejoin,
  signal,
}: JoinOrRejoinParams): Promise<JoinOrRejoinResponse> {
  if (!lobbyId && !lobbyName) {
    throw new Error("Lobby-ID oder Name erforderlich.");
  }

  const payload = JSON.stringify({
    name: playerName,
    ...(clientSessionId ? { clientSessionId } : {}),
    ...(forceRejoin ? { forceRejoin: true } : {}),
  });

  const candidates: RequestCandidate[] = [];
  const headers = { "Content-Type": "application/json" };
  const context = { lobbyId, lobbyName, playerName };

  if (lobbyId) {
    const encodedId = encodeURIComponent(lobbyId);
    candidates.push(
      { path: `/lobbies/${encodedId}/join-or-rejoin`, method: "POST", headers, body: payload },
      { path: `/lobbies/${encodedId}/join`, method: "POST", headers, body: payload }
    );
  }

  if (lobbyName) {
    const encodedName = encodeURIComponent(lobbyName);
    candidates.push(
      { path: `/lobbies/by-name/${encodedName}/join-or-rejoin`, method: "POST", headers, body: payload },
      { path: `/lobbies/by-name/${encodedName}/join`, method: "POST", headers, body: payload }
    );
  }

  let lastError: Error | null = null;

  for (const candidate of candidates) {
    try {
      const res = await fetch(`${LOBBIES_BASE_URL}${candidate.path}`, {
        method: candidate.method,
        headers: candidate.headers,
        body: candidate.body,
        signal,
      });
      if (!res.ok) throw await buildError(res);
      const data = await res.json();
      return normalizeJoinOrRejoinPayload(data, context);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      lastError = error instanceof Error ? error : new Error("Unbekannter Fehler");
    }
  }

  if (lastError) throw lastError;
  throw new Error("Beitritt fehlgeschlagen.");
}

/** Sendet einen Heartbeat, um Spieler-Slots aktiv zu halten (best effort). */
export async function presencePing({
  lobbyId,
  playerId,
  clientSessionId,
  keepAlive = false,
  signal,
}: PresencePingParams): Promise<void> {
  if (presenceEndpointStatus === "unsupported") return;
  if (!lobbyId || !playerId) return;

  const encodedLobbyId = encodeURIComponent(lobbyId);
  const encodedPlayerId = encodeURIComponent(playerId);
  const payload = JSON.stringify({
    playerId,
    ...(clientSessionId ? { clientSessionId } : {}),
  });

  let missingEndpoints = 0;
  for (const buildPath of PRESENCE_ENDPOINTS) {
    const path = buildPath({ lobbyId: encodedLobbyId, playerId: encodedPlayerId });
    try {
      const res = await fetch(`${LOBBIES_BASE_URL}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        signal,
        keepalive: keepAlive,
      });
      if (res.status === 404 || res.status === 405 || res.status === 501) {
        missingEndpoints++;
        continue;
      }
      if (!res.ok) {
        // Treat other failures as transient; do not spam the server with retries using other endpoints.
        return;
      }
      presenceEndpointStatus = "supported";
      return;
    } catch (error) {
      if (isAbortError(error)) throw error;
      return;
    }
  }

  if (missingEndpoints === PRESENCE_ENDPOINTS.length && presenceEndpointStatus !== "supported") {
    presenceEndpointStatus = "unsupported";
  }
}

/**
 * Löscht eine Lobby über alle bekannten Endpoints (DELETE/POST Varianten).
 * Fällt bei Konflikten auf Soft-Delete zurück und liefert standardisierte Resultate/Codes.
 */
export async function deleteLobby({
  lobbyId,
  lobbyName,
  hard = true,
  signal,
}: DeleteLobbyParams): Promise<DeleteLobbyResult> {
  if (!lobbyId && !lobbyName) {
    return {
      ok: false,
      code: "missing-identifier",
      message: "Lobby-ID oder Name erforderlich.",
    };
  }

  const identifiers = { lobbyId, lobbyName };
  const shouldAttemptHardDelete = hard !== false;
  let lastError: DeleteLobbyResult | null = null;
  let sawConflict = false;

  if (shouldAttemptHardDelete) {
    const hardCandidates = buildHardDeleteCandidates(identifiers);
    for (const candidate of hardCandidates) {
      const context = { baseUrl: candidate.baseUrl, path: candidate.path };
      try {
        const res = await performRequest(candidate, signal);
        if (res.status === 404) {
          const notFoundResult = await handleNotFoundResponse(res, identifiers, context);
          if (notFoundResult.ok) return notFoundResult;
          lastError = notFoundResult;
          continue;
        }
        if (res.ok) {
          return { ok: true };
        }
        if (isConflictStatus(res.status)) {
          sawConflict = true;
          lastError = await buildDeleteErrorResult(res, identifiers, context);
          continue;
        }
        lastError = await buildDeleteErrorResult(res, identifiers, context);
      } catch (error) {
        if (isAbortError(error)) throw error;
        const networkError = buildNetworkErrorResult(error);
        logDeleteWarning(identifiers, networkError, undefined, context);
        lastError = networkError;
      }
    }
  }

  if (!shouldAttemptHardDelete || sawConflict) {
    const softResult = await attemptSoftDelete(identifiers, signal);
    if (softResult.ok) return softResult;
    lastError = softResult;
  }

  return (
    lastError ?? {
      ok: false,
      code: "delete-failed",
      message: "Lobby konnte nicht gelöscht werden.",
    }
  );
}

/**
 * Erzeugt alle potenziellen Hard-Delete-Requests gegen Lobby- und Leaderboard-Endpunkte.
 * Deckt ID- und Namensbasierte Routen sowie POST/DELETE-Varianten ab, um unterschiedliche Server-Implementierungen zu erreichen.
 */
function buildHardDeleteCandidates({ lobbyId, lobbyName }: { lobbyId?: string; lobbyName?: string }) {
  const candidates: RequestCandidate[] = [];
  const jsonHeaders = { "Content-Type": "application/json" };
  const payload = JSON.stringify({ lobbyId, lobbyName, hard: true });

  if (lobbyId) {
    const encodedId = encodeURIComponent(lobbyId);
    for (const baseUrl of DELETE_BASE_URLS) {
      candidates.push(
        { baseUrl, path: `/lobbies/${encodedId}`, method: "DELETE" },
        { baseUrl, path: `/lobbies/${encodedId}?hard=true`, method: "DELETE" },
        { baseUrl, path: `/leaderboard/${encodedId}`, method: "DELETE" },
        { baseUrl, path: `/leaderboards/${encodedId}`, method: "DELETE" },
        { baseUrl, path: `/lobbies/${encodedId}/delete`, method: "POST", headers: jsonHeaders, body: payload },
        { baseUrl, path: `/lobbies/${encodedId}/hard-delete`, method: "POST", headers: jsonHeaders, body: payload },
        { baseUrl, path: `/leaderboard/${encodedId}/delete`, method: "POST", headers: jsonHeaders, body: payload },
        { baseUrl, path: `/leaderboards/${encodedId}/delete`, method: "POST", headers: jsonHeaders, body: payload }
      );
    }
  }

  if (lobbyName) {
    const encodedName = encodeURIComponent(lobbyName);
    for (const baseUrl of DELETE_BASE_URLS) {
      candidates.push(
        { baseUrl, path: `/lobbies/by-name/${encodedName}`, method: "DELETE" },
        { baseUrl, path: `/lobbies/by-name/${encodedName}?hard=true`, method: "DELETE" },
        { baseUrl, path: `/leaderboard/by-name/${encodedName}`, method: "DELETE" },
        { baseUrl, path: `/leaderboards/by-name/${encodedName}`, method: "DELETE" },
        { baseUrl, path: `/lobbies/by-name/${encodedName}/delete`, method: "POST", headers: jsonHeaders, body: payload },
        { baseUrl, path: `/leaderboard/by-name/${encodedName}/delete`, method: "POST", headers: jsonHeaders, body: payload },
        { baseUrl, path: `/leaderboards/by-name/${encodedName}/delete`, method: "POST", headers: jsonHeaders, body: payload }
      );
    }
  }

  for (const baseUrl of DELETE_BASE_URLS) {
    candidates.push(
      { baseUrl, path: "/lobbies/delete", method: "POST", headers: jsonHeaders, body: payload },
      { baseUrl, path: "/leaderboard/delete", method: "POST", headers: jsonHeaders, body: payload },
      { baseUrl, path: "/leaderboards/delete", method: "POST", headers: jsonHeaders, body: payload }
    );
  }

  return candidates;
}

/** Schaltet Lobbys auf "closed", falls Hard-Delete scheitert. */
async function attemptSoftDelete(
  identifiers: { lobbyId?: string; lobbyName?: string },
  signal?: AbortSignal
): Promise<DeleteLobbyResult> {
  const { lobbyId, lobbyName } = identifiers;
  const candidates: RequestCandidate[] = [];
  const payload = JSON.stringify({ status: "closed" });
  const jsonHeaders = { "Content-Type": "application/json" };

  if (lobbyId) {
    const encodedId = encodeURIComponent(lobbyId);
    for (const baseUrl of DELETE_BASE_URLS) {
      candidates.push(
        { baseUrl, path: `/lobbies/${encodedId}`, method: "PATCH", headers: jsonHeaders, body: payload },
        { baseUrl, path: `/lobbies/${encodedId}/status`, method: "PATCH", headers: jsonHeaders, body: payload },
        { baseUrl, path: `/leaderboard/${encodedId}`, method: "PATCH", headers: jsonHeaders, body: payload },
        { baseUrl, path: `/leaderboards/${encodedId}`, method: "PATCH", headers: jsonHeaders, body: payload },
        { baseUrl, path: `/leaderboard/${encodedId}/status`, method: "PATCH", headers: jsonHeaders, body: payload },
        { baseUrl, path: `/leaderboards/${encodedId}/status`, method: "PATCH", headers: jsonHeaders, body: payload }
      );
    }
  }

  if (lobbyName) {
    const encodedName = encodeURIComponent(lobbyName);
    for (const baseUrl of DELETE_BASE_URLS) {
      candidates.push(
        { baseUrl, path: `/lobbies/by-name/${encodedName}`, method: "PATCH", headers: jsonHeaders, body: payload },
        { baseUrl, path: `/lobbies/by-name/${encodedName}/status`, method: "PATCH", headers: jsonHeaders, body: payload },
        { baseUrl, path: `/leaderboard/by-name/${encodedName}`, method: "PATCH", headers: jsonHeaders, body: payload },
        { baseUrl, path: `/leaderboards/by-name/${encodedName}`, method: "PATCH", headers: jsonHeaders, body: payload },
        { baseUrl, path: `/leaderboard/by-name/${encodedName}/status`, method: "PATCH", headers: jsonHeaders, body: payload },
        { baseUrl, path: `/leaderboards/by-name/${encodedName}/status`, method: "PATCH", headers: jsonHeaders, body: payload }
      );
    }
  }

  let lastError: DeleteLobbyResult | null = null;

  for (const candidate of candidates) {
    const context = { baseUrl: candidate.baseUrl, path: candidate.path };
    try {
      const res = await performRequest(candidate, signal);
      if (res.status === 404) {
        const notFoundResult = await handleNotFoundResponse(res, identifiers, context);
        if (notFoundResult.ok) return notFoundResult;
        lastError = notFoundResult;
        continue;
      }
      if (res.ok) {
        return {
          ok: true,
          code: "soft-closed",
          message: "Lobby wurde geschlossen.",
        };
      }
      lastError = await buildDeleteErrorResult(res, identifiers, context);
    } catch (error) {
      if (isAbortError(error)) throw error;
      const networkError = buildNetworkErrorResult(error);
      logDeleteWarning(identifiers, networkError, undefined, context);
      lastError = networkError;
    }
  }

  return (
    lastError ?? {
      ok: false,
      code: "soft-delete-unavailable",
      message: "Soft-Delete wird vom Server nicht unterstützt.",
    }
  );
}

/** 404-Antworten werden als erfolgreicher Zustand interpretiert (Lobby existiert nicht mehr). */
async function handleNotFoundResponse(
  res: Response,
  _identifiers: { lobbyId?: string; lobbyName?: string },
  _context?: DeleteLogContext
): Promise<DeleteLobbyResult> {
  const payload = await parseErrorPayload(res);
  return {
    ok: true,
    code: payload.code ?? "not-found",
    message: payload.message || "Lobby wurde bereits entfernt.",
  };
}

type ParsedErrorPayload = { code?: string; message?: string };

/** Baut ein DeleteLobbyResult aus HTTP-Fehlerpayloads und loggt zusätzliche Infos. */
async function buildDeleteErrorResult(
  res: Response,
  identifiers: { lobbyId?: string; lobbyName?: string },
  context?: DeleteLogContext,
  payload?: ParsedErrorPayload
) {
  const { code: rawCode, message: rawMessage } = payload ?? (await parseErrorPayload(res));
  const mapped = mapDeleteMessage(res.status, rawMessage);
  const result: DeleteLobbyResult = {
    ok: false,
    code: rawCode ?? mapped.code,
    message: mapped.message ?? rawMessage ?? `HTTP ${res.status}`,
  };
  logDeleteWarning(identifiers, result, res.status, context);
  return result;
}

/** Übersetzt HTTP-Status in sprechende Codes/Meldungen für die UI. */
function mapDeleteMessage(status: number, serverMessage?: string) {
  const fallback = serverMessage || `HTTP ${status}`;
  if (status === 401 || status === 403) {
    return {
      code: "forbidden",
      message: "Dir fehlen die Rechte zum Löschen dieser Lobby.",
    };
  }
  if (status >= 500) {
    return {
      code: "server-error",
      message: "Serverfehler beim Löschen. Bitte später erneut versuchen.",
    };
  }
  if (isConflictStatus(status)) {
    const normalized = fallback.toLowerCase();
    const keywords = [
      "active round",
      "active game",
      "foreign key",
      "constraint",
      "transactioncanceled",
      "transaction canceled",
      "conditionalcheckfailed",
      "conditional check failed",
      "locked",
    ];
    const matchesConflictReason = keywords.some((needle) => normalized.includes(needle));
    const conflictMessage = matchesConflictReason
      ? "Lobby kann nicht gelöscht werden, solange noch aktive Runden oder Referenzen existieren."
      : fallback;
    return {
      code: matchesConflictReason ? "lobby-active" : "conflict",
      message: conflictMessage,
    };
  }
  if (status === 429) {
    return {
      code: "rate-limited",
      message: "Zu viele Versuche. Bitte kurz warten und erneut probieren.",
    };
  }
  return {
    code: "delete-failed",
    message: fallback,
  };
}

async function parseErrorPayload(res: Response) {
  try {
    const data = await res.json();
    const code = typeof data?.code === "string" ? data.code : undefined;
    const message =
      typeof data?.message === "string"
        ? data.message
        : typeof data?.error === "string"
        ? data.error
        : undefined;
    return { code, message };
  } catch {
    return { message: `HTTP ${res.status}` };
  }
}

function isConflictStatus(status: number) {
  return status === 409 || status === 412 || status === 423 || status === 428;
}

/** Type Guard für AbortError, damit Fetch-Abbrüche sauber propagiert werden. */
function isAbortError(error: unknown): error is DOMException {
  return error instanceof DOMException && error.name === "AbortError";
}

/** Standardisierte Struktur für Netzwerkausfälle während Delete. */
function buildNetworkErrorResult(error: unknown): DeleteLobbyResult {
  const message =
    error instanceof Error && error.message ? error.message : "Netzwerkfehler beim Löschen der Lobby.";
  return {
    ok: false,
    code: "network-error",
    message,
  };
}

/** Hilfslogger, um Delete-Fehler zentral zu erfassen (z. B. für Debugging). */
function logDeleteWarning(
  identifiers: { lobbyId?: string; lobbyName?: string },
  result: DeleteLobbyResult,
  status?: number,
  context?: DeleteLogContext
) {
  if (typeof console === "undefined" || typeof console.warn !== "function") return;
  console.warn("[deleteLobby]", {
    lobbyId: identifiers.lobbyId,
    lobbyName: identifiers.lobbyName,
    status,
    code: result.code,
    message: result.message,
    baseUrl: context?.baseUrl,
    path: context?.path,
  });
}

/** Führt einen HTTP-Request aus und kapselt Timeout-/Abort-Handling. */
async function performRequest(candidate: RequestCandidate, signal?: AbortSignal) {
  const { signal: requestSignal, cleanup, timedOut } = createAbortSignal(signal, REQUEST_TIMEOUT_MS);
  const baseUrl = candidate.baseUrl ?? LOBBIES_BASE_URL;
  try {
    return await fetch(`${baseUrl}${candidate.path}`, {
      method: candidate.method,
      headers: candidate.headers,
      body: candidate.body,
      signal: requestSignal,
    });
  } catch (error) {
    if (isAbortError(error) && timedOut()) {
      throw new Error("Timeout beim Löschversuch.");
    }
    throw error;
  } finally {
    cleanup();
  }
}

/**
 * Kombiniert internen AbortController mit optionalem externen Signal plus Timeout,
 * damit Delete-Versuche deterministisch abbrechen können.
 */
function createAbortSignal(externalSignal?: AbortSignal, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  let timedOut = false;
  const timeoutHandle: ReturnType<typeof setTimeout> | undefined =
    timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, timeoutMs)
      : undefined;

  const onExternalAbort = () => controller.abort();

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener("abort", onExternalAbort);
    }
  }

  const cleanup = () => {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    if (externalSignal) {
      externalSignal.removeEventListener("abort", onExternalAbort);
    }
  };

  return {
    signal: controller.signal,
    cleanup,
    timedOut: () => timedOut,
  };
}

/** Kapselt Response-Payload in ein Error-Objekt inkl. optionaler errorCode-Zuweisung. */
async function buildError(res: Response) {
  const fallback = `HTTP ${res.status}`;
  try {
    const data = await res.json();
    const message =
      typeof data?.message === "string"
        ? data.message
        : typeof data?.error === "string"
          ? data.error
          : undefined;
    const error = new Error(message || fallback) as ResponseError;
    if (typeof data?.errorCode === "string") {
      error.code = data.errorCode;
    }
    return error;
  } catch {
    // ignore JSON parse errors
  }
  return new Error(fallback);
}

type ResponseError = Error & { code?: string };

type JoinPayloadContext = {
  lobbyId?: string | null;
  lobbyName?: string | null;
  playerName: string;
};

type JoinPayload = {
  ok?: boolean;
  mode?: string;
  playerId?: string;
  isActive?: boolean;
  player?: PlayerLike;
  errorCode?: string;
  message?: string;
};

type PlayerLike = Partial<Player> & {
  id?: string;
  name?: string;
  lobbyId?: string;
  joinedAt?: string;
  isActive?: boolean;
};

/**
 * Interpretiert verschiedene Backend-Response-Formate (neues JSON, legacy Player-only)
 * und bietet dem Frontend eine einheitliche JoinOrRejoinResponse an.
 */
function normalizeJoinOrRejoinPayload(payload: unknown, context: JoinPayloadContext): JoinOrRejoinResponse {
  if (payload && typeof payload === "object" && ("ok" in (payload as object) || "mode" in (payload as object))) {
    const typed = payload as JoinPayload;
    const ok = typed.ok !== false;
    const mode = typed.mode === "rejoin" ? "rejoin" : "join";
    const errorCode = parseJoinErrorCode(typed.errorCode);
    const player =
      ok && typed.player
        ? normalizePlayerPayload(typed.player, context, typed.playerId)
        : ok && typed.playerId
        ? normalizePlayerPayload({ id: typed.playerId }, context, typed.playerId)
        : undefined;
    const playerId = typed.playerId || player?.id || "";
    const isActive =
      typeof typed.isActive === "boolean" ? typed.isActive : player ? player.isActive !== false : true;

    if (ok && !playerId) {
      throw new Error("Antwort ohne Spieler-Referenz.");
    }

    return {
      ok,
      mode,
      playerId,
      isActive,
      player,
      errorCode,
      message: typeof typed.message === "string" ? typed.message : undefined,
    };
  }

  if (looksLikePlayerPayload(payload)) {
    const player = normalizePlayerPayload(payload as PlayerLike, context);
    return {
      ok: true,
      mode: "join",
      playerId: player.id,
      isActive: player.isActive !== false,
      player,
    };
  }

  throw new Error("Unerwartete Antwort vom Lobby-Server.");
}

function looksLikePlayerPayload(payload: unknown): payload is PlayerLike {
  if (!payload || typeof payload !== "object") return false;
  const candidate = payload as PlayerLike;
  return typeof candidate.id === "string" && typeof candidate.name === "string";
}

/** Formatiert Spieler-Payloads aus Responses zu unserem Player-Typ inklusive Fallback-Namen. */
function normalizePlayerPayload(player: PlayerLike, context: JoinPayloadContext, fallbackId?: string): Player {
  const id = player.id ?? fallbackId;
  if (!id) throw new Error("Spieler-ID fehlt in der Serverantwort.");
  const cleanName = typeof player.name === "string" && player.name.trim().length > 0 ? player.name : context.playerName;
  const normalizedPlayer: Player = {
    id,
    name: cleanName,
    lobbyId: player.lobbyId ?? context.lobbyId ?? "",
    joinedAt: player.joinedAt ?? new Date().toISOString(),
    ...(typeof player.isActive === "boolean" ? { isActive: player.isActive } : {}),
  };
  return normalizedPlayer;
}

function parseJoinErrorCode(value: unknown): JoinOrRejoinErrorCode | undefined {
  if (typeof value !== "string") return undefined;
  const upper = value.toUpperCase() as JoinOrRejoinErrorCode;
  switch (upper) {
    case "LOBBY_FULL":
    case "NAME_ACTIVE":
    case "NAME_TAKEN":
    case "MAX_PLAYERS":
    case "UNKNOWN":
      return upper;
    default:
      return undefined;
  }
}
