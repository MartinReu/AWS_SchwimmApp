/**
 * Gewinnerseite, die den Rundenabschluss feiert, Presence-Pings fortsetzt und neue Runden starten kann.
 * Wird vom GameScreen nach `api.finishRound` angesteuert und synchronisiert sich per Polling mit dem Backend.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import TeletextHeader from "../components/common/TeletextHeader";
import winnerGif from "../assets/ui/winner.gif";
import { api, Player } from "../api";
import { useLobbyParams } from "../hooks/useLobbyParams";
import { getClientSessionId, loadSession, updateSession } from "../utils/session";
import { roundPath } from "../utils/paths";
import RootLayout from "../components/common/layout/RootLayout";
import TTPanel from "../components/common/ui/TTPanel";
import TTButton from "../components/common/ui/TTButton";
import TTPanelCollapsible from "../components/common/ui/TTPanelCollapsible";
import { startPresence } from "../lib/sessionPresence";
import RouteGuardNotice from "../components/common/RouteGuardNotice";
import { useLobbyDeletionGuard } from "../hooks/useLobbyDeletionGuard";

/** Gewinner-Ansicht: zeigt den Sieger, hält Spieler präsent und startet neue Runden. */
export default function WinPage() {
  const navigate = useNavigate();
  const { lobbyName: routeLobbyName, lobbyId: lobbyIdFromParams } = useLobbyParams();
  const sessionSeed = useMemo(() => loadSession(), []);

  const [lobbyId, setLobbyId] = useState(() => lobbyIdFromParams || sessionSeed?.lobbyId || "");
  const [lobbyName, setLobbyName] = useState(routeLobbyName || sessionSeed?.lobbyName || "");
  const [players, setPlayers] = useState<Player[]>([]);
  const [winnerPlayerId, setWinnerPlayerId] = useState<string | null>(null);
  const [roundNumber, setRoundNumber] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyNext, setBusyNext] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveLobbyName = lobbyName || routeLobbyName || sessionSeed?.lobbyName || "";
  const storedPlayerId = sessionSeed?.playerId ?? "";
  const clientSessionId = useMemo(
    () => sessionSeed?.clientSessionId ?? getClientSessionId() ?? undefined,
    [sessionSeed]
  );
  const hasLobbyContext = Boolean(routeLobbyName || lobbyIdFromParams || sessionSeed?.lobbyName || sessionSeed?.lobbyId);
  const hasPlayerContext = Boolean(sessionSeed?.playerId);
  const guardActive = !hasLobbyContext || !hasPlayerContext;
  const { handleLobbyMissingError } = useLobbyDeletionGuard({
    lobbyId,
    lobbyName: effectiveLobbyName,
  });

  useEffect(() => {
    if (lobbyIdFromParams && lobbyIdFromParams !== lobbyId) {
      setLobbyId(lobbyIdFromParams);
    }
  }, [lobbyIdFromParams, lobbyId]);

  useEffect(() => {
    if (lobbyId || !effectiveLobbyName) return;
    let alive = true;
    const resolve = async () => {
      try {
        const list = await api.listLobbies();
        const match = list.find((l) => l.name.toLowerCase() === effectiveLobbyName.toLowerCase());
        if (match && alive) setLobbyId(match.id);
      } catch {
        /* ignore */
      }
    };
    resolve();
    return () => {
      alive = false;
    };
  }, [effectiveLobbyName, lobbyId]);

  // Lädt den aktuellen Sieger-Snapshot und pollt weiter, bis eine neue Runde erkannt wird.
  useEffect(() => {
    if (!lobbyId) return;
    let alive = true;

    const loadSnapshot = async () => {
      try {
        const [lb, snapshot, ps] = await Promise.all([
          api.getLobby(lobbyId),
          api.getCurrentRound(lobbyId),
          api.listPlayers(lobbyId),
        ]);
        if (!alive) return;
        setLobbyName(lb.name);
        setPlayers(ps);
        setWinnerPlayerId(snapshot.round.winnerPlayerId || null);
        setRoundNumber(snapshot.round.number ?? null);
        setError(null);

        if (snapshot.round.state === "running" && snapshot.round.number) {
          updateSession({
            resumeView: "game",
            resumeRoundNumber: snapshot.round.number,
          });
          navigate(roundPath({ lobbyName: lb.name, lobbyId, roundNumber: snapshot.round.number }), { replace: true });
        } else {
          updateSession({
            resumeView: "win",
            resumeRoundNumber: snapshot.round.number ?? null,
          });
        }
      } catch (e: any) {
        if (handleLobbyMissingError(e)) return;
        if (alive) setError(e?.message ?? "Gewinner konnte nicht geladen werden - bitte gleich noch mal probieren.");
      } finally {
        if (alive) setLoading(false);
      }
    };

    loadSnapshot();
    const t = setInterval(loadSnapshot, 3500);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [handleLobbyMissingError, lobbyId, navigate, updateSession]);

  useEffect(() => {
    if (!lobbyId || !storedPlayerId || !clientSessionId) return;
    return startPresence({ lobbyId, playerId: storedPlayerId, clientSessionId });
  }, [clientSessionId, lobbyId, storedPlayerId]);

  const winnerName = useMemo(() => {
    if (!winnerPlayerId) return "";
    const player = players.find((p) => p.id === winnerPlayerId);
    return player?.name ?? "";
  }, [players, winnerPlayerId]);

  /**
   * Startet die nächste Runde per API und navigiert den gesamten Tisch zurück zum GameScreen.
   * Erwartet einen gültigen Lobby-Kontext; Fehler landen als Meldung unter dem CTA.
   */
  async function startNextRound() {
    if (!lobbyId || !effectiveLobbyName) return;
    setBusyNext(true);
    try {
      const next = await api.startNextRound(lobbyId);
      updateSession({
        resumeView: "game",
        resumeRoundNumber: next.round.number ?? null,
      });
      navigate(roundPath({ lobbyName: effectiveLobbyName, lobbyId, roundNumber: next.round.number }));
    } catch (e: any) {
      setError(e?.message ?? "Nächste Runde konnte nicht gestartet werden – nochmal versuchen?");
    } finally {
      setBusyNext(false);
    }
  }

  const roundLabel = roundNumber ? roundNumber.toString().padStart(2, "0") : "?";
  const footerLabel = `${winnerName ? `Gewinner: ${winnerName}` : "Warte auf Ergebnis"} - Runde ${roundLabel}`;
  const contentFrameClass = "w-full max-w-4xl mx-auto";

  if (guardActive) {
    return (
      <RootLayout
        header={<TeletextHeader mode="WIN" />}
        footer={<span className="tt-text text-xs">Gewinner nur nach Rejoin</span>}
      >
        <RouteGuardNotice
          title="Gewinnerseite gesperrt"
          description="Damit keine Lobbydaten über fremde URLs abgegriffen werden, zeigen wir das Ergebnis nur mit einer gespeicherten Session an. Bitte rejoin über die Startseite."
          actionLabel="Zur Lobby"
        />
      </RootLayout>
    );
  }

  return (
    <RootLayout header={<TeletextHeader mode="WIN" />} footer={<span className="tt-text text-xs">{footerLabel}</span>}>
      <div className={`tt-stack pb-10 ${contentFrameClass}`}>
        <TTPanelCollapsible title={lobbyName || "Unbenannte Lobby"} eyebrow=">> DU HAST OPTIONEN 666" initialExpanded={false} variant="default">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="tt-toolbar__description m-0">
              {winnerName ? `${winnerName} holt Runde ${roundLabel}` : "Gewinner wird geortet ..."}
            </p>
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

        <TTPanel title="Gewinner" eyebrow=">> Ergebnis 101" variant="cyan">
          <div className="tt-text text-2xl sm:text-3xl leading-snug text-white" aria-live="polite">
            {loading && "Scanne nach dem Sieg ..."}
            {!loading && (
              <>
                <strong>{winnerName || "Noch kein Sieger"}</strong>
                {winnerName ? " alla, jut jemacht!" : " ... Runde wird ausgewertet ..."}
              </>
            )}
          </div>
          <div className="mt-3 text-sm uppercase tracking-[0.2em] text-[var(--tt-text-muted)]">
            Runde {roundLabel} im Archiv
          </div>
        </TTPanel>

        <TTPanel
          title="GEWINNE.GEWINNE."
          eyebrow=">> Freu dich doch 333"
          variant="magenta"
          bodyClassName="flex flex-col items-center sm:items-stretch"
        >
          <img
            src={winnerGif}
            alt="Winner"
            className="block w-full max-h-[320px] sm:max-h-[480px] rounded-none object-contain mx-auto max-w-4xl"
            loading="lazy"
          />
        </TTPanel>

        <div className="w-full">
          <TTButton
            variant="danger"
            className="w-full justify-center"
            onClick={startNextRound}
            busy={busyNext || loading}
            disabled={loading}
          >
            Neue Runde starten
          </TTButton>
        </div>

        {error && (
          <p className="tt-text text-sm font-black text-[var(--tt-danger)]" aria-live="assertive">
            {error}
          </p>
        )}
      </div>
    </RootLayout>
  );
}
