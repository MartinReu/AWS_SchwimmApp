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
const MAX_DELAY = 400;
const MIN_DURATION = 700;
const MAX_DURATION = 1100;

export const BUBBLE_OVERLAY_DURATION_MS = 1500;

interface BubbleTransitionOverlayProps {
  visible: boolean;
  variantKey?: number;
}

/**
 * Vollbild-Blasenanimation, die bei sichtbarem Zustand eine neue Zufallskonfiguration erzeugt.
 * Props:
 * - visible: steuert Rendern via Portal
 * - variantKey: erzwingt neuen Zufalls-Seed beim Triggern, damit die Animation variiert
 */
export default function BubbleTransitionOverlay({ visible, variantKey = 0 }: BubbleTransitionOverlayProps) {
  const bubbles = useMemo(() => createBubbleConfig(BUBBLE_COUNT), [variantKey]);

  if (!visible) return null;

  const overlayStyle: CSSProperties = { ["--bubble-overlay-duration" as string]: `${BUBBLE_OVERLAY_DURATION_MS}ms` };

  const overlay = (
    <div
      className="fixed inset-0 z-[9999] pointer-events-none animate-bubble-overlay"
      style={overlayStyle}
      aria-hidden="true"
      role="presentation"
    >
      <div className="relative h-full w-full max-w-5xl mx-auto overflow-hidden">
        {bubbles.map((bubble) => (
          <span
            key={bubble.id}
            className="absolute block motion-safe:animate-bubble-rise motion-reduce:bottom-[15%] motion-reduce:animate-bubble-fade"
            style={
              {
                left: `${bubble.left}%`,
                bottom: "-12vh",
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
function createBubbleConfig(length: number): BubbleConfig[] {
  return Array.from({ length }, (_, index) => ({
    id: index,
    left: randomBetween(8, 92),
    size: randomBetween(MIN_SIZE, MAX_SIZE),
    delay: randomBetween(MIN_DELAY, MAX_DELAY),
    duration: randomBetween(MIN_DURATION, MAX_DURATION),
  }));
}

/** Liefert eine Zufallszahl im [min, max]-Intervall mit optionaler Rundung auf Dezimalstellen. */
function randomBetween(min: number, max: number, precision = 0) {
  const value = Math.random() * (max - min) + min;
  if (precision <= 0) return Math.round(value);
  const multiplier = 10 ** precision;
  return Math.round(value * multiplier) / multiplier;
}
