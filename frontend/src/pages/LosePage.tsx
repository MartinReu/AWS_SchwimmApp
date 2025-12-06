/**
 * Lose-Seite für ausgeschiedene Spieler:innen.
 * Hält Presence und Session-Resume aktiv, pollt nach neuen Runden und navigiert automatisch zurück ins Spiel.
 */
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import TeletextHeader from "../components/common/TeletextHeader";
import { api, LifeState, Round, subscribeRoundEvents } from "../api";
import waitGif from "../assets/ui/wait.gif";
import { useLobbyParams } from "../hooks/useLobbyParams";
import { useRoundParams } from "../hooks/useRoundParams";
import { getClientSessionId, loadSession, updateSession } from "../utils/session";
import { roundPath, winPath } from "../utils/paths";
import RootLayout from "../components/common/layout/RootLayout";
import TTPanel from "../components/common/ui/TTPanel";
import TTButton from "../components/common/ui/TTButton";
import TTPanelCollapsible from "../components/common/ui/TTPanelCollapsible";
import { startPresence } from "../lib/sessionPresence";
import RouteGuardNotice from "../components/common/RouteGuardNotice";
import { useLobbyDeletionGuard } from "../hooks/useLobbyDeletionGuard";

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
  const initialRoundRef = useRef<number | null>(initialRoundNumber ?? null);
  const redirectedToWinRef = useRef(false);

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
  const { handleLobbyMissingError } = useLobbyDeletionGuard({
    lobbyId,
    lobbyName: lobbyName || lookupName || routeLobbyName,
  });
  const hasLobbyContext = Boolean(routeLobbyName || lobbyIdFromParams || sessionSeed?.lobbyName || sessionSeed?.lobbyId);
  const hasPlayerContext = Boolean(playerId);
  const guardActive = !hasLobbyContext || !hasPlayerContext; // URL-Guard: verliert Kontext -> zurück zur Lobby schicken.

  useEffect(() => {
    // Persistiert die Lose-Ansicht inklusive bekannter Rundennummer.
    if (redirectedToWinRef.current) return;
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

  const navigateToWin = useCallback(
    (overrideRoundNumber?: number | null) => {
      if (redirectedToWinRef.current) return;
      redirectedToWinRef.current = true;
      const resolvedRoundNumber =
        overrideRoundNumber ?? currentRound?.number ?? roundNumber ?? initialRoundRef.current ?? initialRoundNumber ?? null;
      updateSession({
        resumeView: "win",
        resumeRoundNumber: resolvedRoundNumber,
      });
      if (!lookupName) {
        navigate("/", { replace: true });
        return;
      }
      const target = winPath({
        lobbyName: lookupName,
        lobbyId,
      });
      navigate(target, { replace: true });
    },
    [currentRound?.number, initialRoundNumber, lobbyId, lookupName, navigate, roundNumber]
  );

  useEffect(() => {
    if (guardActive || !lobbyId) return;
    return subscribeRoundEvents({
      lobbyId,
      onFinished: (event) => {
        if (redirectedToWinRef.current) return;
        if (event.lobbyId && event.lobbyId !== lobbyId) return;
        navigateToWin(event.round?.number ?? null);
      },
    });
  }, [guardActive, lobbyId, navigateToWin]);

  /**
   * Navigiert zurück zur Game-Ansicht und aktualisiert die Session,
   * sobald eine neue Runde erkannt wurde oder der/die Nutzer:in manuell zurück möchte.
   * Nutzt vorhandene Lobby-/Rundendaten, damit Router-Redirects die richtigen Parameter erhalten.
   */
  const backToGame = useCallback((overrideRoundNumber?: number | null) => {
    if (redirectedToWinRef.current) return;
    if (!lookupName) {
      navigate("/");
      return;
    }
    const latestRoundNumber = overrideRoundNumber ?? currentRound?.number ?? roundNumber ?? initialRoundNumber ?? null;
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
    // Holt aktuelle Lobby-/Rundendaten und pollt regelm??ig f?r ?nderungen.
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
        if (initialRoundRef.current === null && typeof cr.round.number === "number") {
          initialRoundRef.current = cr.round.number;
        }
        if (cr.round.state === "finished" && cr.round.winnerPlayerId) {
          navigateToWin(cr.round.number ?? null);
          return;
        }
      } catch (error) {
        if (handleLobbyMissingError(error)) return;
      }
    };
    init();

    const t = setInterval(async () => {
      if (redirectedToWinRef.current) return;
      try {
        const cr = await api.getCurrentRound(lobbyId);
        setCurrentRound(cr.round);
        const me = cr.lives.find((l) => l.playerId === playerId) || null;
        setMyLife(me);

        if (cr.round.state === "finished" && cr.round.winnerPlayerId) {
          navigateToWin(cr.round.number ?? null);
          return;
        }

        const nextRoundNumber = typeof cr.round.number === "number" ? cr.round.number : null;
        if (initialRoundRef.current === null && nextRoundNumber !== null) {
          initialRoundRef.current = nextRoundNumber;
        } else if (nextRoundNumber !== null && initialRoundRef.current !== null && nextRoundNumber !== initialRoundRef.current) {
          backToGame(nextRoundNumber);
        }
      } catch (error) {
        if (handleLobbyMissingError(error)) return;
      }
    }, 1500);

    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [backToGame, handleLobbyMissingError, initialRoundNumber, lobbyId, navigateToWin, playerId]);

  useEffect(() => {
    // Aktualisiert die Session, sobald der Server die aktuelle Rundennummer kennt.
    if (redirectedToWinRef.current) return;
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

  // Hinweistext während des Wartens - animiert nur, wenn Lives > 0.
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
      footer={<span className="tt-text text-xs">Lobby: {lobbyName || lookupName || "-"} · {footerRoundLabel}</span>}
    >
      <div className="tt-stack pb-10">
        <TTPanelCollapsible
          title={lobbyName || "Unbenannte Lobby"}
          eyebrow=">> DU HAST OPTIONEN 666"
          initialExpanded={false}
          variant="default"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="tt-toolbar__description m-0">{`${roundDescription} - Warte auf Rejoin`}</p>
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

        <TTPanel title="Chill-Zone" eyebrow=">> Kurz raus 111" variant="magenta">
          <div className="block w-full rounded-none object-contain">
            <div>Geh ene roochen bis die nächste Runde losgeht.</div>
            <div className="mt-2 opacity-80">
              {subtitleMessage.animated ? (
                <AnimatedEllipsisLabel>{subtitleMessage.text}</AnimatedEllipsisLabel>
              ) : (
                subtitleMessage.text
              )}
            </div>
          </div>
        </TTPanel>

        <TTPanel title="Komm erst mal runter" eyebrow=">> Beruhigungsbild 44" variant="cyan">
          <img src={waitGif} alt="Warten" className="block w-full rounded-none object-contain" loading="lazy" />
        </TTPanel>
      </div>
    </RootLayout>
  );
}

/** Animierter Label-Renderer mit wandernden Punkten für Warte-Hinweise. */
function AnimatedEllipsisLabel({ children }: { children: ReactNode }) {
  const prefersReducedMotion = usePrefersReducedMotion();

  return (
    <span
      className="inline-flex items-center text-base"
      aria-live="polite"
      data-prefers-reduced-motion={prefersReducedMotion ? "true" : "false"}
    >
      {children}
      <span className="tt-ellipsis-anim" aria-hidden="true">
        <span className="tt-ellipsis-dot" />
        <span className="tt-ellipsis-dot" />
        <span className="tt-ellipsis-dot" />
      </span>
    </span>
  );
}

/** Prüft die Media-Query für reduzierte Animationen und liefert das entsprechende Flag. */
function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handle = () => setPrefersReducedMotion(media.matches);
    handle();

    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", handle);
      return () => media.removeEventListener("change", handle);
    }
    if (typeof media.addListener === "function") {
      media.addListener(handle);
      return () => media.removeListener(handle);
    }
  }, []);

  return prefersReducedMotion;
}
