/**
 * Globale Typdefinitionen für das Vite-Frontend.
 * Erweitert die automatisch generierten Typen um Projekt-spezifische Umgebungsvariablen,
 * damit TypeScript in Komponenten klare Hinweise zu `import.meta.env` liefert.
 */
/// <reference types="vite/client" />

// Optional: eigene Umgebungsvariablen typisieren
interface ImportMetaEnv {
  /** Basis-URL für das Mock-/Backend-API (z. B. http://localhost:4000) */
  readonly VITE_API_URL?: string;
  /** Feature-Flag, das animierte Highlights in der Spieleransicht aktiviert (z. B. "true"). */
  readonly VITE_ENABLE_PLAYERLIST_FIREWORKS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
