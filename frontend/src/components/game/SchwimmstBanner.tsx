/**
 * SchwimmstBanner: Visualisiert den Alarmzustand (1 Leben) im GameScreen.
 * Zeigt animierte Bubbles über blauem Raster, reagiert auf reduce-motion und bietet einen Button zum Lose-Screen.
 */
import clsx from "clsx";
import { useMemo } from "react";
import bubbles from "../../assets/ui/bubbles.png";
import bgTile from "../../assets/ui/bg_tile_blue.png";

/** Visualisiert den Schwimmst-Zustand und bietet eine Klickfläche Richtung Lose-Screen. */
export default function SchwimmstBanner({
  className,
  onBubblesClick,
}: {
  className?: string;
  onBubblesClick?: () => void;
}) {
  const prefersReducedMotion = useMemo(
    () => (typeof window !== "undefined" ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : false),
    []
  );
  const bubbleCount = prefersReducedMotion ? 32 : 84;
  const bubblesConfig = useMemo(() => {
    const n = bubbleCount;
    const arr = [];
    for (let i = 0; i < n; i++) {
      const size = randInt(32, 150);
      const left = randInt(4, 96);     // %
      const top = randInt(4, 96);      // %
      const rot = randInt(-25, 25);
      const pulse = Math.random() < 0.85;
      const duration = randFloat(1.6, 4.6);
      const delay = randFloat(0, 3);
      const opacity = randFloat(0.3, 0.95);
      arr.push({ size, left, top, rot, pulse, duration, delay, opacity });
    }
    return arr;
  }, [bubbleCount, prefersReducedMotion]);

  return (
    <div className={clsx("relative w-full flex flex-col items-center", className)}>
      {/* Bubbles-Zone */}
      <div
        className="relative w-full h-44 sm:h-52 overflow-hidden border-4 border-[var(--tt-info)] bg-black"
        style={{
          backgroundImage: `url(${bgTile})`,
          backgroundRepeat: "repeat",
          backgroundSize: "auto",
        }}
      >
        {/* Klick-Overlay */}
        <button
          type="button"
          aria-label="Zum Wartebildschirm wechseln"
          onClick={onBubblesClick}
          className="absolute inset-0 z-10 cursor-pointer bg-transparent"
          style={{ WebkitTapHighlightColor: "transparent" }}
        />
        {bubblesConfig.map((b, i) => (
          <img
            key={i}
            src={bubbles}
            alt=""
            className="absolute select-none pointer-events-none"
            style={{
              left: `${b.left}%`,
              top: `${b.top}%`,
              width: `${b.size}px`,
              transform: `translate(-50%, -50%) rotate(${b.rot}deg)`,
              opacity: b.opacity,
              filter: "drop-shadow(0 8px 0 rgba(0,0,0,0.9))",
              animation:
                !prefersReducedMotion && b.pulse
                  ? `schw-bubble-pulse ${b.duration}s ease-in-out ${b.delay}s infinite`
                  : "none",
            }}
            draggable={false}
          />
        ))}
      </div>

      {/* SCHWIMMST-Schriftzug */}
      <div className="mt-6 flex gap-1 whitespace-nowrap select-none">
        {"SCHWIMMST".split("").map((ch, i) => (
          <span
            key={i}
            className="
              bg-white text-black border-4 border-black shadow-[0_4px_0_#111]
              px-3 py-2 text-3xl sm:text-4xl font-extrabold leading-none
              rounded-[2px]
            "
          >
            {ch}
          </span>
        ))}
      </div>

      <style>{`
        @keyframes schw-bubble-pulse {
          0%   { transform: translate(-50%, -50%) scale(1);   opacity: 0.55; }
          50%  { transform: translate(-50%, -58%) scale(1.45); opacity: 1; }
          100% { transform: translate(-50%, -50%) scale(1);   opacity: 0.55; }
        }
      `}</style>
    </div>
  );
}

/** Liefert eine ganze Zufallszahl im Bereich [min, max]. */
function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
/** Liefert eine Float-Zahl im Bereich (min, max). */
function randFloat(min: number, max: number) {
  return Math.random() * (max - min) + min;
}
