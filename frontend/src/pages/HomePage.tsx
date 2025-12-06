/**
 * Home/Lobby-Seite der Schwimm-App.
 * Bindet Logo, Quotes, Lobby-/Spieler-Dropdowns und Join/Rejoin-Logik ein
 * und dient als zentraler Einstieg für neue Sessions oder Resume-Flows.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import clsx from "clsx";
import TeletextHeader from "../components/common/TeletextHeader";
import LobbyLogo from "../components/lobby/LobbyLogo";
import LobbyQuoteBox from "../components/lobby/LobbyQuoteBox";
import LobbyDropdown from "../components/lobby/LobbyDropdown";
import { api, Lobby, Player } from "../api";
import { loadSession, storeSession, getClientSessionId, clearSession } from "../utils/session";
import { roundPath } from "../utils/paths";
import RootLayout from "../components/common/layout/RootLayout";
import TTButton from "../components/common/ui/TTButton";
import TTPanel from "../components/common/ui/TTPanel";
import TTPanelCollapsible from "../components/common/ui/TTPanelCollapsible";
import { useJoinOrRejoin, getJoinErrorMessage } from "../hooks/useJoinOrRejoin";
import ResumeGameCallout from "../components/common/ResumeGameCallout";
import { usePlayerSession } from "../context/PlayerSessionContext";

const MAX_LOBBY_NAME = 22;
const MAX_PLAYER_NAME = 18;
const ENABLE_REJOIN_MODE = String(import.meta.env.VITE_ENABLE_REJOIN_MODE ?? "true").toLowerCase() !== "false";
const UNSAFE_NAME_PATTERN = /[<>]/; // Primitive XSS-Blocker – keine spitzen Klammern in User-Input.

/** Home/Lobby-Steuerung: listet Lobbys, ermöglicht Join/Rejoin und zeigt Resume-CTA. */
export default function HomePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentPlayerName, logout } = usePlayerSession();
  const session = useMemo(() => loadSession(), []);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, []);
  const resolvedPlayerName = useMemo(
    () => (currentPlayerName || session?.playerName || "").trim().toUpperCase(),
    [currentPlayerName, session?.playerName]
  );
  const displayPlayerName = resolvedPlayerName ? resolvedPlayerName.toUpperCase() : "";
  // Rejoin-Route-Infos (Lobbyname/-ID) aus URL und Navigation-State rekonstruieren.
  const rejoinPayload = useMemo(
    () => (ENABLE_REJOIN_MODE ? resolveRejoinPayload(location.search, location.state) : null),
    [location]
  );
  const isRejoinMode = Boolean(rejoinPayload);
  const rejoinLobbyName = rejoinPayload?.lobbyName ? rejoinPayload.lobbyName.toUpperCase() : null;
  const rejoinLobbyId = rejoinPayload?.lobbyId ?? null;
  // Cache der verfügbaren Lobbys aus dem Backend.
  const [lobbies, setLobbies] = useState<Lobby[]>([]);
  const [allowedLobbies, setAllowedLobbies] = useState<Lobby[]>([]);
  // Lade-/Fehlerzustand für die Lobby-Liste.
  const [loading, setLoading] = useState(true);
  const [errorLoad, setErrorLoad] = useState<string | null>(null);

  // Wiederverwendete Client-Session-ID, erzeugt falls noch keine existiert.
  const clientSessionId = useMemo(
    () => session?.clientSessionId ?? getClientSessionId() ?? undefined,
    [session]
  );
  // Lobby-Input: bewusst immer leer starten, kein Auto-Fill aus Storage.
  const [lobbyName, setLobbyName] = useState("");

  // Validierungsfehler für Lobby- bzw. Spielerfelder.
  const [errLobby, setErrLobby] = useState<string | null>(null);
  const [errPlayer, setErrPlayer] = useState<string | null>(null);

  // Statusanzeigen für Lobby-Erstellung und generische Meldungen.
  const [busyCreate, setBusyCreate] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // Spielerlisten-Cache für gewählte Lobby.
  const [lobbyPlayers, setLobbyPlayers] = useState<Player[]>([]);
  const [playersLoading, setPlayersLoading] = useState(false);
  const [playersError, setPlayersError] = useState<string | null>(null);
  // Key um Spielerlisten-Polling neu anzustoßen.
  const [playerFetchKey, setPlayerFetchKey] = useState(0);
  // Join/Rejoin-Mutation inkl. Pending-State.
  const { joinOrRejoin: performJoinOrRejoin, isPending: joiningLobby } = useJoinOrRejoin();
  // Signalisiert, ob Resume-CTA serverseitig bestätigt wurde.
  const [resumeConfirmed, setResumeConfirmed] = useState(false);

  useEffect(() => {
    // Initiales Laden der verfügbaren Lobbys aus dem Backend.
    api.listLobbies()
      .then(setLobbies)
      .catch((e) => setErrorLoad(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    // Filtert nur Lobbys, in denen der aktuelle Spieler existiert.
    if (!resolvedPlayerName || !lobbies.length) {
      setAllowedLobbies([]);
      return;
    }
    let active = true;
    const normalizedName = normalize(resolvedPlayerName);
    (async () => {
      const results = await Promise.all(
        lobbies.map(async (lobby) => {
          try {
            const players = await api.listPlayers(lobby.id);
            const match = players.some((player) => normalize(player.name) === normalizedName);
            return match ? lobby : null;
          } catch {
            return null;
          }
        })
      );
      if (!active) return;
      setAllowedLobbies(results.filter(Boolean) as Lobby[]);
    })();
    return () => {
      active = false;
    };
  }, [lobbies, resolvedPlayerName]);

  useEffect(() => {
    // Prüft, ob eine gespeicherte Session weiterhin rejoin-fähig ist.
    setResumeConfirmed(false);
    if (!session?.resumeEligible || !session.lobbyId || !session.playerId) return;
    let alive = true;
    (async () => {
      try {
        const players = await api.listPlayers(session.lobbyId);
        if (!alive) return;
        const normalizedName = normalize(session.playerName);
        const match = players.some(
          (player) => player.id === session.playerId || normalize(player.name) === normalizedName
        );
        setResumeConfirmed(match);
      } catch {
        if (alive) setResumeConfirmed(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [session?.lobbyId, session?.playerId, session?.playerName, session?.resumeEligible]);

  useEffect(() => {
    // Synchronisiert den Lobbynamen aus dem Rejoin-Payload, falls vorhanden.
    if (isRejoinMode && rejoinLobbyName) setLobbyName(rejoinLobbyName);
  }, [isRejoinMode, rejoinLobbyName]);

  // Text-Optionen für das Lobby-Dropdown (nur Lobbys, in denen der Spieler existiert, plus Rejoin-Fallback).
  const lobbyOptions = useMemo(() => {
    const base = allowedLobbies.map((l) => l.name.toUpperCase());
    if (isRejoinMode && rejoinLobbyName && !base.includes(rejoinLobbyName)) {
      return [rejoinLobbyName, ...base];
    }
    return base;
  }, [allowedLobbies, isRejoinMode, rejoinLobbyName]);
  // Gesuchte Lobby anhand normalisierter Namen wiederfinden.
  const selectedLobby = useMemo(() => {
    const normalized = normalize(lobbyName);
    return lobbies.find(l => normalize(l.name) === normalized) || null;
  }, [lobbies, lobbyName]);
  const fallbackLobbyTarget = rejoinLobbyId && rejoinPayload ? { id: rejoinLobbyId, name: rejoinLobbyName ?? rejoinPayload.lobbyName } : null;
  const lobbyTarget = (selectedLobby ?? fallbackLobbyTarget) || null;
  const resolvedLobbyId = lobbyTarget?.id ?? null;
  // Lookup-Tabelle Spielername → Player (normalisiert für Case-Insensitive-Vergleich).
  const normalizedPlayerMap = useMemo(() => {
    const map = new Map<string, Player>();
    // Mappt jede Spielerin auf den getrimmten, kleingeschriebenen Namen.
    lobbyPlayers.forEach((player) => map.set(normalize(player.name), player));
    return map;
  }, [lobbyPlayers]);
  // Aktueller Spieler auf Basis des Login-Namens.
  const selectedPlayer = resolvedPlayerName ? normalizedPlayerMap.get(normalize(resolvedPlayerName)) ?? null : null;
  // Anzahl aktiver Spieler:innen, um Volllobby zu erkennen.
  const activePlayerCount = useMemo(
    () => lobbyPlayers.filter((player) => player.isActive !== false).length,
    [lobbyPlayers]
  );
  // Liste inaktiver Namen – wichtig für Rejoin-Hinweise.
  const inactivePlayers = useMemo(
    () => lobbyPlayers.filter((player) => player.isActive === false),
    [lobbyPlayers]
  );
  const isLobbyFull = activePlayerCount >= 8;
  // Warnt später, wenn noch kein Slot frei ist.
  const allPlayersStillActive = isRejoinMode && inactivePlayers.length === 0 && lobbyPlayers.length > 0;

  useEffect(() => {
    // Lädt Spieler:innen einer ausgewählten Lobby, inklusive Retry-Key.
    if (!resolvedLobbyId) {
      setLobbyPlayers([]);
      setPlayersLoading(false);
      setPlayersError(null);
      return;
    }
    const controller = new AbortController();
    setPlayersLoading(true);
    setPlayersError(null);
    api
      .listPlayers(resolvedLobbyId)
      .then((players) => {
        if (controller.signal.aborted) return;
        setLobbyPlayers(players);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setPlayersError(error?.message || "ich find die scheiß Spielerliste nicht – versuch nochmal...");
        setLobbyPlayers([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setPlayersLoading(false);
      });
    return () => controller.abort();
  }, [resolvedLobbyId, playerFetchKey]);

  /** Erzwingt einen erneuten Fetch der Spielerliste (z. B. nach Fehler). */
  const retryLoadPlayers = () => setPlayerFetchKey((key) => key + 1);

  // Validierung
  useEffect(() => {
    // Validiert den Lobbynamen live, sobald der User tippt.
    const trimmed = lobbyName.trim();
    if (!trimmed) setErrLobby(null);
    else if (!isRejoinMode && !selectedLobby && hasUnsafeCharacters(trimmed))
      setErrLobby("Keine spitzen Klammern oder Script-Schnipsel im Namen.");
    else if (trimmed.length < 2) setErrLobby("Mindestens 2 Zeichen, bitte.");
    else if (trimmed.length > MAX_LOBBY_NAME) setErrLobby(`Max. ${MAX_LOBBY_NAME} Zeichen – Teletext mag's knackig.`);
    else setErrLobby(null);
  }, [isRejoinMode, lobbyName, selectedLobby]);

  useEffect(() => {
    // Spielername kommt jetzt ausschließlich aus dem Login – prüfen, ob er verwendbar ist.
    if (!resolvedPlayerName) {
      setErrPlayer("Kein Spielername gefunden – bitte neu einloggen.");
      return;
    }
    if (hasUnsafeCharacters(resolvedPlayerName)) setErrPlayer("Keine spitzen Klammern oder HTML in Namen – Sicherheit geht vor.");
    else if (resolvedPlayerName.length < 2) setErrPlayer("Mindestens 2 Zeichen, dann läuft's.");
    else if (resolvedPlayerName.length > MAX_PLAYER_NAME) setErrPlayer(`Max. ${MAX_PLAYER_NAME} Zeichen – für wen hälst du dich?`);
    else setErrPlayer(null);
  }, [resolvedPlayerName]);

  useEffect(() => {
    // Rejoin-Modus: Name muss in der Lobby vorkommen.
    if (!isRejoinMode || !resolvedPlayerName) return;
    if (!selectedPlayer && !playersLoading && !playersError) {
      setErrPlayer("Dein Name ist in dieser Lobby nicht vorhanden – wähle eine andere Lobby oder starte neu.");
    } else if (selectedPlayer) {
      setErrPlayer(null);
    }
  }, [isRejoinMode, playersError, playersLoading, resolvedPlayerName, selectedPlayer]);

  /** Legt eine neue Lobby an und hängt sie optimistisch an die bestehende Liste. */
  async function createLobby() {
    setMsg(null);
    const normalizedName = lobbyName.trim().toUpperCase();
    if (errLobby || !normalizedName) return;
    if (hasUnsafeCharacters(normalizedName)) {
      setErrLobby("Dieser Name enthält blockierte Zeichen (< oder >).");
      return;
    }
    setBusyCreate(true);
    try {
      const lobby = await api.createLobby(normalizedName);
      setMsg(`Lobby „${lobby.name}“ steht bereit.`);
      setLobbies((prev) => [lobby, ...prev.filter((entry) => entry.id !== lobby.id)]);
    } catch (e: any) {
      setErrLobby(e.message || "Beim Erstellen gab's ein Problem.");
    } finally {
      setBusyCreate(false);
    }
  }

  /** Handhabt Join- und Rejoin-Flow inkl. Validierung & Session-Persistenz. */
  async function joinLobby() {
    setMsg(null);
    if (!resolvedPlayerName) {
      setErrPlayer("Kein Spielername gefunden – bitte neu einloggen.");
      navigate("/login", { replace: true });
      return;
    }
    const target = lobbyTarget;
    if (!target) {
      setErrLobby("Wähle eine bestehende Lobby oder starte fix eine neue.");
      return;
    }
    if (isRejoinMode) {
      if (!selectedPlayer) {
        setErrPlayer("Dein Name ist in dieser Lobby nicht vorhanden – nimm eine andere oder starte neu.");
        return;
      }
    } else if (errPlayer) {
      return;
    } else if (selectedPlayer && selectedPlayer.isActive !== false) {
      setErrPlayer("Dieser Name ist noch aktiv – schnapp dir einen anderen.");
      return;
    }

    try {
      const trimmed = (isRejoinMode ? selectedPlayer?.name ?? "" : resolvedPlayerName).trim().toUpperCase();
      if (!isRejoinMode && !selectedLobby && hasUnsafeCharacters(trimmed)) {
        setErrPlayer("Name enthält gesperrte Zeichen. Versuch es ohne < oder >.");
        return;
      }
      const normalizedInput = normalize(trimmed);
      const expectsExistingPlayer = normalizedPlayerMap.has(normalizedInput);
      if (isLobbyFull && !expectsExistingPlayer) {
        setErrPlayer("Lobby voll – Rejoin klappt nur, wenn dein Name schon inaktiv ist.");
        return;
      }

      const { player: joinedPlayer, mode } = await performJoinOrRejoin({
        lobbyId: target.id,
        lobbyName: target.name,
        playerName: trimmed,
        clientSessionId,
        expectExisting: expectsExistingPlayer,
      });

      const joinedPlayerName = joinedPlayer.name?.trim() || trimmed;

      const shouldKeepLoseResume =
        session &&
        session.lobbyId === target.id &&
        session.playerId === joinedPlayer.id &&
        session.resumeView === "lose";

      storeSession({
        lobbyId: target.id,
        lobbyName: target.name,
        playerId: joinedPlayer.id,
        playerName: joinedPlayerName,
        ...(clientSessionId ? { clientSessionId } : {}),
        resumeEligible: true,
        updatedAt: Date.now(),
        ...(shouldKeepLoseResume
          ? {
              resumeView: "lose",
              resumeRoundNumber:
                typeof session?.resumeRoundNumber === "number" ? session?.resumeRoundNumber : null,
            }
          : {
              resumeView: null,
              resumeRoundNumber: null,
            }),
      });

      setLobbyPlayers(prev => prev.filter(player => player.id !== joinedPlayer.id));

      setMsg(
        mode === "rejoin"
          ? `Zurück im Wasser: ${joinedPlayerName} → ${target.name}`
          : `Beigetreten: ${joinedPlayerName} → ${target.name}`
      );
      navigate(roundPath({ lobbyName: target.name, lobbyId: target.id }));
    } catch (error) {
      setErrPlayer(getJoinErrorMessage(error));
    }
  }

  // Flags für UI-Zustände (Button-Enablement, Hinweise).
  const playerListEmpty = Boolean(resolvedLobbyId) && !playersLoading && !playersError && lobbyPlayers.length === 0;
  const hasValidPlayerInput = isRejoinMode ? Boolean(selectedPlayer) : resolvedPlayerName.length >= 2;
  const allowJoinWhenFull = !isLobbyFull || (isRejoinMode && Boolean(selectedPlayer));
  const canCreate = !busyCreate && !errLobby && lobbyName.trim().length >= 2;
  const canJoin = !joiningLobby && !!lobbyTarget && !errPlayer && hasValidPlayerInput && allowJoinWhenFull;

  const handleLogout = () => {
    logout();
    clearSession();
    navigate("/login", { replace: true });
  };

  return (
    <RootLayout
      header={<TeletextHeader />}
      footer={<span className="tt-text text-xs">Schwimm Bruder · Schwimm</span>}
    >
      <div className="tt-stack pb-10">
        <LobbyLogo />

        <TTPanel title="Willkommen" eyebrow=">> Spieler 1000" variant="magenta">
          <div className="space-y-2">
            <p className="tt-text text-lg font-black text-white">
              Na Moin{displayPlayerName ? `, ${displayPlayerName}` : ""}!
            </p>
            <p className="text-sm text-[var(--tt-text-muted)]">
              Lobbys, in denen du schon unterwegs warst, erreichst du über die Rangliste.
            </p>
          </div>
          {resolvedLobbyId && (
            <div className="mt-3 space-y-2" aria-live="polite" aria-busy={playersLoading}>
              {playersLoading && (
                <p className="flex items-center gap-2 text-sm text-[var(--tt-text-muted)]" role="status">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Zähle gerade alle Spieler …
                </p>
              )}
              {playersError && (
                <div className="tt-card border-[var(--tt-danger)] bg-red-950/50 text-sm text-white" role="alert">
                  <div className="flex flex-wrap items-center gap-3">
                    <span>Spielerliste klemmt – bitte kurz neu laden.</span>
                    <TTButton type="button" variant="danger" size="md" onClick={retryLoadPlayers}>
                      Noch mal laden
                    </TTButton>
                  </div>
                </div>
              )}
              {isRejoinMode && !playersLoading && !playersError && (
                <p className="text-sm text-[var(--tt-text-muted)]">
                  Tipp: Nutze den gleichen Tab wie zuletzt.
                </p>
              )}
              {allPlayersStillActive && !playersLoading && !playersError && (
                <p className="text-sm text-[var(--tt-danger)]">
                  Rejoin über Lobby Namen & Beitritt
                </p>
              )}
              {playerListEmpty && <p className="text-sm text-[var(--tt-text-muted)]">Gerade keine Atze eingetragen.</p>}
            </div>
          )}
        </TTPanel>

        <TTPanel className="p-0" bodyClassName="p-0">
          <LobbyQuoteBox />
        </TTPanel>

        <TTPanelCollapsible
          title="ADMIN SHIT"
          eyebrow=">> Lobby-Kommando 24"
          variant="danger"
          initialExpanded={false}
        >
          <div className="space-y-3">
            <p className="text-sm text-[var(--tt-text-muted)]">
              {isRejoinMode
                ? "Rejoin ready: gleicher Name + Lobby holen deinen letzten Stand zurück."
                : "Starte eine neue Runde oder spring mit Name + Lobby jederzeit hinein."}
            </p>
            <div className="tt-text text-xs font-black uppercase tracking-[0.3em] text-[var(--tt-text-muted)]">
              {String(lobbies.length).padStart(2, "0")} Lobbys · {String(activePlayerCount).padStart(2, "0")}/08 aktiv
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <TTButton variant="ghost" onClick={handleLogout} className="w-full justify-center">
                Logout
              </TTButton>
              <TTButton as={Link} to="/leaderboard" variant="secondary" className="w-full justify-center">
                Rangliste
              </TTButton>
            </div>
          </div>
        </TTPanelCollapsible>

        <TTPanelCollapsible
          title="Gib Lobby"
          eyebrow=">> Neue Lobby 67"
          variant="cyan"
          initialExpanded={false}
        >
          <div className="space-y-4">
            <LobbyDropdown
              value={lobbyName}
              onChange={setLobbyName}
              options={lobbyOptions}
              maxLen={MAX_LOBBY_NAME}
              error={errLobby}
              placeholder="Breites Becken"
              disabled={isRejoinMode}
            />

            <div className="space-y-1 text-xs uppercase tracking-[0.2em] text-[var(--tt-text-muted)]">
              {loading && <p role="status">Hole die Lobbys rein …</p>}
              {errorLoad && <p className="text-[var(--tt-danger)]">Ups, Fehlermeldung: {errorLoad}</p>}
            </div>

            {isRejoinMode ? (
              <div className="grid gap-3">
                <TTButton
                  variant="danger"
                  onClick={joinLobby}
                  busy={joiningLobby}
                  disabled={!canJoin}
                  className={clsx(
                    "w-full justify-center",
                    !canJoin && "line-through decoration-2 decoration-[var(--tt-danger)] opacity-100"
                  )}
                >
                  Beitreten
                </TTButton>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                <TTButton
                  variant="success"
                  onClick={createLobby}
                  busy={busyCreate}
                  disabled={!canCreate}
                  className={clsx(
                    "w-full justify-center",
                    !canCreate && "line-through decoration-2 decoration-[var(--tt-danger)] opacity-100"
                  )}
                >
                  Lobby eröffnen
                </TTButton>
                <TTButton
                  variant="danger"
                  onClick={joinLobby}
                  busy={joiningLobby}
                  disabled={!canJoin}
                  className={clsx(
                    "w-full justify-center",
                    !canJoin && "line-through decoration-2 decoration-[var(--tt-danger)] opacity-100"
                  )}
                >
                  Beitreten
                </TTButton>
              </div>
            )}

            {msg && (
              <p className="tt-text text-sm font-black text-[var(--tt-success)]" aria-live="polite" data-testid="home-status">
                {msg}
              </p>
            )}
            {errPlayer && (
              <p className="tt-text text-sm font-black text-[var(--tt-danger)]" aria-live="assertive">
                {errPlayer}
              </p>
            )}
          </div>
        </TTPanelCollapsible>

        <ResumeGameCallout
          session={session}
          requireExplicitResume
          isConfirmed={resumeConfirmed}
          lobbyExists={session ? lobbies.some((l) => l.id === session.lobbyId) : false}
          className="w-full"
        />
      </div>
    </RootLayout>
  );
}


/** Normalisiert Strings für Vergleichs- und Lookup-Operationen. */
function normalize(v: string) {
  return v.trim().toLowerCase();
}

type RejoinPayload = {
  lobbyName: string;
  lobbyId?: string;
};

type RejoinLocationState = {
  rejoinLobbyName?: string;
  rejoinLobbyId?: string;
  rejoinSource?: string;
} | null;

/** Extrahiert Rejoin-Infos aus Query-Parametern plus optionalem Navigation-State. */
function resolveRejoinPayload(search: string, state: unknown): RejoinPayload | null {
  const params = new URLSearchParams(search);
  if (params.get("mode") !== "rejoin") return null;
  const routeState = (state ?? null) as RejoinLocationState;
  const lobbyName = params.get("lobby") || routeState?.rejoinLobbyName || "";
  if (!lobbyName.trim()) return null;
  const lobbyId = params.get("lobbyId") || routeState?.rejoinLobbyId || undefined;
  return {
    lobbyName: lobbyName.trim(),
    lobbyId: lobbyId?.trim() ? lobbyId : undefined,
  };
}

/** Minimales Sanitizing: blockiert spitze Klammern, damit Browser kein HTML interpretiert. */
function hasUnsafeCharacters(value: string) {
  return UNSAFE_NAME_PATTERN.test(value);
}

// TODO: Legacy-Namen mit spitzen Klammern serverseitig bereinigen, damit wir die Whitelist irgendwann komplett erzwingen können.
