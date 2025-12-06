/**
 * PlayerSessionContext
 * Speichert den aktuell gewählten Spielernamen zentral und sorgt dafür,
 * dass Login- und Lobby-Flows denselben Wert teilen (inkl. localStorage-Persistenz).
 */
import { createContext, PropsWithChildren, useCallback, useContext, useMemo, useState } from "react";
import { clearSession, loadSession, MAX_SESSION_AGE_MS, resetInitialLoginRequirement } from "../utils/session";

export type StoredPlayerSession = {
  playerName: string;
  lobbyId?: string | null;
  lobbyName?: string | null;
  resumeKey?: string | null;
  lastLoginAt: number;
};

type PlayerSessionContextValue = {
  currentPlayerName: string | null;
  setCurrentPlayerName: (name: string) => void;
  confirmPlayerName: (name: string) => void;
  hasConfirmedPlayer: boolean;
  isLoggedIn: boolean;
  activeSession: StoredPlayerSession | null;
  clearCurrentPlayerName: () => void;
  clearLobbySession?: (lobbyName?: string | null) => void;
  logout: () => void;
};

const PlayerSessionContext = createContext<PlayerSessionContextValue | undefined>(undefined);

const PLAYER_NAME_STORAGE_KEY = "schwimm_playerName_v2";
const LEGACY_PLAYER_KEY = "schwimm_playerName";
// Persistiert den "Erstbesuch erledigt"-Zustand inkl. optionaler Lobby/Resume-Infos, damit Reloads nicht zum Login führen.
const PLAYER_SESSION_STORAGE_KEY = "schwimm_player_session";

type InitialSessionSeed = {
  playerName: string | null;
  session: StoredPlayerSession | null;
};

/** Bietet globalen Zugriff auf den aktuellen Spielernamen. */
export function PlayerSessionProvider({ children }: PropsWithChildren) {
  const initialSeed = useMemo(() => readInitialSessionSeed(), []);
  const [playerSession, setPlayerSession] = useState<StoredPlayerSession | null>(() => initialSeed.session);
  const [currentPlayerName, setCurrentPlayerNameState] = useState<string | null>(() => initialSeed.playerName);
  const [hasConfirmedPlayer, setHasConfirmedPlayer] = useState(Boolean(initialSeed.playerName));

  const persistName = useCallback((value: string | null) => {
    if (!canUseStorage()) return;
    try {
      if (!value) {
        window.localStorage.removeItem(PLAYER_NAME_STORAGE_KEY);
        window.localStorage.removeItem(LEGACY_PLAYER_KEY);
        return;
      }
      window.localStorage.setItem(PLAYER_NAME_STORAGE_KEY, value);
      window.localStorage.setItem(LEGACY_PLAYER_KEY, value);
    } catch {
      /* ignore storage issues */
    }
  }, []);

  const persistPlayerSession = useCallback((next: StoredPlayerSession | null) => {
    setPlayerSession(next);
    if (!canUseStorage()) return;
    try {
      if (!next) {
        window.localStorage.removeItem(PLAYER_SESSION_STORAGE_KEY);
        return;
      }
      const normalized = normalizePlayerSession(next);
      window.localStorage.setItem(PLAYER_SESSION_STORAGE_KEY, JSON.stringify(normalized));
    } catch {
      /* ignore storage issues */
    }
  }, []);

  const applyPlayerName = useCallback(
    (value: string | null) => {
      if (!value) {
        setCurrentPlayerNameState(null);
        persistName(null);
        return;
      }
      const upper = value.toUpperCase();
      setCurrentPlayerNameState(upper);
      persistName(upper);

      if (value && hasConfirmedPlayer) {
        const nextSession: StoredPlayerSession = {
          playerName: upper,
          lobbyId: playerSession?.lobbyId,
          lobbyName: playerSession?.lobbyName,
          resumeKey: playerSession?.resumeKey,
          lastLoginAt: Date.now(),
        };
        persistPlayerSession(nextSession);
      }
    },
    [hasConfirmedPlayer, persistName, persistPlayerSession, playerSession?.lastLoginAt, playerSession?.lobbyId, playerSession?.lobbyName, playerSession?.resumeKey]
  );

  const setCurrentPlayerName = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      applyPlayerName(trimmed.length > 0 ? trimmed : null);
    },
    [applyPlayerName]
  );

  const confirmPlayerName = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      const upper = trimmed.toUpperCase();
      applyPlayerName(trimmed.length > 0 ? upper : null);
      if (trimmed.length > 0) {
        const lobbySession = loadSession();
        persistPlayerSession({
          playerName: upper,
          lobbyId: lobbySession?.lobbyId,
          lobbyName: lobbySession?.lobbyName,
          resumeKey: lobbySession?.playerId,
          lastLoginAt: Date.now(),
        });
        setHasConfirmedPlayer(true);
      } else {
        setHasConfirmedPlayer(false);
        persistPlayerSession(null);
      }
    },
    [applyPlayerName, persistPlayerSession]
  );

  const clearCurrentPlayerName = useCallback(() => {
    applyPlayerName(null);
    persistPlayerSession(null);
    setHasConfirmedPlayer(false);
  }, [applyPlayerName, persistPlayerSession]);

  const clearLobbySession = useCallback(
    (lobbyName?: string | null) => {
      const existingName = playerSession?.playerName || currentPlayerName || null;
      if (!existingName) {
        persistPlayerSession(null);
        return;
      }
      const next: StoredPlayerSession = {
        playerName: existingName,
        lobbyId: null,
        lobbyName: lobbyName ? lobbyName.toUpperCase() : null,
        resumeKey: null,
        lastLoginAt: Date.now(),
      };
      persistPlayerSession(next);
    },
    [currentPlayerName, persistPlayerSession, playerSession?.playerName]
  );

  const logout = useCallback(() => {
    clearCurrentPlayerName();
    clearSession();
    resetInitialLoginRequirement();
  }, [clearCurrentPlayerName]);

  const value = useMemo<PlayerSessionContextValue>(
    () => ({
      currentPlayerName,
      setCurrentPlayerName,
      confirmPlayerName,
      hasConfirmedPlayer,
      isLoggedIn: isPlayerSessionFresh(playerSession),
      activeSession: playerSession,
      clearCurrentPlayerName,
      clearLobbySession,
      logout,
    }),
    [clearCurrentPlayerName, clearLobbySession, confirmPlayerName, currentPlayerName, hasConfirmedPlayer, logout, playerSession, setCurrentPlayerName]
  );

  return <PlayerSessionContext.Provider value={value}>{children}</PlayerSessionContext.Provider>;
}

