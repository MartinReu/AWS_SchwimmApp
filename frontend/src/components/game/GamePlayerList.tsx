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
}: Props) {
  const { prefersReducedMotion } = usePixelFirework();
  const canRenderFirework = FIREWORKS_ENABLED;
  const sessionSeed = useMemo(() => loadSession(), []);
  const myPlayerId = currentPlayerId ?? sessionSeed?.playerId ?? "";
  const myPlayerName = currentPlayerName ?? sessionSeed?.playerName ?? "";
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

  const shouldScroll = playersSorted.length > maxVisible;
  const overflowCount = shouldScroll ? playersSorted.length - maxVisible : 0;
  const scrollVars: PlayerListVars = { "--playerlist-visible": String(maxVisible) };

  return (
    <div className={clsx(className)}>
      <div
        className={clsx(
          "playerlist-grid",
          shouldScroll && "playerlist-scrollable"
        )}
        style={scrollVars}
      >
        {playersSorted.map((p, i) => {
          const playerScore = scoreLookup.get(p.id) ?? 0;
          const isSelf =
            (myPlayerId && p.id === myPlayerId) || (myPlayerName && p.name.localeCompare(myPlayerName, undefined, { sensitivity: "accent" }) === 0);
          const isLeader = i === 0;

          return (
            <div
              key={p.id}
              className={clsx(
                "playerlist-item relative grid grid-cols-[auto_1fr_auto] items-stretch border-4 border-black bg-[#fff26e] shadow-[0_4px_0_#111] transition-shadow duration-150",
                isSelf && "ring-4 ring-blue-500/70 ring-offset-2 ring-offset-[#fff7c1]"
              )}
              aria-current={isSelf ? "true" : undefined}
            >
              {isSelf && (
                <span className="pointer-events-none absolute inset-1 border-2 border-blue-500/70 rounded-sm z-10" aria-hidden="true" />
              )}

              {/* Linke Index-Leiste (blau, Teletext-Pfeil) */}
              <div className="relative bg-[var(--tt-blue,#0e4aff)] text-white tt-text px-2 py-2 min-w-[62px] text-lg border-r-4 border-black flex h-full items-center overflow-hidden">
                {isLeader && canRenderFirework && (
                  <PixelFireworkRing
                    aria-hidden="true"
                    staticOnly={prefersReducedMotion}
                    loop={!prefersReducedMotion}
                    className="pointer-events-none absolute left-0 top-0 h-full w-full"
                    style={{
                      transform: "scale(0.8)",
                      transformOrigin: "top left",
                    }}
                  />
                )}
                <span className="relative z-10 mr-1">{">"}</span>
                <span className="relative z-10 tabular-nums">{String(i + 1).padStart(2, "0")}</span>
              </div>

              {/* Name */}
              <div
                className={clsx(
                  "tt-text text-[18px] text-black flex items-center px-3",
                  isSelf && "bg-[#e8f0ff] font-semibold text-[#0e4aff]"
                )}
              >
                {p.name}
              </div>

              {/* Score rechts */}
              <div className="bg-black text-[#b6ff00] tt-text px-3 min-w-[58px] flex h-full items-center justify-center border-l-4 border-black">
                <span className="tabular-nums">
                  {String(playerScore).padStart(2, "0")}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {overflowCount > 0 && (
        <div className="mt-2 text-white/80 text-sm tt-text">
          +{overflowCount} weitere Spieler (scrollen)
        </div>
      )}
    </div>
  );
}
