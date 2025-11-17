/**
 * ResumeGameCallout: CTA auf Home-/Leaderboard-Seite, der Nutzer:innen zurück in eine gespeicherte Session führt.
 * Prüft Session-Fähigkeit (inkl. expliziter Bestätigung), entscheidet Lose vs. Round-Route und baut den passenden Link.
 */
import { useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import clsx from "clsx";
import TTButton from "./ui/TTButton";
import { loadSession, type LobbySession } from "../../utils/session";
import { losePath, roundPath, withSearch } from "../../utils/paths";

type ResumeGameCalloutProps = {
  session?: LobbySession | null;
  roundNumber?: number | null;
  className?: string;
  requireExplicitResume?: boolean;
  isConfirmed?: boolean;
};

export default function ResumeGameCallout({
  session,
  roundNumber,
  className,
  requireExplicitResume = false,
  isConfirmed = true,
}: ResumeGameCalloutProps) {
  const navigate = useNavigate();
  const resumeSession = useMemo(() => session ?? loadSession(), [session]);

  const isEligible = useMemo(() => {
    if (!resumeSession?.lobbyName || !resumeSession?.lobbyId || !resumeSession?.playerId) return false;
    if (requireExplicitResume) return resumeSession.resumeEligible === true;
    return resumeSession.resumeEligible !== false;
  }, [requireExplicitResume, resumeSession]);

  const resolvedRoundNumber = roundNumber ?? resumeSession?.resumeRoundNumber ?? null;

  /**
   * Berechnet das Ziel (Lose oder Round) inkl. Query-Strings.
   * Gibt null zurück, wenn Session unvollständig oder nicht bestätigt.
   */
  const destination = useMemo(() => {
    if (!isEligible || !resumeSession) return null;
    const sharedSearch = {
      playerId: resumeSession.playerId,
      playerName: resumeSession.playerName,
      roundNumber: resolvedRoundNumber ?? undefined,
    };
    if (resumeSession.resumeView === "lose") {
      const loseTarget = losePath({
        lobbyName: resumeSession.lobbyName,
        lobbyId: resumeSession.lobbyId,
        roundNumber: resolvedRoundNumber,
      });
      return withSearch(loseTarget, sharedSearch);
    }
    const base = roundPath({
      lobbyName: resumeSession.lobbyName,
      lobbyId: resumeSession.lobbyId,
      roundNumber: resolvedRoundNumber,
    });
    return withSearch(base, sharedSearch);
  }, [isEligible, resolvedRoundNumber, resumeSession]);

  /** Navigiert zum vorbereiteten Ziel, sobald der CTA geklickt wird. */
  const handleClick = useCallback(() => {
    if (!destination) return;
    navigate(destination);
  }, [destination, navigate]);

  if (!destination || !isConfirmed) return null;

  return (
    <div
      className={clsx(
        "tt-card border-[var(--tt-secondary)] bg-[var(--tt-card)]/80 p-4 text-white shadow-lg",
        "focus-within:ring-2 focus-within:ring-[var(--tt-secondary)] focus-within:ring-offset-2 focus-within:ring-offset-slate-900",
        className
      )}
      aria-live="polite"
    >
      <p className="text-sm font-black uppercase tracking-[0.2em]">Du hast eine laufende Runde.</p>
      <TTButton
        type="button"
        variant="danger"
        onClick={handleClick}
        className="mt-3 h-12 w-full justify-center"
      >
        Zurück zum Spiel
      </TTButton>
    </div>
  );
}