/** Hook, der Zugriff auf den zentralen Spielernamen liefert. */
export function usePlayerSession() {
  const ctx = useContext(PlayerSessionContext);
  if (!ctx) throw new Error("usePlayerSession muss innerhalb eines PlayerSessionProvider genutzt werden.");
  return ctx;
}

function readInitialPlayerName(): string | null {
  const stored = readStorageValue(PLAYER_NAME_STORAGE_KEY) || readStorageValue(LEGACY_PLAYER_KEY);
  if (stored) return stored;
  const session = loadSession();
  return session?.playerName?.trim() || null;
}

// Liest ggf. vorhandene Sessions aus localStorage (auch Legacy), damit Reload/Home direkt in der App bleibt.
function readInitialSessionSeed(): InitialSessionSeed {
  const storedSession = readStoredPlayerSession();
  if (storedSession) return { playerName: storedSession.playerName, session: storedSession };

  const lobbySession = loadSession();
  if (lobbySession?.playerName?.trim()) {
    return {
      playerName: lobbySession.playerName.trim(),
      session: {
        playerName: lobbySession.playerName.trim(),
        lobbyId: lobbySession.lobbyId,
        lobbyName: lobbySession.lobbyName,
        resumeKey: lobbySession.playerId,
        lastLoginAt: lobbySession.updatedAt ?? Date.now(),
      },
    };
  }

  return { playerName: readInitialPlayerName(), session: null };
}

function readStoredPlayerSession(): StoredPlayerSession | null {
  const raw = readStorageValue(PLAYER_SESSION_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredPlayerSession;
    if (!parsed || typeof parsed.playerName !== "string") return null;
    const trimmedName = parsed.playerName.trim().toUpperCase();
    if (!trimmedName) return null;
    const normalized: StoredPlayerSession = {
      playerName: trimmedName,
      lobbyId: parsed.lobbyId ?? null,
      lobbyName: typeof parsed.lobbyName === "string" && parsed.lobbyName.trim().length > 0 ? parsed.lobbyName.toUpperCase() : null,
      resumeKey: parsed.resumeKey ?? null,
      lastLoginAt: typeof parsed.lastLoginAt === "number" && !Number.isNaN(parsed.lastLoginAt) ? parsed.lastLoginAt : Date.now(),
    };
    if (!isPlayerSessionFresh(normalized)) return null;
    return normalized;
  } catch {
    return null;
  }
}

function readStorageValue(key: string): string | null {
  if (!canUseStorage()) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

function canUseStorage() {
  try {
    return typeof window !== "undefined" && "localStorage" in window;
  } catch {
    return false;
  }
}

function isPlayerSessionFresh(session: StoredPlayerSession | null) {
  if (!session?.lastLoginAt) return false;
  return Date.now() - session.lastLoginAt <= MAX_SESSION_AGE_MS;
}

function normalizePlayerSession(session: StoredPlayerSession): StoredPlayerSession {
  return {
    playerName: session.playerName.toUpperCase(),
    lobbyId: session.lobbyId ?? null,
    lobbyName: session.lobbyName ? session.lobbyName.toUpperCase() : null,
    resumeKey: session.resumeKey ?? null,
    lastLoginAt: typeof session.lastLoginAt === "number" && !Number.isNaN(session.lastLoginAt) ? session.lastLoginAt : Date.now(),
  };
}
