# Schwimm – Multiplayer-Kartenspiel (React + Vite)

Teletext-/8-Bit-Kartenspiel "Schwimmen" mit React + Vite (Frontend) und einem Express-Mock-Backend. Lobby-basierter Mehrspieler-Flow mit Lives, Runden, Rangliste und Rejoin. Keine Secrets nötig; alles läuft lokal.

## Projektstruktur
- `frontend/`: React + Vite + TypeScript + Tailwind, mobile-first UI im Teletext-Stil.
- `backend-mock/`: Express-Server mit In-Memory-Daten (Lobbys, Spieler, Runden, Scores, Quotes, SSE/Polling).
- `docs/`: Projekt-Dokumentation (z. B. `docs/game-logic.md`, `docs/TODOs.md`).

## Voraussetzungen
- Node.js **>= 18**
- npm **>= 9**

## Installation & Start
1. Repo klonen und ins Verzeichnis wechseln.
2. Beispiel-Umgebungen kopieren (keine Secrets enthalten):
   ```bash
   cp .env.example frontend/.env
   cp backend-mock/.env.example backend-mock/.env
   ```
3. Abhängigkeiten installieren (Root-Workspace):
   ```bash
   npm install
   ```
4. Entwicklung starten:
   ```bash
   npm run dev            # Frontend + Mock-Backend parallel (localhost)
   npm run dev:frontend   # nur Vite-Dev-Server
   npm run dev:backend    # nur Mock-Backend auf Port 4000
   ```
5. Browser öffnen: `http://localhost:5173` (Mock-Backend: `http://localhost:4000`).

### LAN-Vorschau (optional)
- Frontend + Backend im Heimnetz: `npm run dev:lan`
- Nur Frontend im LAN: `npm run dev:frontend:lan`
- Nach Build Vorschau im LAN: `npm run preview:lan`

## Nützliche Skripte
| Script | Zweck |
| --- | --- |
| `npm run dev` | Startet Vite-Frontend + Mock-Backend gleichzeitig. |
| `npm run dev:frontend` / `npm run dev:frontend:lan` | Nur Frontend (localhost bzw. LAN). |
| `npm run dev:backend` | Mock-Backend allein. |
| `npm run build` | Produktionsbuild des Frontends. |
| `npm run preview` / `npm run preview:lan` | Vorschau des gebauten Frontends (localhost bzw. LAN). |
| `npm run lint` | Platzhalter für künftige Lint-Regeln (Frontend). |
| `npm run clean` | Entfernt `node_modules` und Vite-Caches. |

## Environment-Variablen
Versionierte Beispiele liegen als `.env.example` im Root, sowie in `frontend/` und `backend-mock/`.

### Frontend (Vite)
| Variable | Beschreibung | Default |
| --- | --- | --- |
| `VITE_API_URL` | Basis-URL für REST-Endpunkte (Mock oder echt). | `http://localhost:4000` |
| `VITE_LOBBIES_API_URL` | Optionaler dedizierter Lobby-Endpunkt (Fallback: `VITE_API_URL`). | leer |
| `VITE_LEADERBOARDS_API_URL` | Separater Leaderboard-Endpunkt; sonst `VITE_API_URL`. | leer |
| `VITE_LEADERBOARDS_STREAM_URL` | SSE-/Stream-Endpunkt für Live-Leaderboards, sonst Polling. | leer |
| `VITE_DEV_AUTO_BOOT` | `1` startet automatisch eine Dev-Lobby im Game-Flow. | `0` |
| `VITE_ENABLE_REJOIN_MODE` | Aktiviert Rejoin-spezifische UI. | `true` |
| `VITE_ENABLE_PLAYERLIST_FIREWORKS` | Pixel-Feuerwerke in Player-Listen. | `true` |
| `VITE_ENABLE_PAGE_TRANSITIONS` | Page-Transition-Effekte (Login/Seitenwechsel). | `true` |

### Backend-Mock (Express)
| Variable | Beschreibung | Default |
| --- | --- | --- |
| `PORT` | Port des Mock-Backends. | `4000` |
| `IDEMPOTENT_JOIN` | `true` erlaubt idempotente Join-Requests bei gleichen Namen. | `false` |

## Architekturüberblick
- **Frontend**: Seiten unter `frontend/src/pages` (Login, Home, Game, Leaderboard, Win, Lose). Teletext-Komponenten in `frontend/src/components/**`. Session/Resume via `localStorage`, Lives/Scores per REST, optionale SSE-Streams.
- **Routing**: `/login`, `/` (Home), `/leaderboard`, `/lobby/:name/round[/ :number]/lose`, `/lobby/:name/win` plus Legacy-Redirects (`/game`, `/lose`, `/win`).
- **Mock-Backend**: Express + `nanoid`; hält Lobbys/Spieler/Runden im RAM, bietet Join/Rejoin, Lives, Scores, Leaderboard, Quotes, SSE-Events (`/events`). Neustart setzt Daten zurück.

## Manuelle Checks
- `npm run build` (oder `npm run lint`) sollte ohne TypeScript-Fehler durchlaufen.
- Login → Lobby → Spiel → Lose/Win → Leaderboard durchklicken; Rejoin von `/leaderboard` oder gespeicherter Session testen.
- Kommentare stichprobenartig prüfen: Kopfkommentare pro Datei, deutschsprachige Abschnittskommentare, keine veralteten TODOs im Code.
- Offene TODOs stehen unter `docs/TODOs.md`.

## Weiterführende Doku
- Spiellogik & Flows: `docs/game-logic.md`
- Mock-Server-Details: `backend-mock/README.md`
- Offene Aufgaben: `docs/TODOs.md`
