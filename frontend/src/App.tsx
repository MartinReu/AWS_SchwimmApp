/**
 * Haupt-Router der Schwimm-Frontend-App.
 * Koppelt das Vite-Frontend mit allen Page-Komponenten und kapselt Legacy-Weiterleitungen,
 * damit alte Deep-Links (z. B. /game, /lose) weiterhin in die modernen Lobby-/Round-Routen führen.
 */
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useEffect } from "react";
import HomePage from "./pages/HomePage";
import GamePage from "./pages/GamePage";
import LeaderboardPage from "./pages/LeaderboardPage";
import LosePage from "./pages/LosePage";
import WinPage from "./pages/WinPage";
import { loadSession } from "./utils/session";
import { losePath, roundPath, winPath, withSearch } from "./utils/paths";

/**
 * Router-Einstiegspunkt der App.
 * Bindet alle sichtbaren Seiten ein und definiert Redirect-Komponenten für alte URLs,
 * damit `BrowserRouter` zentrale Kontrolle behält und Fallbacks (`Navigate to "/"`) funktionieren.
 */
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/leaderboard" element={<LeaderboardPage />} />
        <Route path="/lobby/:lobbyName">
          <Route index element={<LobbyIndexRedirect />} />
          <Route path="round">
            <Route index element={<GamePage />} />
            <Route path="lose" element={<LosePage />} />
            <Route path=":roundNumber">
              <Route index element={<GamePage />} />
              <Route path="lose" element={<LosePage />} />
            </Route>
          </Route>
          <Route path="win" element={<WinPage />} />
        </Route>
        <Route path="/game" element={<LegacyGameRedirect />} />
        <Route path="/lose" element={<LegacyLoseRedirect />} />
        <Route path="/win" element={<LegacyWinRedirect />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

/**
 * Erzwingt /round als Default-Child innerhalb einer Lobby-Routen-Hierarchie.
 * Nutzt `useLocation`, um bestehende Query-Strings unverändert an `Navigate` zu übergeben.
 */
function LobbyIndexRedirect() {
  const location = useLocation();
  return <Navigate to={`round${location.search}`} replace />;
}

/**
 * Kapselt den Legacy-/game-Einstieg.
 * Liest Query-Parameter und Session-Daten, priorisiert Query-Werte vor gespeicherten Session-Werten
 * und navigiert dann deterministisch zur aktuellen Runde (`roundPath`), um Deep-Links stabil zu halten.
 *
 * Beispiel: /game?lobbyName=Alpha&roundNumber=2 -> /lobby/Alpha/round/2
 */
function LegacyGameRedirect() {
  const navigate = useNavigate();
  const [sp] = useSearchParams();

  useEffect(() => {
    const session = loadSession();
    // Fallback-Priorität: Query-Parameter -> gespeicherte Session -> generische Defaults
    const lobbyName = sp.get("lobbyName") || session?.lobbyName || "Lobby";
    const lobbyId = sp.get("lobbyId") || session?.lobbyId || "";
    const roundNumberParam = Number(sp.get("roundNumber") || "");
    const roundNumber = Number.isFinite(roundNumberParam) ? roundNumberParam : undefined;

    navigate(roundPath({ lobbyName, lobbyId, roundNumber }), { replace: true });
  }, [navigate, sp]);

  return <RedirectNote label="Leite zum Spiel weiter …" />;
}

/**
 * Übersetzt die alte /lose-Route in den neuen Lose-Screen innerhalb /lobby/:name/round.
 * Ergänzt Query-Strings (playerId, playerName), damit Warteseiten weiterhin personalisierte Hinweise anzeigen.
 */
function LegacyLoseRedirect() {
  const navigate = useNavigate();
  const [sp] = useSearchParams();

  useEffect(() => {
    const session = loadSession();
    // RoundNumber nur übernehmen, wenn der Parameter numerisch ist – sonst wird Lose ohne Rundenzahl gezeigt
    const lobbyName = sp.get("lobbyName") || session?.lobbyName || "Lobby";
    const lobbyId = sp.get("lobbyId") || session?.lobbyId || "";
    const roundNumberParam = Number(sp.get("roundNumber") || "");
    const roundNumber = Number.isFinite(roundNumberParam) ? roundNumberParam : undefined;
    const path = losePath({ lobbyName, lobbyId, roundNumber });
    navigate(
      withSearch(path, {
        playerId: sp.get("playerId") || session?.playerId,
        playerName: sp.get("playerName") || session?.playerName,
      }),
      { replace: true }
    );
  }, [navigate, sp]);

  return <RedirectNote label="Leite zur Warteseite weiter …" />;
}

/**
 * Leitet /win auf den neuen Win-Screen weiter.
 * Nutzt dabei dieselbe Lobby-Auflösung wie die anderen Redirects, sodass Bookmarks weiterhin funktionieren.
 */
function LegacyWinRedirect() {
  const navigate = useNavigate();
  const [sp] = useSearchParams();

  useEffect(() => {
    const session = loadSession();
    const lobbyName = sp.get("lobbyName") || session?.lobbyName || "Lobby";
    const lobbyId = sp.get("lobbyId") || session?.lobbyId || "";
    navigate(winPath({ lobbyName, lobbyId }), { replace: true });
  }, [navigate, sp]);

  return <RedirectNote label="Leite zum Gewinner-Screen weiter …" />;
}

/**
 * Zeigt während eines Redirects eine Teletext-Style-Statusmeldung im Vollbild.
 * Props:
 * - label: kurzer deutscher Text, der dem User erklärt, wohin gerade navigiert wird.
 * Gibt standardmäßig `<main>` zurück, sodass der Bildschirm nicht leer bleibt.
 */
function RedirectNote({ label }: { label: string }) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-black text-white tt-text">
      {label}
    </main>
  );
}
