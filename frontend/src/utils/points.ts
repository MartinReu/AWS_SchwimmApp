/**
 * Utility für Punktzahl-Darstellungen in Scoreboards und Spielernamen.
 * Wird z. B. in Leaderboards verwendet, um lesbare Labels ("1 Punkt", "4 Punkte") zu erzeugen.
 */
/**
 * Formatiert Punktzahlen für UI-Labels inklusive Singular-/Plural-Schreibweise.
 * Null, undefined oder NaN werden als 0 interpretiert, damit kein leerer Text entsteht.
 * Beispiel: formatPoints(3) -> "3 Punkte"; formatPoints(null) -> "0 Punkte".
 */
export function formatPoints(value: number | null | undefined): string {
  const normalized = typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : 0;
  const label = normalized === 1 ? "Punkt" : "Punkte";
  return `${normalized} ${label}`;
}
