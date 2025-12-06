/**
 * SchwimmstBanner: Visualisiert den Alarmzustand (1 Leben) im GameScreen.
 * Zeigt animierte Bubbles über blauem Raster, reagiert auf reduce-motion und bietet einen Button zum Lose-Screen.
 */
import clsx from "clsx";
import { useEffect, useMemo, useState } from "react";
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
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [isNarrow, setIsNarrow] = useState(
    () => (typeof window !== "undefined" ? window.matchMedia("(max-width: 520px)").matches : false)
  );

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handle = () => setPrefersReducedMotion(media.matches);
    handle();
    media.addEventListener("change", handle);
    return () => media.removeEventListener("change", handle);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(max-width: 520px)");
    const handle = () => setIsNarrow(media.matches);
    handle();
    media.addEventListener("change", handle);
    return () => media.removeEventListener("change", handle);
  }, []);

  const bubbleCount = prefersReducedMotion ? 40 : isNarrow ? 80 : 96;
  const shouldAnimateBubbles = !prefersReducedMotion;
  const bubblesConfig = useMemo(() => {
    const n = bubbleCount;
    const arr = [];
    for (let i = 0; i < n; i++) {
      const size = randInt(isNarrow ? 26 : 32, isNarrow ? 120 : 150);
      const left = randInt(4, 96);     // %
      const top = randInt(4, 96);      // %
      const rot = randInt(-25, 25);
      const pulse = true;
      const duration = randFloat(isNarrow ? 2.6 : 2.2, isNarrow ? 5.6 : 5.2);
      const delay = randFloat(0, isNarrow ? 1.4 : 1.2);
      const opacity = randFloat(0.3, 0.95);
      arr.push({ size, left, top, rot, pulse, duration, delay, opacity });
    }
    return arr;
  }, [bubbleCount, isNarrow]);

  return (
    <div className={clsx("relative w-full flex flex-col items-center", className)}>
      <div className="w-full space-y-4 sm:space-y-5">
        {/* Bubbles-Zone */}
        <div
          className="relative w-full h-44 sm:h-56 overflow-hidden border-4 border-[var(--tt-info)] bg-black"
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
              className="absolute select-none pointer-events-none tt-bubble-wobble"
              style={{
                left: `${b.left}%`,
                top: `${b.top}%`,
                width: `${b.size}px`,
                transform: "translate(-50%, -50%) rotate(var(--schw-rot, 0deg))",
                opacity: b.opacity,
                filter: "drop-shadow(0 8px 0 rgba(0,0,0,0.9))",
                ["--schw-rot" as string]: `${b.rot}deg`,
                ["--schw-scale-min" as string]: isNarrow ? "0.88" : "0.94",
                ["--schw-scale-max" as string]: isNarrow ? "1.08" : "1.16",
                ["--schw-wobble-duration" as string]: shouldAnimateBubbles && b.pulse ? `${b.duration}s` : "0s",
                ["--schw-wobble-delay" as string]: shouldAnimateBubbles && b.pulse ? `${b.delay}s` : "0s",
                animationName: shouldAnimateBubbles && b.pulse ? "tt-bubble-wobble" : "none",
                animationTimingFunction: "steps(3, end)",
                animationIterationCount: "infinite",
                animationDirection: "alternate",
              }}
              draggable={false}
            />
          ))}
        </div>

        {/* SCHWIMMST-Schriftzug */}
        <div className="w-full mt-4 sm:mt-5">
          <div className="grid w-full grid-cols-9 gap-0 select-none">
            {"SCHWIMMST".split("").map((ch, i) => (
              <span
                key={i}
                className="
                  inline-flex items-center justify-center w-full h-full
                  bg-white text-black border-[3px] border-black shadow-[0_3px_0_#111] rounded-[1px]
                  min-w-[1.4rem] min-h-[1.85rem] sm:min-w-[1.65rem] sm:min-h-[2.05rem]
                  px-0.5 sm:px-0.5 py-0.5 sm:py-1.1
                  tt-text font-extrabold uppercase leading-[0.88] tracking-[0.005em]
                  text-[clamp(1.28rem,6vw,1.96rem)] sm:text-[clamp(1.44rem,3.8vw,2.14rem)]
                "
              >
                {ch}
              </span>
            ))}
          </div>
        </div>
      </div>
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
