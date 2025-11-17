/**
 * Hook zur Steuerung der Pixel-Feuerwerk-Animationen.
 * Erkennt das Browser-Media-Feature `prefers-reduced-motion` und deaktiviert bei Bedarf animierte Effekte.
 */
import { useEffect, useState } from "react";

/** Liefert Motion-Präferenzen für Firework-Animationen (reduce motion aware). */
export function usePixelFirework() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => getPrefersReducedMotion());

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleChange = () => setPrefersReducedMotion(media.matches);
    handleChange();
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  return {
    prefersReducedMotion,
    isEnabled: !prefersReducedMotion,
  };
}

/** Liest die aktuelle reduce-motion-Präferenz aus dem Browser. */
function getPrefersReducedMotion() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
