# Schwimm – Mock Backend (DEV)

Express-basierter In-Memory-Server, den das Vite-Frontend konsumiert, um Lobby-, Runden-, Sprüche- und Leaderboard-Daten ohne echtes Backend zu testen. Alle Daten liegen nur im RAM und werden beim Neustart verworfen.

## Setup & Start
1. `cp .env.example .env`
2. `npm install`
3. `npm run dev` (startet auf `http://localhost:4000`)

Optionale Variablen in `.env`:

- `PORT`: Port des Servers (Default `4000`).
- `IDEMPOTENT_JOIN`: `true`, um erneute Join-Requests ohne Session-ID zuzulassen, solange der Name bereits aktiv ist.

## Allgemeine Hinweise
- Alle Endpunkte erwarten und liefern JSON.
- Die Mock-DB ist nicht persistent. Tests sollten daher die nötigen Lobbys/Spieler neu anlegen.
- Spieler- und Lobby-Namen werden mit `normLine` gereinigt (Trim + Mehrfach-Whitespace auf ein Leerzeichen reduziert).
- Frontend schickt optional `clientSessionId` (localStorage, siehe LoginPage/Resume-Flow), damit Rejoins idempotent funktionieren (`IDEMPOTENT_JOIN=true` erlaubt Wiederbeitritt ohne Session-ID).

## API-Überblick

### Lobbys & Spieler
- `GET /lobbies` – Liefert alle Lobbys (Status, CreatedAt), absteigend nach Erstellzeit.
- `GET /lobbies/:id` – Einzelne Lobby per ID. `404`, wenn nicht vorhanden.
- `POST /lobbies` – Body `{ "name": "Meine Lobby" }`.
  - Länge 2–22 Zeichen, Case-insensitiver Duplicate-Check, sonst `409`.
  - Response `201` mit `{ id, name, status: "open", createdAt }`.
- `GET /players?lobbyId=<id>` – Liste öffentlicher Spieler (ohne Session-Daten). `404`, wenn Lobby fehlt.
- `GET /players/all-names` – Deduplizierte Liste aller bekannten Spielernamen (alphabetisch). Grundlage für das Login-Autocomplete.
- `POST /lobbies/:lobbyId/join` – Legacy-Variante, Response enthält nur das öffentliche Spielerobjekt.
- `POST /lobbies/:lobbyId/join-or-rejoin` – Liefert die vollständige Payload `{ ok, mode, player, errorCode, message }`.
- `POST /lobbies/by-name/:lobbyName/join-or-rejoin` – Wie oben, Lobby wird am Anzeigenamen gefunden.

Join-/Rejoin-Body Felder:
```json
{
  "name": "Alice",          // alias: playerName, mind. 2 / max. 18 Zeichen
  "clientSessionId": "abc"  // optional, zur Unterscheidung aktiver Verbindungen
}
```

Fehlercodes: `NAME_ACTIVE`, `NAME_TAKEN`, `MAX_PLAYERS`, `UNKNOWN`.  
Aktive Spieler (> 0 Leben) zählen fürs Limit von 8 Sitzplätzen; getrennte Spieler geben Slots wieder frei.

### Lobby-Löschungen
Alle Varianten rufen intern `removeLobbyCascade` auf und löschen Lobby, Spieler, Runden, Scores und Lives.

- Nach ID: `DELETE /lobbies/:lobbyId`, `POST /lobbies/:lobbyId/delete`, `POST /lobbies/:lobbyId/hard-delete`, sowie die `leaderboard/leaderboards`-Aliase.
- Nach Namen: `DELETE /lobbies/by-name/:lobbyName`, `POST /lobbies/by-name/:lobbyName/delete` plus die entsprechenden `leaderboard`-Alias-Routen.
- Per Body: `POST /lobbies/delete`, `POST /leaderboard/delete`, `POST /leaderboards/delete` mit `{ lobbyId?, lobbyName? }`.

Antwort: `204` bei DELETE-Endpunkten, sonst `{ ok: true, lobbyId, lobbyName, removedPlayers, removedRounds }` bzw. `404`, falls unbekannt.

### Quotes
- `GET /quotes` – Gibt alle Sprüche (neueste zuerst) zurück.
- `POST /quotes` – Body `{ "text": "Dein Spruch" }`, 5–220 Zeichen. Response `{ id, text, createdAt }`.

### Runden, Leben & Scores
- `GET /rounds/current?lobbyId=<id>` – Aktuelle Runde einer Lobby plus Lives (`roundId`, `playerId`, `livesRemaining`) und Score-Snapshot.
- `POST /rounds/start` – Body `{ "lobbyId": "<id>" }`.
  - Erstellt Runde `number = letzte + 1`, setzt Lives auf 4 pro Spieler.
  - Response `{ round, lives }`.
- `PATCH /rounds/:roundId/life` – Body `{ "playerId": "...", "livesRemaining": 0-4 }`. Nur möglich, solange `state === "running"`.
- `POST /rounds/:roundId/finish` – Body `{ "winnerPlayerId": "..." }`.
  - Markiert Runde als beendet, speichert Gewinner, erhöht dessen Score.
  - Response `{ round, scores }`.

### Leaderboard
- `GET /leaderboard`
  - Optionale Query-Parameter: `search`/`query` (Substring-Suche im Lobby-Namen), `limit`, `offset`.
  - Response: Liste aller Lobbys mit Spielern (`pointsTotal`, `isActive`) und Anzahl abgeschlossener Runden.

### Healthcheck
- `GET /health` – `{ ok: true, time: <ISO> }`, hilfreich für Container/CI-Checks.
