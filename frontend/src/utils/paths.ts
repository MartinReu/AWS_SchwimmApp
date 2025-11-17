/**
 * Sammlung von Helfern, die URL-Pfade für Lobby-, Game- und Win/Lose-Screens generieren.
 * Wird von Router-Redirects und Link-Komponenten genutzt, um konsistente, URL-encoded Pfade inklusive Query-Parametern zu erzeugen.
 */
/** Parameter-Grundstruktur für alle Lobby-Pfade (Name plus optional ID für Query). */
type LobbyPathArgs = {
  lobbyName: string;
  lobbyId?: string | null;
};

/** Round-Pfad erweitert Lobby-Argumente um eine optionale Rundennummer (z. B. /round/2). */
type RoundPathArgs = LobbyPathArgs & {
  roundNumber?: number | null;
};

/** Erlaubte Werte für Query-Parameter; null/undefined werden ausgesiebt. */
type SearchValues = string | number | null | undefined;

/**
 * Baut die Round-Route für eine Lobby, optional mit fixer Rundennummer.
 * Eingabe: lobbyName (wird URL-encoded), lobbyId (landet als Query), roundNumber (nur wenn numerisch).
 * Ausgabe: String wie `/lobby/Alpha/round/2?lobbyId=123`.
 */
export function roundPath({ lobbyName, lobbyId, roundNumber }: RoundPathArgs) {
  const segment = encodeLobbySegment(lobbyName);
  // Wenn eine konkrete Rundenzahl bekannt ist, hängt sie als zusätzliches Segment an; ansonsten bleibt es bei /round
  const suffix = typeof roundNumber === "number" && !Number.isNaN(roundNumber)
    ? `/round/${roundNumber}`
    : "/round";
  return appendLobbyId(`/lobby/${segment}${suffix}`, lobbyId);
}

/**
 * Baut die Lose-Route – nutzt Rundennummer, wenn sie bekannt ist.
 * Beispiel: losePath({ lobbyName: "Alpha", roundNumber: 3 }) -> `/lobby/Alpha/round/3/lose`.
 */
export function losePath({ lobbyName, lobbyId, roundNumber }: RoundPathArgs) {
  const segment = encodeLobbySegment(lobbyName);
  const base =
    typeof roundNumber === "number" && !Number.isNaN(roundNumber)
      ? `/lobby/${segment}/round/${roundNumber}/lose`
      : `/lobby/${segment}/round/lose`;
  return appendLobbyId(base, lobbyId);
}

/** Baut die Gewinner-Route für eine Lobby; hängt lobbyId als Query an, wenn vorhanden. */
export function winPath({ lobbyName, lobbyId }: LobbyPathArgs) {
  const segment = encodeLobbySegment(lobbyName);
  return appendLobbyId(`/lobby/${segment}/win`, lobbyId);
}

/**
 * Basis-Lobby-Route ohne weitere Segmente.
 * Praktisch für Links auf die Lobby-Startseite oder als Ausgangspunkt für weitere manuelle Anhänge.
 */
export function lobbyBasePath({ lobbyName, lobbyId }: LobbyPathArgs) {
  const segment = encodeLobbySegment(lobbyName);
  return appendLobbyId(`/lobby/${segment}`, lobbyId);
}

/**
 * Ergänzt einen fertigen Pfad um `?lobbyId=...` bzw. `&lobbyId=...`,
 * falls bereits Search-Parameter existieren. Gibt den ursprünglichen Pfad zurück, wenn keine ID gesetzt wurde.
 */
function appendLobbyId(path: string, lobbyId?: string | null) {
  if (!lobbyId) return path;
  const joiner = path.includes("?") ? "&" : "?";
  return `${path}${joiner}lobbyId=${encodeURIComponent(lobbyId)}`;
}

/**
 * Wandelt Lobby-Namen in einen URL-sicheren Pfad-Slug um und nutzt "lobby" als Fallback,
 * damit selbst bei fehlendem Namen eine valide Route entsteht.
 */
function encodeLobbySegment(name: string) {
  return encodeURIComponent(name || "lobby");
}

/**
 * Hängt Query-Parameter an eine Route an und filtert leere Werte heraus.
 * Beispiel: withSearch("/lobby/Alpha/round", { playerId: "abc", round: null }) -> `/lobby/Alpha/round?playerId=abc`
 */
export function withSearch(path: string, params: Record<string, SearchValues>) {
  const entries = Object.entries(params).filter(
    ([, value]) => value !== undefined && value !== null && value !== ""
  );
  if (!entries.length) return path;
  const search = new URLSearchParams();
  for (const [key, value] of entries) {
    search.set(key, String(value));
  }
  const joiner = path.includes("?") ? "&" : "?";
  return `${path}${joiner}${search.toString()}`;
}
