/**
 * EndRoundSlider: Drag-Slider im Teletext-Look, mit dem Spieler:innen den Rundensieg melden.
 * Nutzt Pointer-Events, um den Griff zu bewegen, triggert Firework-Effekte und ruft `onComplete`, sobald der Griff rechts ankommt.
 */
import type React from "react";
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

const COMPLETION_DELAY_MS = 950;
const COMPLETION_THRESHOLD = 0.9;
const DEFAULT_HANDLE_WIDTH = 104;
const HANDLE_HEIGHT = {
  base: "h-14",
  sm: "sm:h-16",
};

/** Teletext-Slider zum Rundenabschluss - feuert onComplete, sobald der Griff rechts ankommt. */
export default function EndRoundSlider({ onComplete, disabled }: Props) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<HTMLDivElement | null>(null);

  const [trackW, setTrackW] = useState(1);
  const [handleW, setHandleW] = useState(DEFAULT_HANDLE_WIDTH);
  const maxPx = Math.max(0, trackW - handleW);
  const handleWidth = handleW || DEFAULT_HANDLE_WIDTH;

  const [posPx, setPosPx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [activePointerId, setActivePointerId] = useState<number | null>(null);
  const grabOffsetPxRef = useRef(0);
  const hasDraggedRef = useRef(false);

  const [completed, setCompleted] = useState(false);
  const [fireKey, setFireKey] = useState(0);
  const [trailTicks, setTrailTicks] = useState(() => FIREWORK_TRAIL_STOPS.map(() => 0));
  const trailTriggeredRef = useRef<boolean[]>(FIREWORK_TRAIL_STOPS.map(() => false));
  const { prefersReducedMotion } = usePixelFirework();
  const completionStartedRef = useRef(false);

  useEffect(() => {
    function measure() {
      const tw = trackRef.current?.clientWidth ?? 1;
      const hw = handleRef.current?.clientWidth ?? DEFAULT_HANDLE_WIDTH;
      const safeHandleW = Math.max(32, hw);
      setTrackW(Math.max(1, tw));
      setHandleW(safeHandleW);
      setPosPx((p) => clampPx(p, 0, Math.max(0, tw - safeHandleW)));
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

  useEffect(() => {
    if (!disabled) return;
    setDragging(false);
    setActivePointerId(null);
    if (!completed) {
      setPosPx(0);
      resetTrailFireworks();
    }
  }, [disabled, completed]);

  function beginDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (disabled || completed || !trackRef.current) return;
    if (e.cancelable) {
      e.preventDefault();
    }
    const rect = trackRef.current.getBoundingClientRect();
    const pointerX = e.clientX - rect.left;
    const initialLeft = clampPx(posPx, 0, maxPx);
    grabOffsetPxRef.current = pointerX - initialLeft;
    hasDraggedRef.current = false;

    setActivePointerId(e.pointerId);
    setDragging(true);
    setPosPx(initialLeft);
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  }

  function moveDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging || completed || !trackRef.current) return;
    if (activePointerId !== null && e.pointerId !== activePointerId) return;

    const rect = trackRef.current.getBoundingClientRect();
    const pointerX = e.clientX - rect.left;
    const desiredLeftPx = pointerX - grabOffsetPxRef.current;
    const next = clampPx(desiredLeftPx, 0, maxPx);

    setPosPx(next);
    hasDraggedRef.current = true;

    if (!completionStartedRef.current && maxPx > 0 && next / maxPx >= COMPLETION_THRESHOLD) {
      startCompletion();
    }
  }

  function endDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    if (activePointerId !== null && e.pointerId !== activePointerId) return;

    setDragging(false);
    setActivePointerId(null);
    try {
      (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
    } catch {
      /* ignore release errors */
    }

    if (completed) return;

    if (!hasDraggedRef.current) {
      setPosPx(0);
      resetTrailFireworks();
      return;
    }

    const progressNow = maxPx > 0 ? posPx / maxPx : 0;
    if (progressNow >= COMPLETION_THRESHOLD) {
      startCompletion();
      return;
    }

    setPosPx(0);
    resetTrailFireworks();
  }

  function cancelDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (activePointerId !== null && e.pointerId !== activePointerId) return;
    endDrag(e);
  }

  const handlePct = maxPx > 0 ? Math.round((posPx / maxPx) * 100) : 0;
  const progress = maxPx > 0 ? posPx / maxPx : 0;
  const wipePx = clampPx(posPx + handleWidth, 0, trackW);

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (disabled || completed) return;
    const step = Math.max(12, handleWidth * 0.25);

    if (e.key === "ArrowRight") {
      e.preventDefault();
      setPosPx((prev) => {
        const next = clampPx(prev + step, 0, maxPx);
        if (!completionStartedRef.current && maxPx > 0 && next / maxPx >= COMPLETION_THRESHOLD) {
          startCompletion();
        }
        return next;
      });
      return;
    }

    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setPosPx((prev) => clampPx(prev - step, 0, maxPx));
      return;
    }

    if (e.key === "Enter" || e.key === " ") {
      if (progress >= COMPLETION_THRESHOLD) {
        e.preventDefault();
        startCompletion();
      }
    }
  }

  function startCompletion() {
    if (completionStartedRef.current) return;
    completionStartedRef.current = true;
    setCompleted(true);
    setDragging(false);
    setActivePointerId(null);
    setPosPx(maxPx);
    setFireKey((k) => k + 1);
    window.setTimeout(() => onComplete(), COMPLETION_DELAY_MS);
  }

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

  function resetTrailFireworks() {
    trailTriggeredRef.current = FIREWORK_TRAIL_STOPS.map(() => false);
    setTrailTicks(FIREWORK_TRAIL_STOPS.map(() => 0));
  }

  return (
    <div className="w-full">
      <div className="relative border-4 border-[var(--tt-danger)] bg-black py-2 sm:py-3 px-0 shadow-[0_6px_0_rgba(0,0,0,0.85)] overflow-visible">
        <div
          ref={trackRef}
          className={clsx(
            "relative h-14 sm:h-16 select-none overflow-visible bg-black",
            "touch-pan-y",
            disabled && "opacity-60"
          )}
        >
          <div
            className={clsx(
              "pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center px-6 transition-opacity duration-150",
              completed && "opacity-0"
            )}
            style={{
              clipPath: completed ? "inset(0 0 0 100%)" : `inset(0 0 0 ${wipePx}px)`,
            }}
          >
            <span
              aria-hidden
              className="tt-text mb-1 text-xs sm:text-sm font-black uppercase tracking-[0.3em] text-[var(--tt-secondary)] drop-shadow-[0_2px_0_rgba(0,0,0,0.75)]"
            >
              {">>>>"}
            </span>
            <span className="tt-text text-sm sm:text-base font-black uppercase tracking-[0.18em] text-white drop-shadow-[0_2px_0_rgba(0,0,0,0.75)] whitespace-nowrap">
              SLIDE TO FINISH
            </span>
          </div>
          <div
            ref={handleRef}
            className={clsx(
              "absolute left-0 z-20 flex items-center justify-center bg-black px-1",
              HANDLE_HEIGHT.base,
              HANDLE_HEIGHT.sm,
              "cursor-grab active:cursor-grabbing touch-pan-y",
              dragging ? "transition-none" : "transition-[left] duration-150 ease-out"
            )}
            style={{
              left: `${posPx}px`,
              transform: "translateY(-50%)",
              top: "50%",
            }}
            role="slider"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Number.isFinite(handlePct) ? handlePct : 0}
            aria-disabled={disabled || completed}
            aria-label="Runde beenden"
            tabIndex={disabled || completed ? -1 : 0}
            onKeyDown={handleKeyDown}
            onPointerDown={beginDrag}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={cancelDrag}
          >
            <img
              src={flagPng}
              alt=""
              className="h-full w-auto object-contain select-none drop-shadow-[0_2px_0_rgba(0,0,0,0.85)]"
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
                loop={!prefersReducedMotion}
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
                  loop={!prefersReducedMotion}
                  intensity={stop.intensity}
                  className="pointer-events-none absolute z-30"
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
