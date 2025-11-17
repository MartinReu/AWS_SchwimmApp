/**
 * Hook für Rundennummern aus der Route.
 * Wird von Game- und Lose-Seiten genutzt, um die aktuelle Runde zu validieren und als Number bereitzustellen.
 */
import { useMemo } from "react";
import { useParams } from "react-router-dom";

/** Parsed die Rundennummer aus der URL und liefert null bei ungültigen Werten. */
export function useRoundParams() {
  const params = useParams();
  const raw = params.roundNumber;

  return useMemo(() => {
    if (!raw) return { roundNumber: null };
    const parsed = Number(raw);
    if (Number.isNaN(parsed)) return { roundNumber: null };
    return { roundNumber: parsed };
  }, [raw]);
}
