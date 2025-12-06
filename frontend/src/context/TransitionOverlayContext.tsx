/**
 * TransitionOverlayContext stellt eine einfache API bereit, um die Bubble-Page-Transition einzublenden.
 * Provider hängt das Overlay global ans DOM an, Clients triggern es über triggerBubbleTransition().
 */
import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import BubbleTransitionOverlay, { BUBBLE_OVERLAY_DURATION_MS } from "../components/transition/BubbleTransitionOverlay";

type TransitionOverlayContextValue = {
  triggerBubbleTransition: (options?: { duration?: number }) => void;
};

const TransitionOverlayContext = createContext<TransitionOverlayContextValue | undefined>(undefined);

const DEFAULT_DURATION_MS = BUBBLE_OVERLAY_DURATION_MS;

/**
 * Provider, der das Overlay managed (Sichtbarkeit, Timeout) und die Trigger-Funktion bereitstellt.
 * Wird um App gewrappt, damit Seitenwechsel und Login denselben Effekt teilen.
 */
export function TransitionOverlayProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [overlayKey, setOverlayKey] = useState(0);
  const hideTimeout = useRef<number | null>(null);

  const triggerBubbleTransition = useCallback((options?: { duration?: number }) => {
    const duration = Math.max(options?.duration ?? DEFAULT_DURATION_MS, DEFAULT_DURATION_MS);
    if (hideTimeout.current) {
      window.clearTimeout(hideTimeout.current);
    }
    setOverlayKey((key) => key + 1);
    setVisible(true);
    hideTimeout.current = window.setTimeout(() => {
      setVisible(false);
      hideTimeout.current = null;
    }, duration);
  }, []);

  useEffect(() => {
    return () => {
      if (hideTimeout.current) {
        window.clearTimeout(hideTimeout.current);
      }
    };
  }, []);

  return (
    <TransitionOverlayContext.Provider value={{ triggerBubbleTransition }}>
      {children}
      <BubbleTransitionOverlay key={visible ? overlayKey : "hidden"} visible={visible} variantKey={overlayKey} />
    </TransitionOverlayContext.Provider>
  );
}

/** Hook, um die Trigger-Funktion aus dem Kontext zu lesen. */
export function useTransitionOverlay() {
  const ctx = useContext(TransitionOverlayContext);
  if (!ctx) {
    throw new Error("useTransitionOverlay muss innerhalb eines TransitionOverlayProvider genutzt werden.");
  }
  return ctx;
}
