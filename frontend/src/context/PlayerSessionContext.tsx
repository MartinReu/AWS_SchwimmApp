/**
 * PlayerSessionContext
 * Speichert den aktuell gewählten Spielernamen zentral und sorgt dafür,
 * dass Login- und Lobby-Flows denselben Wert teilen (inkl. localStorage-Persistenz).
 */
import { createContext, PropsWithChildren, useCallback, useContext, useMemo, useState } from "react";
import { clearSession, loadSession } from "../utils/session";

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
      window.localStorage.setItem(PLAYER_SESSION_STORAGE_KEY, JSON.stringify(next));
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
          lastLoginAt: playerSession?.lastLoginAt ?? Date.now(),
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

  const logout = useCallback(() => {
    clearCurrentPlayerName();
    clearSession();
  }, [clearCurrentPlayerName]);

  const value = useMemo<PlayerSessionContextValue>(
    () => ({
      currentPlayerName,
      setCurrentPlayerName,
      confirmPlayerName,
      hasConfirmedPlayer,
      isLoggedIn: Boolean(playerSession?.playerName),
      activeSession: playerSession,
      clearCurrentPlayerName,
      logout,
    }),
    [clearCurrentPlayerName, confirmPlayerName, currentPlayerName, hasConfirmedPlayer, logout, playerSession, setCurrentPlayerName]
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
    return {
      playerName: trimmedName,
      lobbyId: parsed.lobbyId ?? null,
      lobbyName: parsed.lobbyName ?? null,
      resumeKey: parsed.resumeKey ?? null,
      lastLoginAt: typeof parsed.lastLoginAt === "number" && !Number.isNaN(parsed.lastLoginAt) ? parsed.lastLoginAt : Date.now(),
    };
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
