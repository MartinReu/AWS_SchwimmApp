/**
 * Lose-Seite für ausgeschiedene Spieler:innen.
 * Hält Presence und Session-Resume aktiv, pollt nach neuen Runden und navigiert automatisch zurück ins Spiel.
 */
import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import TeletextHeader from "../components/common/TeletextHeader";
import { api, LifeState, Round } from "../api";
import waitGif from "../assets/ui/wait.gif";
import { useLobbyParams } from "../hooks/useLobbyParams";
import { useRoundParams } from "../hooks/useRoundParams";
import { getClientSessionId, loadSession, updateSession } from "../utils/session";
import { roundPath } from "../utils/paths";
import RootLayout from "../components/common/layout/RootLayout";
import TTToolbar from "../components/common/ui/TTToolbar";
import TTPanel from "../components/common/ui/TTPanel";
import TTButton from "../components/common/ui/TTButton";
import { startPresence } from "../lib/sessionPresence";
import RouteGuardNotice from "../components/common/RouteGuardNotice";

/** Lose-Screen: hält ausgeschiedene Spieler per Polling/Pings aktiv und springt bei neuer Runde zurück. */
export default function LosePage() {
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  // Query-Parameter dienen als Fallback für Player-/Rundenkontext.

  const { lobbyName: routeLobbyName, lobbyId: lobbyIdFromParams } = useLobbyParams();
  const { roundNumber } = useRoundParams();
  // Persistierte Session als Fallback für IDs und Label.
  const sessionSeed = useMemo(() => loadSession(), []);

  // Rundennummer aus Query (falls Route nicht alle Infos hat).
  const rawRoundNumber = sp.get("roundNumber");
  const roundNumberFromQuery = rawRoundNumber && rawRoundNumber.trim().length > 0 ? Number(rawRoundNumber) : null;
  const normalizedQueryRound =
    typeof roundNumberFromQuery === "number" && Number.isFinite(roundNumberFromQuery)
      ? roundNumberFromQuery
      : null;
  const initialRoundNumber = typeof roundNumber === "number" ? roundNumber : normalizedQueryRound;

  // Lobby-Kontext (ID + Name) aus Route oder Session.
  const [lobbyId, setLobbyId] = useState(() => lobbyIdFromParams || sessionSeed?.lobbyId || "");
  const [playerId] = useState(() => sp.get("playerId") || sessionSeed?.playerId || "");
  const [playerName] = useState(() => sp.get("playerName") || sessionSeed?.playerName || "");
  const [lobbyName, setLobbyName] = useState(routeLobbyName || sessionSeed?.lobbyName || "");

  // Laufende Rundendaten und eigener Lebensstatus.
  const [currentRound, setCurrentRound] = useState<Round | null>(null);
  const [myLife, setMyLife] = useState<LifeState | null>(null);

  // Fallback-Lobbynamen für UI/Navigation, falls API noch lädt.
  const lookupName = lobbyName || routeLobbyName || "";
  // Persistierte Client-Session-ID für Presence-Pings.
  const clientSessionId = useMemo(
    () => sessionSeed?.clientSessionId ?? getClientSessionId() ?? undefined,
    [sessionSeed]
  );
  const hasLobbyContext = Boolean(routeLobbyName || lobbyIdFromParams || sessionSeed?.lobbyName || sessionSeed?.lobbyId);
  const hasPlayerContext = Boolean(playerId);
  const guardActive = !hasLobbyContext || !hasPlayerContext; // URL-Guard: verliert Kontext → zurück zur Lobby schicken.

  useEffect(() => {
    // Persistiert die Lose-Ansicht inklusive bekannter Rundennummer.
    updateSession({
      resumeView: "lose",
      resumeRoundNumber: typeof initialRoundNumber === "number" ? initialRoundNumber : null,
    });
  }, [initialRoundNumber]);

  useEffect(() => {
    // Wenn Route neue Lobby-ID liefert, State darauf synchronisieren.
    if (lobbyIdFromParams && lobbyIdFromParams !== lobbyId) {
      setLobbyId(lobbyIdFromParams);
    }
  }, [lobbyIdFromParams, lobbyId]);

  useEffect(() => {
    // Fallback: besorgt die Lobby-ID per Name, falls nur Name bekannt ist.
    if (lobbyId || !lookupName) return;
    let alive = true;
    const resolve = async () => {
      try {
        const all = await api.listLobbies();
        const match = all.find((l) => l.name.toLowerCase() === lookupName.toLowerCase());
        if (match && alive) setLobbyId(match.id);
      } catch {
        /* ignore */
      }
    };
    resolve();
    return () => {
      alive = false;
    };
  }, [lobbyId, lookupName]);

  useEffect(() => {
    // Sendet Presence-Pings, damit der Slot aktiv bleibt.
    if (!lobbyId || !playerId || !clientSessionId) return;
    return startPresence({ lobbyId, playerId, clientSessionId });
  }, [clientSessionId, lobbyId, playerId]);

  /**
   * Navigiert zurück zur Game-Ansicht und aktualisiert die Session,
   * sobald eine neue Runde erkannt wurde oder der/die Nutzer:in manuell zurück möchte.
   * Nutzt vorhandene Lobby-/Rundendaten, damit Router-Redirects die richtigen Parameter erhalten.
   */
  const backToGame = useCallback(() => {
    if (!lookupName) {
      navigate("/");
      return;
    }
    const latestRoundNumber = currentRound?.number ?? roundNumber ?? initialRoundNumber ?? null;
    updateSession({
      resumeView: null,
      resumeRoundNumber: latestRoundNumber,
    });
    const target = roundPath({
      lobbyName: lookupName,
      lobbyId,
      roundNumber: latestRoundNumber ?? undefined,
    });
    navigate(target);
  }, [currentRound?.number, initialRoundNumber, lobbyId, lookupName, navigate, roundNumber]);

  useEffect(() => {
    // Holt aktuelle Lobby-/Rundendaten und pollt regelmäßig für Änderungen.
    if (!lobbyId) return;
    let alive = true;

    const init = async () => {
      try {
        const [lb, cr] = await Promise.all([api.getLobby(lobbyId), api.getCurrentRound(lobbyId)]);
        if (!alive) return;
        setLobbyName(lb.name);
        setCurrentRound(cr.round);
        const me = cr.lives.find((l) => l.playerId === playerId) || null;
        setMyLife(me);
      } catch {
        // still warten
      }
    };
    init();

    const t = setInterval(async () => {
      try {
        const cr = await api.getCurrentRound(lobbyId);
        setCurrentRound(cr.round);
        const me = cr.lives.find((l) => l.playerId === playerId) || null;
        setMyLife(me);

        if (typeof initialRoundNumber === "number" && cr.round.number !== initialRoundNumber) {
          backToGame();
        }
      } catch {
        // ignorieren – nächster Tick versucht es erneut
      }
    }, 1500);

    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [backToGame, initialRoundNumber, lobbyId, playerId]);

  useEffect(() => {
    // Aktualisiert die Session, sobald der Server die aktuelle Rundennummer kennt.
    if (!currentRound?.number) return;
    updateSession({
      resumeView: "lose",
      resumeRoundNumber: currentRound.number,
    });
  }, [currentRound?.number]);

  // Ableitung der sichtbaren Rundennummer für Titel + Footer.
  const resolvedRoundNumber = currentRound?.number ?? initialRoundNumber ?? null;
  const roundDescription = resolvedRoundNumber !== null ? `Verloren in Runde ${resolvedRoundNumber}` : "Runde unbekannt";
  const footerRoundLabel = resolvedRoundNumber !== null ? `Runde ${resolvedRoundNumber}` : "Runde unbekannt";

  // Hinweistext während des Wartens – animiert nur, wenn Lives > 0.
  const subtitleMessage = useMemo(() => {
    if (!myLife || myLife.livesRemaining <= 0) {
      return { text: "Diese Runde schaust du zu.", animated: false };
    }
    return { text: "Bitte warten", animated: true };
  }, [myLife]);

  if (guardActive) {
    return (
      <RootLayout
        header={<TeletextHeader mode="LOSE" />}
        footer={<span className="tt-text text-xs">Lobby-Zugriff nötig</span>}
      >
        <RouteGuardNotice
          title="Wartebereich nicht verfügbar"
          description="Ohne gespeicherte Spieler-Infos können wir dich hier nicht zuordnen. Tritt bitte erneut einer Lobby bei oder nutze den Rejoin-Button auf der Startseite."
          actionLabel="Zur Lobby"
        />
      </RootLayout>
    );
  }

  return (
    <RootLayout
      header={<TeletextHeader mode="LOSE" />}
      footer={<span className="tt-text text-xs">Lobby: {lobbyName || lookupName || "–"} · {footerRoundLabel}</span>}
    >
      <div className="space-y-6 pb-10 bg-black">
        <TTToolbar
          title={lobbyName || "Unbenannte Lobby"}
          description={`${roundDescription} · Warte auf Rejoin`}
          actions={
            <>
              <TTButton as={Link} to="/" variant="ghost" className="justify-center">
                Home
              </TTButton>
              <TTButton as={Link} to="/leaderboard" variant="secondary" className="justify-center">
                Rangliste
              </TTButton>
            </>
          }
        />

        <TTPanel title="Chill-Zone" eyebrow=">> Kurz raus" variant="magenta">
          <div className="tt-text text-2xl sm:text-3xl leading-snug text-white">
            <div>Geh ene roochen bis die nächste Runde los geht.</div>
            <div className="mt-2 opacity-80">
              {subtitleMessage.animated ? (
                <AnimatedEllipsisLabel>{subtitleMessage.text}</AnimatedEllipsisLabel>
              ) : (
                subtitleMessage.text
              )}
            </div>
          </div>
        </TTPanel>

        <TTPanel title="Komm erst mal runter" eyebrow=">> Beruhigungsbild" variant="cyan">
          <img src={waitGif} alt="Warten" className="block w-full rounded-none object-contain" loading="lazy" />
        </TTPanel>
      </div>
    </RootLayout>
  );
}

/** Animierter Label-Renderer mit wandernden Punkten für Warte-Hinweise. */
function AnimatedEllipsisLabel({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center text-base" aria-live="polite">
      {children}
      <span className="tt-ellipsis-anim" aria-hidden="true">
        <span>.</span>
        <span>.</span>
        <span>.</span>
      </span>
    </span>
  );
}
