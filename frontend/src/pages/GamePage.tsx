/**
 * Game-Ansicht inkl. Lives, Spielerlisten und Slider zum Rundenabschluss.
 * Kümmert sich um Session-Persistenz, Presence-Pings, Auto-Boot im DEV und um alle Redirects zwischen Lose/Win.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import TeletextHeader from "../components/common/TeletextHeader";
import LifeSticks from "../components/game/LifeSticks";
import GamePlayerList from "../components/game/GamePlayerList";
import EndRoundSlider from "../components/game/EndRoundSlider";
import SchwimmstBanner from "../components/game/SchwimmstBanner";
import { api, LifeState, Player, Round, Score } from "../api";
import { useLobbyParams } from "../hooks/useLobbyParams";
import { useRoundParams } from "../hooks/useRoundParams";
import { losePath, roundPath, winPath, withSearch } from "../utils/paths";
import { getClientSessionId, loadSession, persistClientSessionId, storeSession, updateSession, type ResumeView } from "../utils/session";
import RootLayout from "../components/common/layout/RootLayout";
import TTPanel from "../components/common/ui/TTPanel";
import TTButton from "../components/common/ui/TTButton";
import TTPanelCollapsible from "../components/common/ui/TTPanelCollapsible";
import { useJoinOrRejoin, isJoinMutationError } from "../hooks/useJoinOrRejoin";
import { startPresence } from "../lib/sessionPresence";
import RouteGuardNotice from "../components/common/RouteGuardNotice";
import { useLobbyDeletionGuard } from "../hooks/useLobbyDeletionGuard";

const AUTO_BOOT = import.meta.env.VITE_DEV_AUTO_BOOT === "1";

type CurrentRoundBundle = { round: Round; lives: LifeState[]; scores: Score[] };

/** Spieloberfläche: synchronisiert Lives/Scores, reagiert auf Rundenevents und verwaltet Präsenz. */
export default function GamePage() {
  const navigate = useNavigate();
  const { lobbyName: routeLobbyName, lobbyId: lobbyIdFromParams } = useLobbyParams();
  const { roundNumber: roundNumberParam } = useRoundParams();
  const [sp] = useSearchParams();
  const queryPlayerId = sp.get("playerId") || "";
  const queryPlayerName = sp.get("playerName") || "";

  const sessionSeed = useMemo(() => loadSession(), []);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, []);
  const [clientSessionId, setClientSessionId] = useState<string | undefined>(
    () => sessionSeed?.clientSessionId ?? getClientSessionId() ?? undefined
  );
  const hasPlayerContext = Boolean(queryPlayerId || sessionSeed?.playerId);
  const hasLobbyContext = Boolean(routeLobbyName || lobbyIdFromParams || sessionSeed?.lobbyName || sessionSeed?.lobbyId);
  const guardActive = !AUTO_BOOT && (!hasPlayerContext || !hasLobbyContext); // Security/URL-Guard: blockt nackten Direktzugriff ohne Session.

  const [lobbyId, setLobbyId] = useState(() => lobbyIdFromParams || sessionSeed?.lobbyId || "");
  const [playerId, setPlayerId] = useState(() => queryPlayerId || sessionSeed?.playerId || "");
  const [playerName] = useState(
    () => (sessionSeed?.playerName || queryPlayerName || getOrMakePlayerName()).trim().toUpperCase()
  );

  const applySessionId = useCallback(
    (nextId?: string | null) => {
      if (!nextId || !nextId.trim()) return;
      const normalized = persistClientSessionId(nextId) ?? nextId.trim();
      setClientSessionId(normalized);
      if (sessionRef.current) {
        sessionRef.current = {
          ...sessionRef.current,
          clientSessionId: normalized,
          updatedAt: Date.now(),
        };
      }
    },
    []
  );

  const [lobbyTitle, setLobbyTitle] = useState(
    (routeLobbyName || sessionSeed?.lobbyName || "").toUpperCase()
  );
  const [round, setRound] = useState<Round | null>(null);
  const [lives, setLives] = useState<LifeState[]>([]);
  const [scores, setScores] = useState<Score[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [booting, setBooting] = useState(true);
  const [leaderCelebrationKey, setLeaderCelebrationKey] = useState(0);

  const startingRoundRef = useRef(false);
  const forcedLoseRoundRef = useRef<number | null>(null);
  const sessionRef = useRef(sessionSeed);
  const { joinOrRejoin: performJoinOrRejoin } = useJoinOrRejoin();

  const myLife = useMemo(
    () => lives.find((l) => l.playerId === playerId) || null,
    [lives, playerId]
  );

  const isRunning = round?.state === "running";
  const currentRoundNumber = round?.number ?? null;
  const showSchwimmst = useMemo(
    () => !!myLife && myLife.livesRemaining === 1 && isRunning,
    [myLife, isRunning]
  );

  const effectiveLobbyName = lobbyTitle || routeLobbyName?.toUpperCase() || sessionRef.current?.lobbyName || "";
  const { handleLobbyMissingError } = useLobbyDeletionGuard({
    lobbyId,
    lobbyName: effectiveLobbyName,
  });

  type SessionPersistPartial = {
    lobbyId?: string;
    lobbyName?: string;
    playerId?: string;
    playerName?: string;
    resumeView?: ResumeView | null;
    resumeRoundNumber?: number | null;
    clientSessionId?: string | null;
  };

  /**
   * Hält die gespeicherte Session synchron mit Lobby-/Player-/Resume-Informationen.
   * Erwartet nur die geänderten Felder (partial); fehlende Werte stammen aus State/SessionRef.
   * Aktualisiert localStorage und den in-memory-Ref, damit Hooks konsistent bleiben.
   */
  const persistSession = useCallback(
    (partial: SessionPersistPartial) => {
      const prev = sessionRef.current;
      const payload = {
        lobbyId: partial.lobbyId ?? lobbyId ?? prev?.lobbyId ?? "",
        lobbyName: partial.lobbyName ?? effectiveLobbyName ?? prev?.lobbyName ?? "",
        playerId: partial.playerId ?? playerId ?? prev?.playerId ?? "",
        playerName: partial.playerName ?? playerName ?? prev?.playerName ?? "",
        resumeView:
          partial.resumeView === undefined
            ? prev?.resumeView
            : partial.resumeView || undefined,
        resumeRoundNumber:
          partial.resumeRoundNumber === undefined
            ? prev?.resumeRoundNumber
            : partial.resumeRoundNumber ?? null,
      };
      const sessionToken = partial.clientSessionId ?? clientSessionId ?? prev?.clientSessionId;
      const withSessionId = sessionToken ? { ...payload, clientSessionId: sessionToken } : payload;
      const nextPayload = {
        ...withSessionId,
        resumeEligible: true,
        lobbyName: (withSessionId.lobbyName ?? "").toUpperCase(),
        playerName: (withSessionId.playerName ?? "").toUpperCase(),
      };

      if (!payload.lobbyId || !payload.lobbyName || !payload.playerId || !payload.playerName) {
        return;
      }
      if (prev) {
        sessionRef.current =
          updateSession(nextPayload) || { ...prev, ...nextPayload, updatedAt: Date.now() };
      } else {
        storeSession(nextPayload);
        sessionRef.current = { ...nextPayload, updatedAt: Date.now() };
      }
    },
    [clientSessionId, effectiveLobbyName, lobbyId, playerId, playerName]
  );

  useEffect(() => {
    if (lobbyIdFromParams && lobbyIdFromParams !== lobbyId) {
      setLobbyId(lobbyIdFromParams);
      persistSession({ lobbyId: lobbyIdFromParams });
    }
  }, [lobbyIdFromParams, lobbyId, persistSession]);

  useEffect(() => {
    if (!lobbyId && routeLobbyName) {
      let alive = true;
      const resolveId = async () => {
        try {
          const available = await api.listLobbies();
          const match = available.find((l) => l.name.toLowerCase() === routeLobbyName.toLowerCase());
          if (match && alive) {
            setLobbyId(match.id);
            persistSession({ lobbyId: match.id, lobbyName: match.name });
          }
        } catch (e: any) {
          if (alive) setErr(e?.message ?? "Lobby konnte nicht geladen werden");
        }
      };
      resolveId();
      return () => {
        alive = false;
      };
    }
  }, [lobbyId, persistSession, routeLobbyName]);

  // DEV-Autoboot: legt eine eigene Lobby an, wenn keine existiert und AUTO_BOOT aktiv ist.
  useEffect(() => {
    let alive = true;
    const doAutoBoot = async () => {
      if (!AUTO_BOOT || lobbyId) return;
      try {
        setBooting(true);
        const devName = `DEV-${new Date().toLocaleTimeString("de-DE", { hour12: false })}`;
        const lb = await api.createLobby(devName);
        const { player: me, sessionId: serverSessionId } = await performJoinOrRejoin({
          lobbyId: lb.id,
          lobbyName: lb.name,
          playerName,
          clientSessionId,
        });

        if (serverSessionId) {
          applySessionId(serverSessionId);
        }

        if (!alive) return;
        persistSession({ lobbyId: lb.id, lobbyName: lb.name, playerId: me.id, playerName });
        setLobbyId(lb.id);
        setPlayerId(me.id);
        setLobbyTitle(lb.name.toUpperCase());
        setErr(null);
        navigate(roundPath({ lobbyName: lb.name, lobbyId: lb.id }), { replace: true });
      } catch (e: any) {
        if (alive) setErr(e?.message ?? "Autoboot fehlgeschlagen");
      } finally {
        if (alive) setBooting(false);
      }
    };
    doAutoBoot();
    return () => {
      alive = false;
    };
  }, [applySessionId, clientSessionId, lobbyId, navigate, performJoinOrRejoin, persistSession, playerName]);

  // Hauptinitialisierung + Polling: lädt Lobby, Runde, Lives und Spieler und hält diese Werte aktuell.
  useEffect(() => {
    if (!lobbyId) return;
    let alive = true;

    const init = async () => {
      try {
        setBooting(true);

        const current = await ensureCurrentRound(lobbyId);
        const ensured = await ensurePlayerInLobby(lobbyId, playerName);

        const [lb, ps] = await Promise.all([api.getLobby(lobbyId), api.listPlayers(lobbyId)]);
        if (!alive) return;

        setLobbyTitle(lb.name.toUpperCase());
        persistSession({ lobbyName: lb.name });

        if (!playerId) {
          const me = ensured || ps.find((p) => p.name === playerName);
          if (me) {
            setPlayerId(me.id);
            persistSession({ playerId: me.id });
          }
        }

        setRound(current.round);
        setLives(current.lives);
        setScores(current.scores);
        setPlayers(ps);
        setErr(null);
      } catch (e: any) {
        if (handleLobbyMissingError(e)) return;
        if (alive) setErr(e?.message ?? "Fehler beim Start");
      } finally {
        if (alive) setBooting(false);
      }
    };

    init();

    const t = setInterval(async () => {
      try {
        const [lb, current, ps] = await Promise.all([
          api.getLobby(lobbyId),
          getSafeCurrentRound(lobbyId),
          api.listPlayers(lobbyId),
        ]);
        if (!alive) return;
        setLobbyTitle(lb.name.toUpperCase());
        setRound(current.round);
        setLives(current.lives);
        setScores(current.scores);
        setPlayers(ps);

        if (!playerId) {
          const me = ps.find((p) => p.name === playerName);
          if (me) {
            setPlayerId(me.id);
            persistSession({ playerId: me.id });
          }
        }
      } catch (error) {
        if (handleLobbyMissingError(error)) return;
      }
    }, 2000);

    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [handleLobbyMissingError, lobbyId, playerId, playerName, persistSession]);

  useEffect(() => {
    if (!lobbyId || !playerId || !clientSessionId) return;
    return startPresence({ lobbyId, playerId, clientSessionId });
  }, [clientSessionId, lobbyId, playerId]);

  useEffect(() => {
    if (!round?.number || !effectiveLobbyName) return;
    if (roundNumberParam === round.number) return;
    navigate(roundPath({ lobbyName: effectiveLobbyName, lobbyId, roundNumber: round.number }), { replace: true });
  }, [effectiveLobbyName, lobbyId, navigate, round?.number, roundNumberParam]);

  useEffect(() => {
    if (!round || round.state !== "finished" || !round.winnerPlayerId || !effectiveLobbyName) return;
    persistSession({ resumeView: "win", resumeRoundNumber: round.number ?? null });
    navigate(winPath({ lobbyName: effectiveLobbyName, lobbyId }));
  }, [effectiveLobbyName, lobbyId, navigate, persistSession, round?.number, round?.state, round?.winnerPlayerId]);

  useEffect(() => {
    if (!round || round.state !== "running") return;
    if (sessionRef.current?.resumeView !== "win") return;
    persistSession({ resumeView: null, resumeRoundNumber: round.number ?? null });
  }, [persistSession, round?.number, round?.state]);

  const myLifeValue = myLife?.livesRemaining ?? 4;

  /** Holt oder erzeugt die aktuelle Runde, inklusive Retry bei frischen Lobbys. */
  async function ensureCurrentRound(lobbyId: string): Promise<CurrentRoundBundle> {
    try {
      const res = await api.getCurrentRound(lobbyId);
      return { round: res.round, lives: res.lives, scores: res.scores ?? [] };
    } catch (e: any) {
      const msg = String(e?.message || "");
      if (msg.includes("Keine Runde") || msg.includes("404")) {
        if (startingRoundRef.current) {
          await sleep(250);
          const again = await api.getCurrentRound(lobbyId);
          return { round: again.round, lives: again.lives, scores: again.scores ?? [] };
        }
        startingRoundRef.current = true;
        try {
          const r = await api.startNextRound(lobbyId);
          const confirmed = await api.getCurrentRound(lobbyId);
          return { round: confirmed.round, lives: confirmed.lives, scores: confirmed.scores ?? [] };
        } finally {
          startingRoundRef.current = false;
        }
      }
      throw e;
    }
  }

  /** Polling-Helfer ohne Auto-Start, nutzt direkten Backend-Status. */
  async function getSafeCurrentRound(lobbyId: string): Promise<CurrentRoundBundle> {
    const res = await api.getCurrentRound(lobbyId);
    return { round: res.round, lives: res.lives, scores: res.scores ?? [] };
  }

  /** Prüft, ob der aktuelle Spieler existiert, und führt sonst einen Join/Rejoin aus. */
  async function ensurePlayerInLobby(lobbyId: string, pname: string) {
    if (!pname) return null;
    const normalizedName = normalizePlayerName(pname);
    const ps = await api.listPlayers(lobbyId);
    const existing = ps.find((p) => normalizePlayerName(p.name) === normalizedName);
    try {
      const { player, sessionId: serverSessionId } = await performJoinOrRejoin({
        lobbyId,
        lobbyName: lobbyTitle || routeLobbyName || sessionRef.current?.lobbyName,
        playerName: existing?.name ?? pname,
        clientSessionId,
        forceRejoin: true,
      });
      if (serverSessionId) applySessionId(serverSessionId);
      return player;
    } catch (error) {
      if (isJoinMutationError(error)) {
        if (
          error.code === "NAME_ACTIVE" ||
          error.code === "NAME_TAKEN" ||
          error.code === "LOBBY_FULL" ||
          error.code === "MAX_PLAYERS"
        ) {
          return existing ?? resolveExistingPlayerRecord(lobbyId, normalizedName);
        }
      }
      throw error;
    }
  }

  function sleep(ms: number) {
    return new Promise((res) => setTimeout(res, ms));
  }

  /** Optimistisch Lives schreiben und mit Serverantwort abgleichen. */
  async function updateMyLife(nextLives: number) {
    if (!round || !myLife) return;
    const prevLivesEntry = myLife;
    setLives((prev) =>
      prev.map((l) => (l.playerId === prevLivesEntry.playerId ? { ...l, livesRemaining: nextLives } : l))
    );
    try {
      const updated = await api.updateLife(round.id, prevLivesEntry.playerId, nextLives, clientSessionId);
      setLives((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
      setErr(null);
    } catch (e: any) {
      setLives((prev) =>
        prev.map((l) =>
          l.playerId === prevLivesEntry.playerId ? { ...l, livesRemaining: prevLivesEntry.livesRemaining } : l
        )
      );
      setErr(e?.message ?? "Fehler beim Aktualisieren der Leben");
    }
  }

  /** Meldet das Rundenergebnis per Slider-Aktion und navigiert zum Win-Screen. */
  async function finishByWinner() {
    if (!round || !playerId || !effectiveLobbyName) return;
    setBusy(true);
    try {
      const r = await api.finishRound(round.id, playerId, clientSessionId);
      setRound(r.round);
      setScores(r.scores);
      setErr(null);
      navigate(winPath({ lobbyName: effectiveLobbyName, lobbyId }));
    } catch (e: any) {
      setErr(e?.message ?? "Fehler beim Beenden der Runde");
    } finally {
      setBusy(false);
    }
  }

  /** Öffnet den Lose-Screen und persistiert den Resume-Context. */
  const openLose = useCallback(
    (roundOverride?: number | null) => {
      if (!lobbyId || !playerId || !effectiveLobbyName) return;
      const targetRoundNumber = roundOverride ?? currentRoundNumber ?? roundNumberParam;
      const base = losePath({ lobbyName: effectiveLobbyName, lobbyId, roundNumber: targetRoundNumber });
      persistSession({ resumeView: "lose", resumeRoundNumber: targetRoundNumber ?? null });
      navigate(
        withSearch(base, {
          playerId,
          playerName,
          roundNumber: targetRoundNumber ?? undefined,
        })
      );
    },
    [currentRoundNumber, effectiveLobbyName, lobbyId, navigate, persistSession, playerId, playerName, roundNumberParam]
  );

  useEffect(() => {
    if (sessionSeed?.resumeView !== "lose") return;
    if (!playerId) return;
    openLose(sessionSeed.resumeRoundNumber ?? roundNumberParam ?? null);
  }, [openLose, playerId, roundNumberParam, sessionSeed?.resumeRoundNumber, sessionSeed?.resumeView]);

  useEffect(() => {
    if (sessionRef.current?.resumeView !== "lose") return;
    if (!myLife || myLife.livesRemaining <= 0) return;
    persistSession({ resumeView: null, resumeRoundNumber: round?.number ?? null });
  }, [myLife?.livesRemaining, persistSession, round?.number]);

  const playerCounter = String(players.length).padStart(2, "0");
  const roundLabel = round?.number ? round.number.toString().padStart(2, "0") : "-";
  const lobbyDisplayName = booting ? "Lade Lobby ..." : (lobbyTitle || routeLobbyName?.toUpperCase() || "Unbenannte Lobby");
  const contentFrameClass = "w-full max-w-4xl mx-auto px-2 sm:px-4";

  useEffect(() => {
    if (!isRunning || (myLife && myLife.livesRemaining > 0)) {
      forcedLoseRoundRef.current = null;
    }
  }, [currentRoundNumber, isRunning, myLife?.livesRemaining]);

  useEffect(() => {
    if (!isRunning) return;
    if (!myLife || myLife.livesRemaining > 0) return;
    if (!playerId || !effectiveLobbyName) return;
    const roundKey = currentRoundNumber ?? -1;
    if (forcedLoseRoundRef.current === roundKey) return;
    forcedLoseRoundRef.current = roundKey;
    openLose(currentRoundNumber ?? roundNumberParam);
  }, [currentRoundNumber, effectiveLobbyName, isRunning, myLife?.livesRemaining, openLose, playerId, roundNumberParam]);

  return guardActive ? (
    <RootLayout
      header={<TeletextHeader mode="GAME" />}
      footer={<span className="tt-text text-xs">Lobby-Zugriff nötig</span>}
    >
      <div className={`tt-stack pb-10 ${contentFrameClass}`}>
        <RouteGuardNotice
          title="Spiel nicht erreichbar"
          description="Kein Spieler- oder Lobby-Kontext gefunden. Bitte tritt zuerst über die Lobby-Seite bei, damit wir dich eindeutig zuordnen können."
          actionLabel="Zur Lobby"
          actionTo="/"
        />
      </div>
    </RootLayout>
  ) : (
    <RootLayout
      header={<TeletextHeader mode="GAME" />}
      footer={<span className="tt-text text-xs">Lobby: {effectiveLobbyName || "-"}</span>}
    >
      <div className={`tt-stack pb-10`}>
        <TTPanelCollapsible
          title={lobbyDisplayName || "Unbenannte Lobby"}
          eyebrow=">> DU HAST OPTIONEN 666"
          initialExpanded={false}
          variant="default"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="tt-toolbar__description m-0">{`Runde ${roundLabel} - ${playerCounter}/08 Spieler im Boot`}</p>
            <div className="flex w-full flex-wrap justify-center gap-2 sm:w-auto sm:justify-end">
              <TTButton as={Link} to="/" variant="ghost" className="w-full justify-center sm:w-auto">
                Home
              </TTButton>
              <TTButton as={Link} to="/leaderboard" variant="secondary" className="w-full justify-center sm:w-auto">
                Rangliste
              </TTButton>
            </div>
          </div>
        </TTPanelCollapsible>

        <TTPanel title="So siehts aus" eyebrow=">> Lagebericht 321" variant="cyan">
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <div className="tt-text text-3xl sm:text-4xl font-black uppercase tracking-[0.2em] text-[var(--tt-secondary)]">
              Runde
            </div>
            <div className="tt-text text-5xl sm:text-6xl font-black text-white tabular-nums">{roundLabel}</div>
          </div>
          <p className="mt-2 text-sm uppercase tracking-[0.2em] text-[var(--tt-text-muted)]">
            {isRunning ? "Runde läuft - bleib fokussiert" : "Warte auf Ergebnis - einmal tief durchatmen."}
          </p>
        </TTPanel>

        {!showSchwimmst ? (
          <TTPanel title="Leben" eyebrow=">> Justiere 456" variant="magenta" className="tt-transparent-panel">
            <LifeSticks
              className="mt-2"
              lives={myLifeValue}
              onChange={updateMyLife}
              disabled={!isRunning}
              roundId={round?.id}
            />
          </TTPanel>
        ) : (
          <TTPanel title="Reiß dich zamm!" eyebrow=">> Letzte Chance 000" variant="danger">
            <SchwimmstBanner className="mt-2" onBubblesClick={openLose} />
          </TTPanel>
        )}

        <TTPanel title="Spieler:innen" eyebrow=">> Reihenfolge 1010" variant="cyan" className="tt-transparent-panel">
          <div className="flex items-center justify-between gap-3 text-sm uppercase tracking-[0.2em] text-[var(--tt-text-muted)]">
            <span className="text-left">
              <span className="tabular-nums text-white">{playerCounter}</span>/08 Spieler
            </span>
            <span className="ml-auto pr-2 text-right">
              {scores.length ? "Punkte Ticker" : "Noch keine Punkte eingetrudelt"}
            </span>
          </div>
          <GamePlayerList
            className="mt-3 w-full"
            players={players}
            scores={scores}
            maxVisible={4}
            currentPlayerId={playerId || undefined}
            currentPlayerName={playerName || undefined}
            leaderCelebrationKey={leaderCelebrationKey}
          />
        </TTPanel>

        <TTPanel title="Runde melden" eyebrow=">> Gewinner durchgeben 999" variant="danger" className="tt-transparent-panel">
          <EndRoundSlider
            onComplete={() => {
              setLeaderCelebrationKey((key) => key + 1);
              finishByWinner();
            }}
            disabled={busy || booting || !playerId}
          />
        </TTPanel>

        {err && (
          <p className="tt-text text-sm font-black text-[var(--tt-danger)]" aria-live="assertive">
            {err}
          </p>
        )}
      </div>
    </RootLayout>
  );
}

/** Liefert einen zufälligen Spielernamen als lokaler Fallback. */
function getOrMakePlayerName(): string {
  const key = "schwimm_playerName";
  const fallback = () => `SPIELER_${Math.floor(Math.random() * 900 + 100)}`;
  try {
    if (typeof window === "undefined" || !("localStorage" in window)) {
      return fallback();
    }
    const stored = window.localStorage.getItem(key);
    if (stored) return stored.toUpperCase();
    const generated = fallback();
    window.localStorage.setItem(key, generated);
    return generated;
  } catch {
    // Defensive: Safari Private Mode & Co. werfen hier, deshalb lokal erzeugen (Security-Hardening).
    return fallback();
  }
}

function normalizePlayerName(value: string) {
  return value.trim().toLowerCase();
}

/** Sucht Spielerdaten nach einer Konfliktantwort, um IDs zu rekonstruieren. */
async function resolveExistingPlayerRecord(lobbyId: string, normalizedName: string): Promise<Player | null> {
  try {
    const players = await api.listPlayers(lobbyId);
    return players.find((player) => normalizePlayerName(player.name) === normalizedName) ?? null;
  } catch {
    return null;
  }
}
