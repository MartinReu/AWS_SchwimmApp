/**
 * React-Hook, der auf gelöschte Lobbys reagiert und Nutzer:innen zurück auf die Startseite führt.
 * Nutzt SSE-Events sowie HTTP-Fehler-Codes, um Sessions zu räumen und den Router sauber umzuleiten.
 * Der Hook kapselt Routing-, Session- und Cleanup-Logik und liefert eine handleLobbyMissingError-Hilfe für API-Fehler.
 */
import { useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { subscribeLobbyEvents, type LobbyDeletedEvent } from "../api/lobbyEvents";
import { clearSession } from "../utils/session";
import { usePlayerSession } from "../context/PlayerSessionContext";

export type LobbyDeletionGuardOptions = {
  lobbyId?: string | null;
  lobbyName?: string | null;
  disabled?: boolean;
};

function isLobbyMissingError(error: unknown) {
  if (!error) return false;
  const status = (error as { status?: number })?.status;
  if (status === 404 || status === 410) return true;
  const message = error instanceof Error && typeof error.message === "string" ? error.message.toLowerCase() : "";
  if (!message) return false;
  return (
    message.includes("lobby nicht gefunden") ||
    message.includes("lobby nicht verf") ||
    message.includes("not found") ||
    message.includes("does not exist")
  );
}

export function useLobbyDeletionGuard({ lobbyId, lobbyName, disabled }: LobbyDeletionGuardOptions = {}) {
  const navigate = useNavigate();
  const { clearLobbySession } = usePlayerSession();
  const handledRef = useRef(false);
  const latest = useRef<{ lobbyId: string | null; lobbyName: string | null }>({
    lobbyId: lobbyId ?? null,
    lobbyName: lobbyName ?? null,
  });

  useEffect(() => {
    latest.current = { lobbyId: lobbyId ?? null, lobbyName: lobbyName ?? null };
  }, [lobbyId, lobbyName]);

  const onLobbyDeleted = useCallback(
    (payload?: Partial<LobbyDeletedEvent>) => {
      if (handledRef.current) return true;
      handledRef.current = true;
      clearSession();
      clearLobbySession?.(payload?.lobbyName ?? latest.current.lobbyName ?? null);
      navigate("/", {
        replace: true,
        state: {
          lobbyDeleted: {
            lobbyId: payload?.lobbyId ?? latest.current.lobbyId ?? undefined,
            lobbyName: payload?.lobbyName ?? latest.current.lobbyName ?? undefined,
          },
        },
      });
      return true;
    },
    [clearLobbySession, navigate]
  );

  const handleLobbyMissingError = useCallback(
    (error: unknown) => {
      if (isLobbyMissingError(error)) {
        return onLobbyDeleted();
      }
      return false;
    },
    [onLobbyDeleted]
  );

  useEffect(() => {
    const currentLobbyId = latest.current.lobbyId;
    if (disabled || !currentLobbyId) return;
    return subscribeLobbyEvents({
      lobbyId: currentLobbyId,
      onDeleted: (event) => {
        if (event?.lobbyId !== currentLobbyId) return;
        onLobbyDeleted(event);
      },
    });
  }, [disabled, onLobbyDeleted]);

  return {
    onLobbyDeleted,
    handleLobbyMissingError,
    hasHandledLobbyDeletion: () => handledRef.current,
  };
}
