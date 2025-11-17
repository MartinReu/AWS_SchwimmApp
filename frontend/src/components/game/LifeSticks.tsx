/**
 * LifeSticks: Teletext-Streichholz-Anzeige für verbleibende Leben.
 * Verwaltet lokale Klick-States, damit das Frontend sofort Feedback gibt, und synchronisiert nur bei Rundenwechseln mit dem Server.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import torchOn from "../../assets/ui/torch_lit.png";
import torchOff from "../../assets/ui/torch_off.png";
import clsx from "clsx";

type Props = {
  lives: number;       // echte Leben 1–4 (4 = Start, 1 = Schwimmst aktiv)
  onChange?: (next: number) => void;
  disabled?: boolean;
  roundId?: string;     // bei neuer Runde resetten
  className?: string;
};

/**
 * Visualisiert bis zu drei Teletext-Streichhölzer und meldet bei Klick neue Leben.
 * Wichtig:
 * - Wir rendern IMMER 3 Streichhölzer (fixe Indizes 0..2).
 * - Klick schaltet GENAU das betroffene Streichholz aus (einmalig pro Runde).
 * - Lokale Torch-Positionen bleiben stabil und werden NICHT bei jedem 'lives'-Poll neu verteilt.
 * - Reset NUR bei Rundenwechsel (roundId) ODER wenn der Server die Leben ERHÖHT (z. B. Rundenstart).
 *
 * Ableitung:
 *   #brennend = lives - 1  (0..3)
 *   nextLives = (#brennend nach Klick) + 1
 */
export default function LifeSticks({ lives, onChange, disabled, roundId, className }: Props) {
  // initial aus Prop ableiten (nur für erste Mount oder Reset)
  const initial = useMemo(() => {
    const litCount = clamp(lives - 1, 0, 3);
    return [0, 1, 2].map((i) => i < litCount); // links -> rechts anfangs an
  }, [lives]);

  const [state, setState] = useState<boolean[]>(initial);
  const prevLivesRef = useRef(lives);
  const prevRoundRef = useRef<string | undefined>(roundId);

  // Reset-Logik:
  // - Wenn die Runde wechselt → mit neuen Server-Leben initialisieren
  // - Wenn die Leben vom Server STEIGEN (z. B. neue Runde) → initialisieren
  // - Wenn die Leben gleich bleiben oder fallen → lokale Klick-States behalten
  useEffect(() => {
    const prevRound = prevRoundRef.current;
    const prevLives = prevLivesRef.current;

    const roundChanged = prevRound !== roundId;
    const livesIncreased = lives > prevLives;

    if (roundChanged || livesIncreased) {
      const litCount = clamp(lives - 1, 0, 3);
      const next = [0, 1, 2].map((i) => i < litCount);
      setState(next);
    }

    prevRoundRef.current = roundId;
    prevLivesRef.current = lives;
  }, [lives, roundId]);

  /**
   * Deaktiviert exakt das angeklickte Streichholz und meldet die neue Lebenszahl (litCount + 1) nach außen.
   * Klicks sind nur möglich, solange der Stick noch brennt und nicht disabled ist.
   */
  function handleClick(i: number) {
    if (disabled) return;
    if (!state[i]) return; // schon aus → nicht klickbar

    const next = [...state];
    next[i] = false; // GENAU dieses Streichholz aus
    setState(next);

    const nextLit = next.filter(Boolean).length;
    const nextLives = nextLit + 1;
    onChange?.(nextLives);
  }

  return (
    <div className={clsx("w-full flex justify-center gap-8", className)}>
      {[0, 1, 2].map((i) => {
        const isLit = state[i];
        return (
          <button
            key={i}
            type="button"
            onClick={() => handleClick(i)}
            disabled={disabled || !isLit}
            className={clsx(
              "relative inline-flex items-center justify-center",
              "h-32 w-20 sm:h-36 sm:w-24 flex-shrink-0 select-none",
              disabled || !isLit
                ? "opacity-80 cursor-default"
                : "cursor-pointer active:translate-y-[1px] transition-transform"
            )}
            aria-label={`Streichholz ${i + 1} (${isLit ? "an" : "aus"})`}
          >
            <img
              src={isLit ? torchOn : torchOff}
              alt=""
              className="max-h-full max-w-full object-contain pointer-events-none drop-shadow-[0_6px_0_rgba(0,0,0,0.9)]"
              draggable={false}
            />
          </button>
        );
      })}
    </div>
  );
}

/** Begrenzungs-Helfer für Lives- und Pixel-Werte (0..3, etc.). */
function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
