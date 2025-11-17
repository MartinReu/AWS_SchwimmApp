# Schwimm – Multiplayer-Kartenspiel (React + Vite)

Mobile-first Vite/React-Frontend mit Teletext-/8-Bit-Look für das Kartenspiel „Schwimm“. Das Projekt enthält ein Mock-Backend, mit dem alle Lobby-, Runden- und Leaderboard-Flows ohne externe Services getestet werden können.

## Repo-Status & Release-Eignung

- Der gesamte Stack (Frontend + Mock-Backend) läuft lokal ohne Secrets oder Cloud-Ressourcen. Alle Konfigurationen erfolgen ausschließlich über `.env`-Dateien mit Dummy-Werten.
- Das Mock-Backend liefert realistische REST-Endpunkte. Daten werden im Speicher gehalten und gehen beim Neustart verloren, was für lokale Entwicklung beabsichtigt ist.

## Backend-Status

- **Jetzt**: `backend-mock/server.js` simuliert das geplante AWS-Amplify/DynamoDB-Setup inkl. Lobby-/Rejoin-Logik, Leaderboard-REST-Endpunkten und optionaler SSE-Streams.
- **Später**: Geplant ist ein echtes Backend auf Basis von AWS Amplify + AppSync (GraphQL) mit DynamoDB und Subscriptions für Presence/Leaderboard. Bis dahin bleiben Daten lokal/fake.

## Tech Stack

- React 18 + Vite 5 + TypeScript + Tailwind CSS für den Teletext-Stil.
- Node.js + npm Workspaces (Frontend + `backend-mock`) zur gleichzeitigen Entwicklung.
- Express + `nanoid` als Mock-Backend.
- Lokale Doku unter `docs/` (z. B. `docs/game-logic.md` für Spiellogik).

## Voraussetzungen

- Node.js **>= 18** (Vite 5-Anforderung).
- npm **>= 9** (Workspaces + Scripts).

## Installation & Entwicklung

1. Repository klonen: `git clone <repo-url> schwimm-app && cd schwimm-app`
2. Environment vorbereiten  
   - `cp .env.example frontend/.env` (Frontend-Vars)  
   - `cp backend-mock/.env.example backend-mock/.env` (Backend-Mock)
3. Abhängigkeiten installieren: `npm install`
4. Dev-Server starten  
   - Komplett-Stack: `npm run dev` (startet Vite auf `http://localhost:5173` und Mock-Backend auf `http://localhost:4000`)  
   - Nur Backend: `npm run dev:backend`  
   - Nur Frontend: `npm run dev:frontend`
5. Browser öffnen: `http://localhost:5173`

> Die App ist vollständig lauffähig, solange das Mock-Backend läuft. Für spätere AWS-Integrationen sind keine Keys oder Amplify-Resourcen notwendig.

### Verfügbare npm-Skripte

| Script | Zweck |
| --- | --- |
| `npm run dev` | Startet Frontend & Mock-Backend parallel. |
| `npm run dev:frontend` | Nur Vite-Dev-Server mit HMR. |
| `npm run dev:backend` | Startet den Express-Mock auf Port 4000. |
| `npm run build` | Produktionsbuild des Frontends. |
| `npm run preview` | Vorschau des gebauten Frontends. |
| `npm run lint` | Platzhalter für künftige Lint-Regeln (Frontend). |
| `npm run clean` | Entfernt sämtliche `node_modules` und Vite-Caches. |

## Environment Variablen

- Versionierte Templates: `.env.example`, `frontend/.env.example`, `backend-mock/.env.example`
- Persönliche `.env`-Dateien niemals einchecken (`.gitignore` deckt `.env*` vollständig ab).

### Frontend (Vite)

| Variable | Beschreibung | Default |
| --- | --- | --- |
| `VITE_API_URL` | Basis-URL für alle REST-Endpoints (Mock oder echt). | `http://localhost:4000` |
| `VITE_LOBBIES_API_URL` | Optionaler, dedizierter Lobby-Endpunkt (fällt auf `VITE_API_URL` zurück). | leer |
| `VITE_DEV_AUTO_BOOT` | `1` startet automatisch eine Dev-Lobby im Game-Flow. | `0` |
| `VITE_LEADERBOARDS_API_URL` | Separater Leaderboard-Endpunkt; sonst wird `VITE_API_URL` genutzt. | leer |
| `VITE_LEADERBOARDS_STREAM_URL` | SSE-/Stream-Endpunkt für Live-Leaderboards (fällt sonst auf Polling zurück). | leer |
| `VITE_ENABLE_REJOIN_MODE` | Aktiviert Rejoin-spezifische UI. | `true` |
| `VITE_ENABLE_PLAYERLIST_FIREWORKS` | Schaltet Pixel-Feuerwerke in Player-Listen. | `true` |
| `VITE_ENABLE_PAGE_TRANSITIONS` | Zusätzliche Page-Transition-Effekte (konfigurierbar via `frontend/.env`). | `true` |

### Backend-Mock (Express)

