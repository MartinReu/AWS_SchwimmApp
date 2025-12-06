/**
 * BubbleTransitionOverlay rendert eine kurze Vollbild-Blasenanimation.
 * Wird vom TransitionOverlayContext als Page-Transition genutzt (z. B. beim Login), ohne das App-Markup zu verändern.
 * Nutzt Portals, damit die Animation unabhängig vom aktuellen Layout über dem gesamten Viewport liegt.
 */
import { CSSProperties, useMemo } from "react";
import { createPortal } from "react-dom";
import bubbleTexture from "../../assets/ui/bubbles.png";

type BubbleConfig = {
  id: number;
  left: number;
  size: number;
  delay: number;
  duration: number;
};

const BUBBLE_COUNT = 140;
const MIN_SIZE = 42;
const MAX_SIZE = 190;
const MIN_DELAY = 0;
const MAX_DELAY = 160;
const MIN_DURATION = 1500;
const MAX_DURATION = 2600;
const DESKTOP_BUBBLE_VARS = {
  startBottom: 0,
  riseStart: 26,
  riseEnd: -220,
  riseStartScale: 0.96,
  riseEndScale: 1.1,
};
const MOBILE_BUBBLE_VARS = {
  startBottom: 0,
  riseStart: 22,
  riseEnd: -200,
  riseStartScale: 0.94,
  riseEndScale: 1.08,
};

export const BUBBLE_OVERLAY_DURATION_MS = 2800;

interface BubbleTransitionOverlayProps {
  visible: boolean;
  variantKey?: number;
}

type BubbleConfigOptions = {
  minSize?: number;
  maxSize?: number;
  minDelay?: number;
  maxDelay?: number;
  minDuration?: number;
  maxDuration?: number;
};

/**
 * Vollbild-Blasenanimation, die bei sichtbarem Zustand eine neue Zufallskonfiguration erzeugt.
 * Props:
 * - visible: steuert Rendern via Portal
 * - variantKey: erzwingt neuen Zufalls-Seed beim Triggern, damit die Animation variiert
 */
export default function BubbleTransitionOverlay({ visible, variantKey = 0 }: BubbleTransitionOverlayProps) {
  const isMobile = typeof window !== "undefined" ? window.matchMedia("(max-width: 640px)").matches : false;

  const bubbleOptions = useMemo<BubbleConfigOptions>(
    () => ({
      minSize: isMobile ? 30 : MIN_SIZE,
      maxSize: isMobile ? 140 : MAX_SIZE,
      minDelay: MIN_DELAY,
      maxDelay: isMobile ? MAX_DELAY + 60 : MAX_DELAY,
      minDuration: isMobile ? MIN_DURATION + 120 : MIN_DURATION,
      maxDuration: isMobile ? MAX_DURATION + 180 : MAX_DURATION,
    }),
    [isMobile]
  );

  const bubbleCount = isMobile ? Math.round(BUBBLE_COUNT * 0.8) : BUBBLE_COUNT;
  const bubbles = useMemo(() => createBubbleConfig(bubbleCount, bubbleOptions), [bubbleCount, bubbleOptions, variantKey]);

  if (!visible) return null;

  const bubbleVars = isMobile ? MOBILE_BUBBLE_VARS : DESKTOP_BUBBLE_VARS;
  const overlayStyle: CSSProperties = {
    ["--bubble-overlay-duration" as string]: `${BUBBLE_OVERLAY_DURATION_MS}ms`,
    ["--bubble-start-bottom" as string]: `${bubbleVars.startBottom}dvh`,
    ["--bubble-rise-start" as string]: `${bubbleVars.riseStart}dvh`,
    ["--bubble-rise-end" as string]: `${bubbleVars.riseEnd}dvh`,
    ["--bubble-rise-start-scale" as string]: `${bubbleVars.riseStartScale}`,
    ["--bubble-rise-end-scale" as string]: `${bubbleVars.riseEndScale}`,
  };

  const overlay = (
    <div
      className="fixed inset-0 z-[9999] pointer-events-none animate-bubble-overlay overflow-hidden bg-transparent"
      style={overlayStyle}
      aria-hidden="true"
      role="presentation"
    >
      <div className="relative h-full min-h-screen min-h-[100dvh] w-full max-w-6xl mx-auto overflow-visible sm:overflow-hidden">
        {bubbles.map((bubble) => (
          <span
            key={bubble.id}
            className="bubble-transition__bubble absolute block animate-bubble-rise motion-reduce:animate-bubble-fade motion-reduce:opacity-80"
            style={
              {
                left: `${bubble.left}%`,
                width: `${bubble.size}px`,
                height: `${bubble.size}px`,
                ["--bubble-rise-duration" as string]: `${bubble.duration}ms`,
                animationDelay: `${bubble.delay}ms`,
              } as CSSProperties
            }
          >
            <img
              src={bubbleTexture}
              alt=""
              className="h-full w-full object-contain drop-shadow-[0_0_14px_rgba(91,208,255,0.85)]"
              draggable={false}
            />
          </span>
        ))}
      </div>
    </div>
  );

  if (typeof document === "undefined") return overlay;
  return createPortal(overlay, document.body);
}

/** Erzeugt eine determinierte Liste von Blasen mit zufälliger Größe/Position/Timing. */
function createBubbleConfig(length: number, options?: BubbleConfigOptions): BubbleConfig[] {
  const bounds = {
    minSize: options?.minSize ?? MIN_SIZE,
    maxSize: options?.maxSize ?? MAX_SIZE,
    minDelay: options?.minDelay ?? MIN_DELAY,
    maxDelay: options?.maxDelay ?? MAX_DELAY,
    minDuration: options?.minDuration ?? MIN_DURATION,
    maxDuration: options?.maxDuration ?? MAX_DURATION,
  };

  return Array.from({ length }, (_, index) => ({
    id: index,
    left: randomBetween(-4, 104),
    size: randomBetween(bounds.minSize, bounds.maxSize),
    delay: randomBetween(bounds.minDelay, bounds.maxDelay),
    duration: randomBetween(bounds.minDuration, bounds.maxDuration),
  }));
}

/** Liefert eine Zufallszahl im [min, max]-Intervall mit optionaler Rundung auf Dezimalstellen. */
function randomBetween(min: number, max: number, precision = 0) {
  const value = Math.random() * (max - min) + min;
  if (precision <= 0) return Math.round(value);
  const multiplier = 10 ** precision;
  return Math.round(value * multiplier) / multiplier;
}
