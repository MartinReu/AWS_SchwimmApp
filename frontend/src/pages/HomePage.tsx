/**
 * Home/Lobby-Seite der Schwimm-App.
 * Bindet Logo, Quotes, Lobby-/Spieler-Dropdowns und Join/Rejoin-Logik ein
 * und dient als zentraler Einstieg für neue Sessions oder Resume-Flows.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import TeletextHeader from "../components/common/TeletextHeader";
import LobbyLogo from "../components/lobby/LobbyLogo";
import LobbyQuoteBox from "../components/lobby/LobbyQuoteBox";
import LobbyDropdown from "../components/lobby/LobbyDropdown";
import { api, Lobby, Player } from "../api";
import { loadSession, storeSession, getClientSessionId } from "../utils/session";
import { roundPath } from "../utils/paths";
import RootLayout from "../components/common/layout/RootLayout";
import TTButton from "../components/common/ui/TTButton";
import TTPanel from "../components/common/ui/TTPanel";
import TTToolbar from "../components/common/ui/TTToolbar";
import { useJoinOrRejoin, getJoinErrorMessage } from "../hooks/useJoinOrRejoin";
import ResumeGameCallout from "../components/common/ResumeGameCallout";

const MAX_LOBBY_NAME = 22;
const MAX_PLAYER_NAME = 18;
const ENABLE_REJOIN_MODE = String(import.meta.env.VITE_ENABLE_REJOIN_MODE ?? "true").toLowerCase() !== "false";
const UNSAFE_NAME_PATTERN = /[<>]/; // Primitive XSS-Blocke – keine spitzen Klammern in User-Input.

/** Home/Lobby-Steuerung: listet Lobbys, ermöglicht Join/Rejoin und zeigt Resume-CTA. */
export default function HomePage() {
  const navigate = useNavigate();
  const location = useLocation();
  // Rejoin-Route-Infos (Lobbyname/-ID) aus URL und Navigation-State rekonstruieren.
  const rejoinPayload = useMemo(
    () => (ENABLE_REJOIN_MODE ? resolveRejoinPayload(location.search, location.state) : null),
    [location]
  );
  const isRejoinMode = Boolean(rejoinPayload);
  const rejoinLobbyName = rejoinPayload?.lobbyName ?? null;
  const rejoinLobbyId = rejoinPayload?.lobbyId ?? null;
  // Cache der verfügbaren Lobbys aus dem Backend.
  const [lobbies, setLobbies] = useState<Lobby[]>([]);
  // Lade-/Fehlerzustand für die Lobby-Liste.
  const [loading, setLoading] = useState(true);
  const [errorLoad, setErrorLoad] = useState<string | null>(null);

  // Persistierte Sessiondaten (Resume, Präsenz, Client-IDs).
  const session = useMemo(() => loadSession(), []);
  // Wiederverwendete Client-Session-ID, erzeugt falls noch keine existiert.
  const clientSessionId = useMemo(
    () => session?.clientSessionId ?? getClientSessionId() ?? undefined,
    [session]
  );
  // Lobby-Input: bewusst immer leer starten, kein Auto-Fill aus Storage.
  const [lobbyName, setLobbyName] = useState("");
  // Spieler-Input: wird nur durch Nutzeraktion oder Rejoin-Flow gesetzt.
  const [playerName, setPlayerName] = useState("");

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

  useEffect(() => {
    // Rejoin-Modus erzwingt ein leeres Eingabefeld (Namen nur via Dropdown).
    if (isRejoinMode) {
      setPlayerName("");
      setErrPlayer(null);
    }
  }, [isRejoinMode]);

  // Text-Optionen für das Lobby-Dropdown.
  const lobbyOptions = useMemo(() => lobbies.map(l => l.name), [lobbies]);
  // Gesuchte Lobby anhand normalisierter Namen wiederfinden.
  const selectedLobby = useMemo(() => {
    const normalized = normalize(lobbyName);
    return lobbies.find(l => normalize(l.name) === normalized) || null;
  }, [lobbies, lobbyName]);
  const fallbackLobbyTarget = rejoinLobbyId && rejoinPayload ? { id: rejoinLobbyId, name: rejoinPayload.lobbyName } : null;
  const lobbyTarget = (selectedLobby ?? fallbackLobbyTarget) || null;
  const resolvedLobbyId = lobbyTarget?.id ?? null;
  // Lookup-Tabelle Spielername → Player (normalisiert für Case-Insensitive-Vergleich).
  const normalizedPlayerMap = useMemo(() => {
    const map = new Map<string, Player>();
    // Mappt jede Spielerin auf den getrimmten, kleingeschriebenen Namen.
    lobbyPlayers.forEach((player) => map.set(normalize(player.name), player));
    return map;
  }, [lobbyPlayers]);
  // Aktuell im Eingabefeld ausgewählter Spieler (Rejoin).
  const selectedPlayer = playerName.trim() ? normalizedPlayerMap.get(normalize(playerName)) ?? null : null;
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
  // Baut Dropdown-Optionen: bei Rejoin mit Zusatz-Hinweis, sonst simple Strings.
  const playerOptions = useMemo(() => {
    if (!isRejoinMode) return lobbyPlayers.map((player) => player.name);
    return lobbyPlayers.map((player) => ({
      label: player.name,
      value: player.name,
      disabled: false,
      hint:
        player.isActive !== false
          ? "Noch aktiv – geduld mein Kind oder nimm denselben Tab."
        : "Inaktiv – bereit fürs Comeback.",
    }));
  }, [isRejoinMode, lobbyPlayers]);
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
    // Join-Modus: prüft die freie Eingabe auf Länge und Grenzen.
    if (isRejoinMode) return;
    const trimmed = playerName.trim();
    if (!trimmed) setErrPlayer(null);
    else if (hasUnsafeCharacters(trimmed)) setErrPlayer("Keine spitzen Klammern oder HTML in Namen – Sicherheit geht vor.");
    else if (trimmed.length < 2) setErrPlayer("Mindestens 2 Zeichen, dann läuft's.");
    else if (trimmed.length > MAX_PLAYER_NAME) setErrPlayer(`Max. ${MAX_PLAYER_NAME} Zeichen – für wen hälst du dich?`);
    else setErrPlayer(null);
  }, [playerName, isRejoinMode]);

  useEffect(() => {
    // Rejoin-Modus: zwingt zur Auswahl eines existierenden Namens.
    if (!isRejoinMode) return;
    if (!playerName.trim()) {
      setErrPlayer(null);
      return;
    }
    if (!selectedPlayer) {
      setErrPlayer("Bitte schnapp dir einen Namen direkt aus der Liste.");
    } else {
      setErrPlayer(null);
    }
  }, [isRejoinMode, playerName, selectedPlayer]);

  /** Legt eine neue Lobby an und hängt sie optimistisch an die bestehende Liste. */
  async function createLobby() {
    setMsg(null);
    const trimmedName = lobbyName.trim();
    if (errLobby || !trimmedName) return;
    if (hasUnsafeCharacters(trimmedName)) {
      setErrLobby("Dieser Name enthält blockierte Zeichen (< oder >).");
      return;
    }
    setBusyCreate(true);
    try {
      const lobby = await api.createLobby(trimmedName);
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
    const target = lobbyTarget;
    if (!target) {
      setErrLobby("Wähle eine bestehende Lobby oder starte fix eine neue.");
      return;
    }
    if (isRejoinMode) {
      if (!selectedPlayer) {
        setErrPlayer("Bitte nimm einen Namen direkt aus der Liste.");
        return;
      }
    } else if (errPlayer || !playerName.trim()) {
      setErrPlayer("Tippe einen spielbaren Namen ein.");
      return;
    } else if (selectedPlayer && selectedPlayer.isActive !== false) {
      setErrPlayer("Dieser Name ist noch aktiv – schnapp dir einen anderen.");
      return;
    }

    try {
      const trimmed = (isRejoinMode ? selectedPlayer?.name ?? "" : playerName).trim();
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

      const resolvedPlayerName = joinedPlayer.name?.trim() || trimmed;

      const shouldKeepLoseResume =
        session &&
        session.lobbyId === target.id &&
        session.playerId === joinedPlayer.id &&
        session.resumeView === "lose";

      storeSession({
        lobbyId: target.id,
        lobbyName: target.name,
        playerId: joinedPlayer.id,
        playerName: resolvedPlayerName,
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
      if (isRejoinMode) setPlayerName("");

      setMsg(
        mode === "rejoin"
          ? `Zurück im Wasser: ${resolvedPlayerName} → ${target.name}`
          : `Beigetreten: ${resolvedPlayerName} → ${target.name}`
      );
      navigate(roundPath({ lobbyName: target.name, lobbyId: target.id }));
    } catch (error) {
      setErrPlayer(getJoinErrorMessage(error));
    }
  }

  // Flags für UI-Zustände (Button-Enablement, Hinweise).
  const playerListEmpty = Boolean(resolvedLobbyId) && !playersLoading && !playersError && lobbyPlayers.length === 0;
  const hasValidPlayerInput = isRejoinMode ? Boolean(selectedPlayer) : playerName.trim().length >= 2;
  const allowJoinWhenFull = !isLobbyFull || (isRejoinMode && Boolean(selectedPlayer));
  const canCreate = !busyCreate && !errLobby && lobbyName.trim().length >= 2;
  const canJoin = !joiningLobby && !!lobbyTarget && !errPlayer && hasValidPlayerInput && allowJoinWhenFull;

  return (
    <RootLayout
      header={<TeletextHeader />}
      footer={<span className="tt-text text-xs">Schwimm Bruder · Schwimm</span>}
    >
      <div className="space-y-8 pb-8">
        <TTToolbar
          title="Lobby-Kommando"
          description={
            isRejoinMode
              ? "Wiederbeitritt aktiv – schnapp dir deinen alten Slot."
              : "Starte eine neue Runde oder spring in eine laufende Lobby."
          }
          actions={
            <TTButton
              as={Link}
              to="/leaderboard"
              variant="secondary"
              className="justify-center"
            >
              Rangliste
            </TTButton>
          }
        >
          <div className="tt-text text-xs font-black uppercase tracking-[0.3em] text-[var(--tt-text-muted)]">
            {String(lobbies.length).padStart(2, "0")} Lobbys · {String(activePlayerCount).padStart(2, "0")}/08 aktiv
          </div>
        </TTToolbar>

        <LobbyLogo />
        <LobbyQuoteBox />

        <ResumeGameCallout session={session} requireExplicitResume isConfirmed={resumeConfirmed} />

        <div className="grid gap-6">
          <TTPanel title="Gib Lobby" eyebrow=">> Neue Lobby" variant="cyan">
            <LobbyDropdown
              value={lobbyName}
              onChange={setLobbyName}
              options={lobbyOptions}
              maxLen={MAX_LOBBY_NAME}
              error={errLobby}
              placeholder="Breites Becken 24"
              disabled={isRejoinMode}
            />

            <div className="mt-2 space-y-1 text-xs uppercase tracking-[0.2em] text-[var(--tt-text-muted)]">
              {loading && <p role="status">Hole die Lobbys rein …</p>}
              {errorLoad && <p className="text-[var(--tt-danger)]">Ups, Fehlermeldung: {errorLoad}</p>}
            </div>
          </TTPanel>

          <TTPanel
            title={isRejoinMode ? "Wer bist du?" : "Gib Name"}
            eyebrow={isRejoinMode ? ">> Wieder rein" : ">> Neuer Atze"}
            variant="magenta"
          >
            <LobbyDropdown
              value={playerName}
              onChange={setPlayerName}
              options={playerOptions}
              maxLen={MAX_PLAYER_NAME}
              error={errPlayer}
              placeholder={isRejoinMode ? "Name aus Liste picken" : "Boris Becken"}
              disabled={isRejoinMode && (!resolvedLobbyId || playersLoading || !!playersError)}
            />
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
                    Tipp: Wenn du denselben Tab nutzt, bist du sofort wieder drin. Ansonsten wird dein Name nach ca.
                    30–45{"\u00a0"}Sekunden automatisch freigeschaufelt.
                  </p>
                )}
                {allPlayersStillActive && !playersLoading && !playersError && (
                  <p className="text-sm text-[var(--tt-danger)]">
                    Alle Namen sind noch aktiv. Warte kurz oder greif zu dem Gerät, auf dem du zuletzt unterwegs warst.
                  </p>
                )}
                {playerListEmpty && (
                  <p className="text-sm text-[var(--tt-text-muted)]">Gerade keine Atze eingetragen.</p>
                )}
              </div>
            )}
          </TTPanel>

          {isRejoinMode ? (
            <div className="grid gap-4">
              <TTButton
                variant="danger"
                onClick={joinLobby}
                busy={joiningLobby}
                disabled={!canJoin}
                className="w-full justify-center"
              >
                Beitreten
              </TTButton>
            </div>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <TTButton
                  variant="success"
                  onClick={createLobby}
                  busy={busyCreate}
                  disabled={!canCreate}
                  className="w-full justify-center"
                >
                  Lobby eröffnen
                </TTButton>
                <TTButton
                  variant="danger"
                  onClick={joinLobby}
                  busy={joiningLobby}
                  disabled={!canJoin}
                  className="w-full justify-center"
                >
                  Beitreten
                </TTButton>
              </div>
            </>
          )}

          {msg && (
            <p className="tt-text text-sm font-black text-[var(--tt-success)]" aria-live="polite" data-testid="home-status">
              {msg}
            </p>
          )}
        </div>
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
