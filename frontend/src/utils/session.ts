/**
 * Utility für persistente Lobby-/Spieler-Sessions im Browser.
 * Speichert letzte Lobby-/Spielinformationen in localStorage, damit Nutzer:innen nach Refresh oder Redirects korrekt weitergeleitet werden können.
 * Wird vor allem vom Router (App.tsx) und API-Hooks genutzt, um SessionIDs zu lesen bzw. zu erneuern.
 */
/** Mögliche Views, in die eine Session beim Resume springen kann. */
export type ResumeView = "game" | "lose" | "win";

/** Vollständiges Session-Objekt, wie es im localStorage liegt. */
export type LobbySession = {
  lobbyId: string;
  lobbyName: string;
  playerId: string;
  playerName: string;
  updatedAt: number;
  clientSessionId?: string;
  resumeEligible?: boolean;
  resumeView?: ResumeView | null;
  resumeRoundNumber?: number | null;
};

/** Schreibbares Session-Payload ohne updatedAt (wird intern vergeben). */
export type LobbySessionInput = Omit<LobbySession, "updatedAt">;

const STORAGE_KEY = "schwimm_session_v1";
const CLIENT_SESSION_STORAGE_KEY = "schwimm_client_session_id_v1";
export const MAX_SESSION_AGE_MS = Number.POSITIVE_INFINITY; // Kein automatisches Verfallen mehr
const INITIAL_LOGIN_FLAG = "schwimm_require_login_once";

/**
 * Liest die zuletzt persistierte Lobby-Session aus localStorage.
 * Validiert Pflichtfelder (IDs, Namen) und gibt null zurück, wenn Daten ungültig oder nicht vorhanden sind.
 */
export function loadSession(): LobbySession | null {
  if (!safeStorage()) return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LobbySession;
    if (
      typeof parsed?.lobbyId !== "string" ||
      typeof parsed?.playerId !== "string" ||
      typeof parsed?.lobbyName !== "string" ||
      typeof parsed?.playerName !== "string"
    ) {
      return null;
    }
    const parsedUpdatedAt =
      typeof parsed.updatedAt === "number" && !Number.isNaN(parsed.updatedAt)
        ? parsed.updatedAt
        : Date.now();
    const clientSessionId =
      typeof parsed.clientSessionId === "string" && parsed.clientSessionId.trim().length > 0
        ? parsed.clientSessionId.trim()
        : readStoredClientSessionId() || undefined;
    const resumeEligible =
      typeof parsed.resumeEligible === "boolean" ? parsed.resumeEligible : undefined;
    const resumeView =
      parsed.resumeView === "game" || parsed.resumeView === "lose" || parsed.resumeView === "win"
        ? parsed.resumeView
        : undefined;
    const resumeRoundNumber =
      typeof parsed.resumeRoundNumber === "number" && !Number.isNaN(parsed.resumeRoundNumber)
        ? parsed.resumeRoundNumber
        : parsed.resumeRoundNumber === null
        ? null
        : undefined;
    const playerName = parsed.playerName.toUpperCase();
    const lobbyName = parsed.lobbyName.toUpperCase();
    return {
      ...parsed,
      lobbyName,
      clientSessionId,
      resumeEligible,
      resumeView,
      resumeRoundNumber,
      playerName,
      updatedAt: parsedUpdatedAt,
    };
  } catch {
    return null;
  }
}

/**
 * Persistiert eine Session (inklusive Timestamp) im localStorage.
 * Akzeptiert komplette LobbySession oder LobbySessionInput (updatedAt wird automatisch gesetzt).
 */
