/**
 * Spieler-/Score-Liste im Teletext-Stil.
 * Sortiert Spieler nach Punkten/Beitritt, markiert den eigenen Eintrag und zeigt optional Pixel-Feuerwerk beim Leader.
 */
import { useMemo, type CSSProperties } from "react";
import clsx from "clsx";
import { Player, Score } from "../../api";
import { loadSession } from "../../utils/session";
import { PixelFireworkRing } from "../common/animations/PixelFirework";
import { usePixelFirework } from "../../hooks/usePixelFirework";
import "../../styles/components/player-list.css";

type Props = {
  players: Player[];
  scores: Score[];
  maxVisible?: number; // standard: 4 (Scroll-Grenze)
  className?: string;
  currentPlayerId?: string;
  currentPlayerName?: string;
  leaderCelebrationKey?: number;
};

const FIREWORKS_ENABLED = (import.meta.env.VITE_ENABLE_PLAYERLIST_FIREWORKS ?? "true") !== "false";

type PlayerListVars = CSSProperties & {
  "--playerlist-visible"?: string;
};

/** Sortierte Spieler-/Score-Liste mit Teletext-Optik, Highlight für aktuellen Spieler. */
export default function GamePlayerList({
  players,
  scores,
  maxVisible = 4,
  className,
  currentPlayerId,
  currentPlayerName,
  leaderCelebrationKey,
}: Props) {
  const { prefersReducedMotion } = usePixelFirework();
  const canRenderFirework = FIREWORKS_ENABLED;
  const sessionSeed = useMemo(() => loadSession(), []);
  const myPlayerId = currentPlayerId ?? sessionSeed?.playerId ?? "";
  const myPlayerName = (currentPlayerName ?? sessionSeed?.playerName ?? "").toUpperCase();
  const scoreLookup = useMemo(() => {
    const map = new Map<string, number>();
    scores.forEach((score) => {
      if (!score || typeof score.playerId !== "string") return;
      const normalized = Number.isFinite(score.pointsTotal) ? score.pointsTotal : 0;
      map.set(score.playerId, normalized);
    });
    return map;
  }, [scores]); // Performance: Score-Map vermeidet O(n^2)-find bei jedem Render.

  const playersSorted = useMemo(() => {
    const sorted = [...players];
    sorted.sort((a, b) => {
      const scoreDiff = (scoreLookup.get(b.id) ?? 0) - (scoreLookup.get(a.id) ?? 0);
      if (scoreDiff !== 0) return scoreDiff;
      const nameDiff = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      if (nameDiff !== 0) return nameDiff;
      const joinedDiff = (a.joinedAt || "").localeCompare(b.joinedAt || "");
      if (joinedDiff !== 0) return joinedDiff;
      return a.id.localeCompare(b.id);
    });
    return sorted;
  }, [players, scoreLookup]);

  // Bestimmt die/das führende:n Spieler:in für das Teletext-Feuerwerk (nur visuelle Markierung, keine Logikänderung).
  const leaderId = playersSorted[0]?.id ?? null;
  const shouldScroll = playersSorted.length > maxVisible;
  const overflowCount = shouldScroll ? playersSorted.length - maxVisible : 0;
  const scrollVars: PlayerListVars = { "--playerlist-visible": String(maxVisible) };
  const leaderFireKey = leaderCelebrationKey ?? 0;

  return (
    <div className={clsx("w-full", className)}>
      <div className="border-4 border-[var(--tt-primary,#00ffff)] bg-[var(--tt-panel,#0c0c0c)] p-2 sm:p-3 shadow-[0_6px_0_rgba(0,0,0,0.85)]">
        <div
          className={clsx(
            "playerlist-grid",
            shouldScroll && "playerlist-scrollable"
          )}
          style={scrollVars}
        >
          {playersSorted.map((p, i) => {
            const playerScore = scoreLookup.get(p.id) ?? 0;
            const displayName = p.name.toUpperCase();
            const isSelf =
              (myPlayerId && p.id === myPlayerId) || (myPlayerName && displayName.localeCompare(myPlayerName, undefined, { sensitivity: "accent" }) === 0);
            const isLeader = leaderId ? p.id === leaderId : i === 0;

            return (
              <div
                key={p.id}
                className={clsx(
                  "playerlist-item relative overflow-visible border-4 border-[var(--tt-yellow,#faff00)] bg-black shadow-[0_6px_0_rgba(0,0,0,0.9)] transition-shadow duration-150"
                )}
                aria-current={isSelf ? "true" : undefined}
              >
                <div className="grid h-full grid-cols-[auto_1fr_auto] divide-x-[4px] divide-black">
                  {/* Linke Index-Leiste (blau, Teletext-Pfeil) */}
                  <div className="relative bg-[var(--tt-blue,#0e4aff)] text-white tt-text px-3 py-2 min-w-[62px] sm:min-w-[68px] text-base sm:text-lg flex h-full items-center overflow-visible leading-tight shadow-[inset_0_0_0_2px_rgba(0,0,0,0.45)]">
                    {isLeader && canRenderFirework && (
                      <>
                        <PixelFireworkRing
                          aria-hidden="true"
                          staticOnly={prefersReducedMotion}
                          loop={!prefersReducedMotion}
                          loopIntervalMs={1400}
                          variant="single"
                          className="pointer-events-none absolute left-1 top-1/2 h-12 w-12 -translate-y-1/2 sm:left-2 sm:h-14 sm:w-14"
                          style={{ transformOrigin: "center" }}
                          key={`${leaderFireKey}-${p.id}`}
                        />
                        <span className="sr-only">Führende:r Spieler:in</span>
                      </>
                    )}
                    <span className="relative z-10 mr-1">{">"}</span>
                    <span className="relative z-10 tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                  </div>

                  <div
                    className={clsx(
                      "tt-text text-[16px] sm:text-[18px] text-[var(--tt-secondary,#faff00)] flex items-center px-3 py-2 leading-snug bg-[var(--tt-panel,#0c0c0c)]",
                      isSelf && "bg-[var(--tt-panel,#0c0c0c)] font-semibold text-white"
                    )}
                  >
                    {displayName}
                  </div>

                  <div className="bg-black text-[#b6ff00] tt-text px-3 py-2 min-w-[58px] sm:min-w-[66px] flex h-full items-center justify-center text-base sm:text-lg leading-tight shadow-[inset_0_0_0_2px_rgba(0,0,0,0.65)]">
                    <span className="tabular-nums whitespace-nowrap">
                      {String(playerScore).padStart(2, "0")}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {overflowCount > 0 && (
        <div className="mt-2 text-white/80 text-sm tt-text">
          +{overflowCount} schau, mehr Atzen (scrollen)
        </div>
      )}
    </div>
  );
}