| Variable | Beschreibung | Default |
| --- | --- | --- |
| `PORT` | Port des Mock-Backends. | `4000` |
| `IDEMPOTENT_JOIN` | `true` erlaubt idempotente Join-Requests (z. B. bei Reloads). | `false` |

## Entwickler-Notizen

- Teletext-/8-Bit-Design bleibt unangetastet: Komponenten (`TTButton`, `TTPanel`, `TTInput`, etc.) liegen unter `frontend/src/components/common`.
- Mobile-first Layouts, optimiert für Touch, aber responsive bis Desktop.
- Bis zu **acht Spieler** pro Lobby, Lives/Points werden über Pixelanzeiger und Slider gesteuert.
- Lobby-/Spieler-Resume nutzt URL-Parameter + `localStorage`, Leaderboards bieten SSE & Polling.
- API-Schnittstellen können sich ändern, sobald das echte Amplify-Backend erreichbar ist. Mock-Endpunkte spiegeln aber schon jetzt die geplanten Routen.

### Architektur-Überblick

- **Frontend**  
  - Seiten unter `frontend/src/pages` (u. a. `HomePage`, `GamePage`, `LeaderboardPage`, `WinPage`, `LosePage`).  
  - Gemeinsame Layout-/Teletext-Komponenten in `frontend/src/components/common`.  
  - Feature-spezifische UI unter `frontend/src/components/game` und `frontend/src/components/lobby`.  
  - API-Layer: `frontend/src/api` aggregiert `lobbies`, `game`, `quotes`, `leaderboards`; `frontend/src/api/http.ts` hält Defaults.  
  - State via Hooks, `localStorage` für Session/Resume, SSE/Polling für Live-Daten.  
  - Styles unter `frontend/src/styles`.
- **Mock-Backend**  
  - `backend-mock/server.js` nutzt Express + In-Memory-DB für Lobbies, Spieler, Runden, Scores und Lives.  
  - Simuliert Join/Rejoin, Leaderboard-Löschungen, Hard/Soft-Delete und Presence-Pings.  
  - Keine externen Ressourcen; Neustart setzt Daten zurück.

### Spiel- & Lobby-Flows

- Lobby anlegen, Spieler joinen oder per Resume-Key reaktivieren (max. 8 Spieler).  
- Slider beendet Runden, Lives werden via Pixel-Sticks gemeldet; „Schwimmst“ blockiert Spieler bis zum Lose-Screen.  
- Leaderboard zeigt aggregierte Scores inkl. Statusmeldungen/Fehlertexte und Rejoin-Shortcuts.  
- Routing: `/`, `/leaderboard`, `/lobby/:name/round`, `/lobby/:name/round/:number/lose`, `/lobby/:name/win` sowie Legacy-Pfade (`/game`, `/lose`, `/win`) mit Redirects.  
- Ausführliche Doku befindet sich in `docs/game-logic.md`.

### Manuelle Smoke-Tests

1. **Rejoin-Flow** – Lobby erstellen, Spieler verbinden, Browser neu laden und erneut joinen: Spieler-ID bleibt stabil, Game öffnet sich automatisch.  
2. **Lobby-Dropdown & A11y** – Dropdown öffnen, Fokus/Keyboard testen (`aria-busy`, Hover-Ringe).  
3. **Runde beenden/Winner** – Slider ziehen, Backend bestätigt Gewinner, `/lobby/:name/win` zeigt Ergebnis.  
4. **Lose-Screen** – „Schwimmst“ triggern, Lose-Route wird aktiv, Neustart führt zurück in die Runde.  
5. **Routing & Deep-Linking** – Direkt `/lobby/<name>/round/<number>` oder Legacy-URL aufrufen; Zustand wird rekonstruiert.  
6. **Leaderboard-Statusmeldungen** – Laden, Fehlerfälle und leere Suchergebnisse prüfen; SSE aktivieren, falls `VITE_LEADERBOARDS_STREAM_URL` gesetzt ist.

## Roadmap / Backend

- Zielarchitektur: AWS Amplify + AppSync (GraphQL) + DynamoDB + GraphQL Subscriptions/SSE für Präsenz.  
- Amplify-Infrastruktur liefert künftig persistente Daten, echtes Matchmaking und Server-Side Validation.  
- Bis dahin reicht das Mock-Backend für lokale Entwicklung; keine AWS-Ressourcen oder Keys werden benötigt.

## Git / GitHub

1. `git init`
2. `git add . && git commit -m "chore: initial import"`
3. `git remote add origin <github-url>`
4. `git push -u origin main`

> `.gitignore` deckt `node_modules`, Builds, Logs und sämtliche `.env*` ab. Bitte `.env`-Dateien ausschließlich lokal halten oder via Secrets-Store in CI bereitstellen.

## Lizenz & Contributing

- Martin hats geschrieben!

## Zusätzliche Ressourcen

- Spiellogik & Flows: `docs/game-logic.md`
- Mock-Backend-Details: `backend-mock/README.md`
- Teletext-Komponenten & Layouts: siehe `frontend/src/components/**`