export function storeSession(next: LobbySessionInput | LobbySession) {
  if (!safeStorage()) return;
  try {
    const payload = normalizeSessionPayload(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore write errors */
  }
}

/**
 * Patcht eine bestehende Session und liefert die fusionierte Struktur zurück.
 * Nutzt loadSession und storeSession kombiniert, um einzelne Felder zu aktualisieren.
 */
export function updateSession(partial: Partial<LobbySessionInput>): LobbySession | null {
  const current = loadSession();
  if (!current) return null;
  const merged = normalizeSessionPayload({ ...current, ...partial, updatedAt: Date.now() });
  storeSession(merged);
  return merged;
}

/** Entfernt die gespeicherte Session vollständig. */
export function clearSession() {
  if (!safeStorage()) return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Setzt bei einem frischen Tab/Reload das Flag, dass zuerst die Login-Seite gezeigt werden soll.
 * Gibt true zurück, wenn ein initialer Login noch erforderlich ist.
 */
export function seedInitialLoginRequirement(): boolean {
  if (!safeSessionStorage()) return false;
  const current = sessionStorage.getItem(INITIAL_LOGIN_FLAG);
  if (current === null) {
    sessionStorage.setItem(INITIAL_LOGIN_FLAG, "1");
    return true;
  }
  return current !== "0";
}

/** Prüft, ob der aktuelle Tab noch einen expliziten Login-Durchlauf benötigt. */
export function isInitialLoginRequired(): boolean {
  if (!safeSessionStorage()) return false;
  return sessionStorage.getItem(INITIAL_LOGIN_FLAG) !== "0";
}

/** Markiert, dass der Login bewusst abgeschlossen wurde und Resume wieder erlaubt ist. */
export function markInitialLoginComplete() {
  if (!safeSessionStorage()) return;
  sessionStorage.setItem(INITIAL_LOGIN_FLAG, "0");
}

/** Erzwingt erneut den Login-Gate (z. B. nach Logout). */
export function resetInitialLoginRequirement() {
  if (!safeSessionStorage()) return;
  sessionStorage.setItem(INITIAL_LOGIN_FLAG, "1");
}

/**
 * Liefert eine eindeutige Client-Session-ID (persistiert), erzeugt falls nötig eine neue.
 * Wird z. B. im Backend-Join (processJoinOrRejoin) genutzt, um Rejoins wiederzuerkennen.
 */
export function getClientSessionId(): string | null {
  if (!safeStorage()) return null;
  try {
    const existing = readStoredClientSessionId();
    if (existing) return existing;
    const next = generateClientSessionId();
    persistClientSessionId(next);
    return next;
  } catch {
    return null;
  }
}

export function persistClientSessionId(nextId: string | null): string | null {
  if (!safeStorage()) return null;
  try {
    if (!nextId || !nextId.trim()) {
      localStorage.removeItem(CLIENT_SESSION_STORAGE_KEY);
      return null;
    }
    const trimmed = nextId.trim();
    localStorage.setItem(CLIENT_SESSION_STORAGE_KEY, trimmed);
    return trimmed;
  } catch {
    return null;
  }
}

/**
 * Prüft, ob der Code im Browser-Kontext ausgeführt wird und localStorage benutzt werden darf.
 * Verhindert Exceptions in SSR/Tests und kapselt Zugriff auf window.
 */
function safeStorage() {
  try {
    return typeof window !== "undefined" && "localStorage" in window;
  } catch {
    return false;
  }
}

function readStoredClientSessionId(): string | null {
  if (!safeStorage()) return null;
  try {
    const raw = localStorage.getItem(CLIENT_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

function safeSessionStorage() {
  try {
    return typeof window !== "undefined" && "sessionStorage" in window;
  } catch {
    return false;
  }
}

/**
 * Erzeugt eine zufällige Session-ID.
 * Nutzt bevorzugt crypto.randomUUID; fällt ansonsten auf einen pseudozufälligen String zurück.
 */
function generateClientSessionId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `sess_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function normalizeSessionPayload(next: LobbySessionInput | LobbySession): LobbySession {
  const base: LobbySession =
    "updatedAt" in next && typeof (next as LobbySession).updatedAt === "number"
      ? ({ ...(next as LobbySession) })
      : ({ ...(next as LobbySessionInput), updatedAt: Date.now() });
  return {
    ...base,
    lobbyName: base.lobbyName.toUpperCase(),
    playerName: base.playerName.toUpperCase(),
  };
}
