/**
 * EndRoundSlider: Drag-Slider im Teletext-Look, mit dem Spieler:innen den Rundensieg melden.
 * Nutzt Pointer-Events, um den Griff zu bewegen, triggert Firework-Effekte und ruft `onComplete`, sobald der Griff rechts ankommt.
 */
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import flagPng from "../../assets/ui/lock_slider.png";
import { PixelFireworkRing } from "../common/animations/PixelFirework";
import type { PixelFireworkRingProps } from "../common/animations/PixelFirework";
import { usePixelFirework } from "../../hooks/usePixelFirework";
import "../../styles/components/end-round-slider.css";

type Props = {
  onComplete: () => void;
  disabled?: boolean;
};

/** Teletext-Slider zum Rundenabschluss – feuert onComplete, sobald der Griff rechts ankommt. */
export default function EndRoundSlider({ onComplete, disabled }: Props) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<HTMLDivElement | null>(null);

  // Geometrie in px
  const [trackW, setTrackW] = useState(1);
  const [handleW, setHandleW] = useState(0);
  const maxPx = Math.max(0, trackW - handleW);
  const handleWidth = handleW || 48;

  // Linke Kante des Handles in px (0..maxPx)
  const [posPx, setPosPx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const grabOffsetPxRef = useRef(0);

  // Abschluss/Animation
  const [completed, setCompleted] = useState(false);
  const [fireKey, setFireKey] = useState(0);
  const [trailTicks, setTrailTicks] = useState(() => FIREWORK_TRAIL_STOPS.map(() => 0));
  const trailTriggeredRef = useRef<boolean[]>(FIREWORK_TRAIL_STOPS.map(() => false));
  const { prefersReducedMotion } = usePixelFirework();
  const COMPLETION_DELAY_MS = 950;

  useEffect(() => {
    function measure() {
      const tw = trackRef.current?.clientWidth ?? 1;
      const hw = handleRef.current?.clientWidth ?? 0;
      setTrackW(Math.max(1, tw));
      setHandleW(Math.max(0, hw));
      setPosPx((p) => clampPx(p, 0, Math.max(0, tw - hw)));
    }
    measure();

    const ro = new ResizeObserver(measure);
    if (trackRef.current) ro.observe(trackRef.current);
    if (handleRef.current) ro.observe(handleRef.current);
    window.addEventListener("resize", measure);

    const img = new Image();
    img.onload = measure;
    img.src = flagPng as unknown as string;

    return () => {
      window.removeEventListener("resize", measure);
      ro.disconnect();
    };
  }, []);

  /**
   * Initialisiert einen Drag: merkt sich, wo der Nutzer den Griff gepackt hat, und setzt Pointer Capture.
   */
  function beginDrag(e: React.PointerEvent) {
    if (disabled || !trackRef.current) return;
    setDragging(true);
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);

    const rect = trackRef.current.getBoundingClientRect();
    const pointerX = e.clientX - rect.left;
    grabOffsetPxRef.current = pointerX - posPx;
  }

  /**
   * Verschiebt den Griff innerhalb der erlaubten Strecke und prüft auf Completion.
   * progress/maxPx wird laufend aktualisiert, damit Firework-Trigger reagieren können.
   */
  function moveDrag(e: React.PointerEvent) {
    if (!dragging || completed || !trackRef.current) return;

    const rect = trackRef.current.getBoundingClientRect();
    const pointerX = e.clientX - rect.left;
    const desiredLeftPx = pointerX - grabOffsetPxRef.current;
    const next = clampPx(desiredLeftPx, 0, maxPx);

    setPosPx(next);

    if (!completed && Math.abs(next - maxPx) < 1) {
      startCompletion();
    }
  }

  /**
   * Beendet den Drag (PointerUp/Leave). Wenn noch nicht abgeschlossen, springt der Griff zurück und Effekte werden resetet.
   */
  function endDrag() {
    if (!dragging) return;
    setDragging(false);
    if (!completed) {
      setPosPx(0);
      resetTrailFireworks();
    }
  }

  /**
   * Markiert den Slider als abgeschlossen, fixiert den Griff am Ende und ruft onComplete mit kurzer Verzögerung auf.
   */
  function startCompletion() {
    setCompleted(true);
    setPosPx(maxPx);
    setFireKey((k) => k + 1);
    window.setTimeout(() => onComplete(), COMPLETION_DELAY_MS);
  }

  // nur für ARIA
  const handlePct = maxPx > 0 ? Math.round((posPx / maxPx) * 100) : 0;
  const progress = maxPx > 0 ? posPx / maxPx : 0;

  useEffect(() => {
    if (progress <= 0 || completed) return;
    setTrailTicks((prev) => {
      let next: number[] | null = null;
      FIREWORK_TRAIL_STOPS.forEach((stop, idx) => {
        if (!trailTriggeredRef.current[idx] && progress >= stop.threshold) {
          trailTriggeredRef.current[idx] = true;
          next = next ? next : [...prev];
          next[idx] += 1;
        }
      });
      return next ?? prev;
    });
  }, [progress, completed]);

  /** Setzt Trail-Trigger zurück, wenn der Slider erneut gestartet wird. */
  function resetTrailFireworks() {
    trailTriggeredRef.current = FIREWORK_TRAIL_STOPS.map(() => false);
    setTrailTicks(FIREWORK_TRAIL_STOPS.map(() => 0));
  }

  return (
    <div className="w-full">
      <div className="relative border-4 border-[var(--tt-danger)] bg-black p-3 shadow-[0_6px_0_rgba(0,0,0,0.85)]">
        <div
          ref={trackRef}
          className={clsx("relative h-16 select-none", disabled && "opacity-60")}
          onPointerDown={beginDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerLeave={endDrag}
        >
          {/* SCHWARZER BALKEN – linke Kante folgt der Flagge (synchron), rechts verankert */}
          <div
            className="absolute inset-y-0 right-0 bg-black text-white border-4 border-black overflow-hidden"
            style={{ left: `${Math.min(trackW, posPx + handleWidth)}px`, right: 0 }}
            aria-hidden
          >
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-2xl tt-text flex items-center gap-3">
                <span aria-hidden="true" className="font-black tracking-[0.3em] text-[var(--tt-secondary)]">
                  {">>>"}
                </span>
                <span>Runde&nbsp;beenden</span>
              </span>
            </div>
          </div>

          {/* HANDLE (FLAGGE) – gleiche Referenz (px) */}
          <div
            ref={handleRef}
            className={clsx(
              "absolute inset-y-0 flex items-center justify-center",
              "touch-none cursor-grab active:cursor-grabbing"
            )}
            style={{ left: `${posPx}px`, width: "48px" }}
            onPointerDown={beginDrag}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            role="slider"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Number.isFinite(handlePct) ? handlePct : 0}
            aria-label="Runde beenden"
          >
            <img
              src={flagPng}
              alt=""
              className="h-full w-full object-contain drop-shadow-[0_2px_0_rgba(0,0,0,0.75)]"
              draggable={false}
            />
          </div>

          {trailTicks.map((tick, idx) => {
            if (tick === 0) return null;
            const stop = FIREWORK_TRAIL_STOPS[idx];
            const leftPx = clampPx(stop.threshold * maxPx + handleW / 2, handleW / 2, trackW - handleW / 2);
            return (
              <PixelFireworkRing
                key={`trail-${idx}-${tick}`}
                staticOnly={prefersReducedMotion}
                intensity={stop.intensity}
                className="pointer-events-none absolute z-20"
                style={{
                  left: `${leftPx}px`,
                  top: `calc(50% + ${stop.offsetY}px)`,
                  transform: `translate(-50%, -50%) scale(${stop.scale})`,
                  transformOrigin: "bottom center",
                }}
              />
            );
          })}

          {completed &&
            FIREWORK_COMPLETION_STOPS.map((stop, idx) => {
              const leftPx = clampPx(stop.threshold * maxPx + handleW / 2, handleW / 2, trackW - handleW / 2);
              return (
                <PixelFireworkRing
                  key={`finish-${fireKey}-${idx}`}
                  staticOnly={prefersReducedMotion}
                  intensity={stop.intensity}
                  className="pointer-events-none absolute z-25"
                  style={{
                    left: `${leftPx}px`,
                    top: `calc(50% + ${stop.offsetY}px)`,
                    transform: `translate(-50%, -50%) scale(${stop.scale})`,
                    transformOrigin: "bottom center",
                  }}
                />
              );
            })}
        </div>
      </div>
    </div>
  );
}

/* Utils */
function clampPx(v: number, min: number, max: number) {
  if (Number.isNaN(v)) return min;
  if (v < min) return min;
  if (v > max) return max;
  return v;
}

type TrailStop = {
  threshold: number;
  offsetY: number;
  scale: number;
  intensity: PixelFireworkRingProps["intensity"];
};

const FIREWORK_TRAIL_STOPS: TrailStop[] = [
  { threshold: 0.18, offsetY: -6, scale: 1.15, intensity: "normal" },
  { threshold: 0.45, offsetY: 4, scale: 1.25, intensity: "dense" },
  { threshold: 0.72, offsetY: -4, scale: 1.2, intensity: "normal" },
];

const FIREWORK_COMPLETION_STOPS: TrailStop[] = [
  { threshold: 0.1, offsetY: -4, scale: 1.3, intensity: "normal" },
  { threshold: 0.3, offsetY: 6, scale: 1.4, intensity: "dense" },
  { threshold: 0.5, offsetY: -2, scale: 1.5, intensity: "dense" },
  { threshold: 0.7, offsetY: 4, scale: 1.35, intensity: "normal" },
  { threshold: 0.9, offsetY: -5, scale: 1.45, intensity: "dense" },
];
