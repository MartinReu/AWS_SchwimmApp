/**
 * Retro-Pixel-Feuerwerk, bestehend aus mehreren radialen Sprites.
 * Wird z. B. im EndRoundSlider und in Spielerlisten genutzt, um Siege hervorzuheben.
 */
import clsx from "clsx";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import "../../../styles/components/pixel-firework.css";

export type PixelFireworkRingProps = {
  className?: string;
  style?: CSSProperties;
  delayMs?: number;
  "aria-hidden"?: boolean | "true" | "false";
  staticOnly?: boolean;
  loop?: boolean;
  loopIntervalMs?: number;
  intensity?: "normal" | "dense";
};

/** Multi-burst pixel firework ring used by EndRoundSlider und GamePlayerList. */
export function PixelFireworkRing({
  className,
  style,
  delayMs = 0,
  "aria-hidden": ariaHidden = "true",
  staticOnly = false,
  loop = false,
  loopIntervalMs = 1400,
  intensity = "normal",
}: PixelFireworkRingProps) {
  const [loopKey, setLoopKey] = useState(0);

  useEffect(() => {
    if (!loop || staticOnly) return;
    const id = window.setInterval(() => {
      setLoopKey((prev) => prev + 1);
    }, Math.max(loopIntervalMs, 400));
    return () => window.clearInterval(id);
  }, [loop, loopIntervalMs, staticOnly]);

  const bursts = useMemo(() => {
    const base: BurstSpec[] = [
      { offset: { x: 0, y: 0 }, scale: 1.0, delayMs: delayMs + 0, palette: neonPalette() },
      { offset: { x: -18, y: -20 }, scale: 0.9, delayMs: delayMs + 90, palette: rainbowPalette() },
      { offset: { x: -18, y: 20 }, scale: 0.9, delayMs: delayMs + 160, palette: citrusPalette() },
      { offset: { x: -36, y: 0 }, scale: 0.85, delayMs: delayMs + 220, palette: oceanPalette() },
    ];

    if (intensity === "dense") {
      base.push(
        { offset: { x: -8, y: -32 }, scale: 1.1, delayMs: delayMs + 260, palette: rainbowPalette() },
        { offset: { x: -32, y: -26 }, scale: 0.95, delayMs: delayMs + 310, palette: citrusPalette() },
        { offset: { x: -32, y: 26 }, scale: 0.95, delayMs: delayMs + 360, palette: neonPalette() },
        { offset: { x: -10, y: 32 }, scale: 1.05, delayMs: delayMs + 410, palette: oceanPalette() }
      );
    }

    return base;
  }, [delayMs, intensity]);

  return (
    <div className={clsx(className)} style={style} aria-hidden={ariaHidden}>
      {bursts.map((burst, index) => (
        <div
          key={`burst-${index}`}
          style={{
            transform: `translate(${burst.offset.x}px, ${burst.offset.y}px) scale(${burst.scale})`,
            transformOrigin: "center",
          }}
        >
          <PixelFirework
            key={`${loopKey}-${index}`}
            colors={burst.palette}
            delayMs={burst.delayMs}
            staticOnly={staticOnly}
          />
        </div>
      ))}
    </div>
  );
}

type BurstSpec = {
  offset: { x: number; y: number };
  scale: number;
  delayMs: number;
  palette: string[];
};

type PixelFireworkProps = {
  colors: string[];
  delayMs?: number;
  staticOnly?: boolean;
};

/** Einzelnes Feuerwerk bestehend aus neun Pixel-Sprites, die radial auseinanderfliegen. */
function PixelFirework({ colors, delayMs = 0, staticOnly = false }: PixelFireworkProps) {
  const duration = "920ms";
  const delay = `${delayMs}ms`;

  const styleFor = (index: number): CSSProperties => ({
    background: colors[index % colors.length],
    animationDuration: duration,
    animationDelay: delay,
    boxShadow: `0 0 6px ${colors[index % colors.length]}`,
  });

  return (
    <div className={clsx("pf-root", staticOnly && "pf-root--static")}>
      <span className="pf-dot pf-center" style={styleFor(0)} />
      <span className="pf-dot pf-a" style={styleFor(1)} />
      <span className="pf-dot pf-b" style={styleFor(2)} />
      <span className="pf-dot pf-c" style={styleFor(3)} />
      <span className="pf-dot pf-d" style={styleFor(4)} />
      <span className="pf-dot pf-e" style={styleFor(5)} />
      <span className="pf-dot pf-f" style={styleFor(6)} />
      <span className="pf-dot pf-g" style={styleFor(7)} />
      <span className="pf-dot pf-h" style={styleFor(8)} />
    </div>
  );
}

/** Farbsets sorgen für abwechslungsreiche Paletten ohne Inline-Arrays im Render. */
function neonPalette() {
  return ["#FF2D55", "#FF3B30", "#FF9500", "#FFCC00", "#34C759", "#00E5FF", "#007AFF", "#5856D6", "#AF52DE"];
}

function rainbowPalette() {
  return ["#FF3B30", "#FF9500", "#FFCC00", "#34C759", "#00C7BE", "#32ADE6", "#5856D6", "#AF52DE", "#FF2D55"];
}

function citrusPalette() {
  return ["#FFD166", "#FCA311", "#FF5E00", "#F94144", "#90BE6D", "#43AA8B", "#577590", "#F3722C", "#F9C74F"];
}

function oceanPalette() {
  return ["#00E5FF", "#00B8D9", "#1E90FF", "#2D46B9", "#6C63FF", "#3DDC97", "#00B4D8", "#90E0EF", "#00F5D4"];
}
