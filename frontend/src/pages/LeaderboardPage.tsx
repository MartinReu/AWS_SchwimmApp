/**
 * Leaderboard-Seite: zeigt aggregierte Lobby-Scores, bietet Suche, Rejoin-Links und Admin-Löschfunktionen.
 * Nutzt Polling/SSE, um Einträge aktuell zu halten, und verknüpft zum Resume-Callout.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link, useNavigate } from "react-router-dom";
import TeletextHeader from "../components/common/TeletextHeader";
import {
  fetchLeaderboards,
  subscribeLeaderboards,
  type LeaderboardEntry,
} from "../api/leaderboards";
import { deleteLobby } from "../api/lobbies";
import { api } from "../api";
import RootLayout from "../components/common/layout/RootLayout";
import TTToolbar from "../components/common/ui/TTToolbar";
import TTInput from "../components/common/ui/TTInput";
import TTButton from "../components/common/ui/TTButton";
import TTPanel from "../components/common/ui/TTPanel";
import ResumeGameCallout from "../components/common/ResumeGameCallout";
import { loadSession } from "../utils/session";
import { formatPoints } from "../utils/points";
import { useLobbyDeletionGuard } from "../hooks/useLobbyDeletionGuard";

const DEBOUNCE_MS = 300;
const SUBSCRIBE_POLL_MS = 4000;

/** Rangliste mit Echtzeit-Updates, Suche und Hard-Delete-Verknüpfung. */
export default function LeaderboardPage() {
  // Suchinput für die Lobby-Filtersuche.
  const [search, setSearch] = useState("");
  // Aktuelle Leaderboard-Einträge aus API/SSE.
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  // UI-Ladeanzeige für die Tabelle.
  const [loading, setLoading] = useState(true);
  // Fehlernachricht aus API-Calls.
  const [error, setError] = useState<string | null>(null);
  // Token zum Erzwingen eines Reloads (Retry).
  const [refreshKey, setRefreshKey] = useState(0);
  // Persistierte Sessiondaten (Resume-Link etc.).
  const session = useMemo(() => loadSession(), []);
  // Flags, ob die Session noch aktiv ist (Rejoin-CTA).
  const [resumeConfirmed, setResumeConfirmed] = useState(false);
  useLobbyDeletionGuard({
    lobbyId: session?.lobbyId,
    lobbyName: session?.lobbyName,
    disabled: !session?.lobbyId,
  });

  // Entschärfter Suchterm, damit nicht jeder Tastendruck API-Traffic erzeugt.
  const debouncedSearch = useDebounce(search, DEBOUNCE_MS);

  // Filtert sichtbare Lobbys anhand des aktuellen Suchbegriffs.
  const visibleEntries = useMemo(() => {
    if (!search.trim()) return entries;
    const needle = search.trim().toLowerCase();
    return entries.filter((entry) => entry.lobbyName.toLowerCase().includes(needle));
  }, [entries, search]);

  const hasNoResults = !loading && !error && visibleEntries.length === 0;
  const sessionLobbyExists = useMemo(
    () => (session?.lobbyId ? entries.some((entry) => entry.lobbyId === session.lobbyId) : false),
    [entries, session?.lobbyId]
  );

  useEffect(() => {
    // Lädt initial und bei Suchänderung die Leaderboard-Daten.
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetchLeaderboards({ search: debouncedSearch || undefined, signal: controller.signal })
      .then((data) => setEntries(data))
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err?.message || "Fehler beim Laden der Rangliste");
        setEntries([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [debouncedSearch, refreshKey]);

  useEffect(() => {
    // Prüft, ob die gespeicherte Session weiterhin aktiv ist → Resume-Hinweis.
    setResumeConfirmed(false);
    if (!session?.resumeEligible || !session.lobbyId || !session.playerId) return;
    let alive = true;
    (async () => {
      try {
        const players = await api.listPlayers(session.lobbyId);
        if (!alive) return;
        const normalizedName = normalize(session.playerName);
        const match = players.some(
          (player) => player.id === session.playerId || normalize(player.name) === normalizedName
        );
        setResumeConfirmed(match);
      } catch {
        if (alive) setResumeConfirmed(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [session?.lobbyId, session?.playerId, session?.playerName, session?.resumeEligible]);

  const triggerRefresh = useCallback(() => setRefreshKey((key) => key + 1), []);
  const handleLobbyDeleted = useCallback(
    (lobbyId: string) => {
      setEntries((prev) => prev.filter((item) => item.lobbyId !== lobbyId));
      triggerRefresh();
    },
    [triggerRefresh]
  );

  useEffect(() => {
    // Abonniert Live-Updates via SSE/Polling und pflegt das Leaderboard lokal ein.
    return subscribeLeaderboards(
      {
        onAdded: (entry) => setEntries((prev) => upsertEntry(prev, entry)),
        onUpdated: (entry) => setEntries((prev) => upsertEntry(prev, entry)),
        onRemoved: (lobbyId) => setEntries((prev) => prev.filter((item) => item.lobbyId !== lobbyId)),
      },
      { pollIntervalMs: SUBSCRIBE_POLL_MS }
    );
  }, []);

  const handleRetry = triggerRefresh;
  const handleClear = () => setSearch("");

  return (
    <RootLayout
      header={<TeletextHeader mode="SCORES" />}
      footer={<span className="tt-text text-xs">Lobbyismus · Alter wir haben schon {visibleEntries.length} Lobbys</span>}
    >
      <div className="tt-stack pb-10 w-full max-w-4xl mx-auto">
        <TTToolbar
          title="Rangliste"
          description="Lobby · Suche"
          className="w-full"
        >
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-end sm:gap-4" role="search">
            <TTInput
              id="leaderboard-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Lobby suchen …"
              aria-label="Lobby suchen"
              autoComplete="off"
              wrapperClassName="flex-1 min-w-[260px] sm:min-w-[320px]"
            />
          </div>
        </TTToolbar>

        <ResumeGameCallout
          session={session}
          isConfirmed={resumeConfirmed}
          lobbyExists={sessionLobbyExists}
          className="w-full"
        />

        <div className="w-full space-y-3" aria-live="polite">
          {loading && (
            <p className="tt-text text-sm text-[var(--tt-text-muted)]" role="status" aria-busy="true">
              Lade Rangliste im Teletext-Takt …
            </p>
          )}

          {error && (
            <TTPanel variant="danger" role="alert">
              <div className="flex flex-wrap items-center gap-3 text-sm text-white">
                <span>Hoppla, Fehler: {error}</span>
                <TTButton type="button" variant="danger" onClick={handleRetry}>
                  Noch mal laden
                </TTButton>
              </div>
            </TTPanel>
          )}

          {hasNoResults && (
            <p className="tt-text text-sm font-black text-[var(--tt-secondary)]" aria-live="polite">
              Junge die Lobby gibts nich!
            </p>
          )}
        </div>

        {/* Rendert jede sichtbare Lobby als Panel inkl. Aktionen. */}
        <div
          className="w-full space-y-4 sm:overflow-y-auto sm:max-h-[var(--leaderboard-max)]"
          role="list"
          aria-busy={loading}
          style={{ "--leaderboard-max": "calc(100dvh - 14rem)" } as CSSProperties}
        >
          {visibleEntries.map((entry) => (
            <LobbyCard key={entry.lobbyId} lobby={entry} onDeleted={handleLobbyDeleted} />
          ))}
        </div>

        <div className="pt-2">
          <TTButton
            as={Link}
            to="/"
            variant="secondary"
            className="h-12 w-full justify-center"
          >
            Home
          </TTButton>
        </div>
      </div>
    </RootLayout>
  );
}

function normalize(value: string | undefined | null) {
  return (value || "").trim().toLowerCase();
}

type LobbyCardProps = {
  lobby: LeaderboardEntry;
  onDeleted: (lobbyId: string) => void;
};

/** Einzelne Lobby-Kachel inkl. Rejoin-CTA und Löschdialog. */
function LobbyCard({ lobby, onDeleted }: LobbyCardProps) {
  const navigate = useNavigate();
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteErrorCode, setDeleteErrorCode] = useState<string | null>(null);
  const [optimisticHidden, setOptimisticHidden] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, []);

  // Verhindert State-Updates nach dem Unmount, wenn ein asynchroner Löschvorgang noch läuft.
  const safeUpdate = useCallback((fn: () => void) => {
    if (isMountedRef.current) fn();
  }, []);

  /** Öffnet die Startseite im Rejoin-Modus, inklusive Lobby-ID, damit der Spieler gezielt zurückspringen kann. */
  const handleNavigateHome = () => {
    const params = new URLSearchParams();
    params.set("mode", "rejoin");
    params.set("lobby", lobby.lobbyName);
    if (lobby.lobbyId) params.set("lobbyId", lobby.lobbyId);
    navigate(`/?${params.toString()}`, {
      state: {
        rejoinLobbyName: lobby.lobbyName,
        rejoinLobbyId: lobby.lobbyId,
        rejoinSource: "leaderboard",
      },
    });
  };

  /**
   * Löscht die Lobby hart über das Admin-API.
   * Arbeitet optimistisch (Panel wird ausgeblendet) und stellt UI-Zustände nach Fehlern wieder her.
   */
  const performDelete = useCallback(async () => {
    if (isDeleting) return;

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    safeUpdate(() => {
      setIsDeleting(true);
      setDeleteError(null);
      setDeleteErrorCode(null);
      setOptimisticHidden(true);
      setShowConfirm(false);
    });

    try {
      const result = await deleteLobby({
        lobbyId: lobby.lobbyId,
        lobbyName: lobby.lobbyName,
        signal: controller.signal,
      });
      if (result.ok) {
        onDeleted(lobby.lobbyId);
        return;
      }
      safeUpdate(() => {
        setOptimisticHidden(false);
        setDeleteError(result.message || "Lobby konnte nicht gelöscht werden.");
        setDeleteErrorCode(result.code ?? null);
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      const message =
        error instanceof Error && error.message ? error.message : "Lobby konnte nicht gelöscht werden.";
      safeUpdate(() => {
        setOptimisticHidden(false);
        setDeleteError(message);
        setDeleteErrorCode(null);
      });
    } finally {
      abortControllerRef.current = null;
      safeUpdate(() => setIsDeleting(false));
    }
  }, [isDeleting, lobby.lobbyId, lobby.lobbyName, onDeleted, safeUpdate]);

  const handleDelete = () => {
    setDeleteError(null);
    setDeleteErrorCode(null);
    setShowConfirm(true);
  };
  const handleConfirmDelete = () => performDelete();
  const handleRetryDelete = () => performDelete();
  const handleCancelConfirm = () => setShowConfirm(false);
  const handleDismissError = () => {
    setDeleteError(null);
    setDeleteErrorCode(null);
  };

  const playersSorted = useMemo(() => {
    // Normalisiert Punktzahlen und sortiert Spieler:innen absteigend.
    return [...(lobby.players ?? [])]
      .map((player) => {
        const total = Number(player.pointsTotal ?? 0);
        return {
          ...player,
          name: player.name.toUpperCase(),
          pointsTotal: Number.isFinite(total) ? total : 0,
        };
      })
      .sort((a, b) => {
        const delta = b.pointsTotal - a.pointsTotal;
        if (delta !== 0) return delta;
        return a.name.localeCompare(b.name);
      });
  }, [lobby.players]);

  const hasPlayers = playersSorted.length > 0;

  if (optimisticHidden) {
    return (
      <TTPanel
        variant="cyan"
        className="w-full animate-pulse focus-within:ring-2 focus-within:ring-[var(--tt-secondary)]"
        role="status"
        aria-live="assertive"
        title={lobby.lobbyName}
        eyebrow="Löschen läuft …"
      >
        <p className="tt-text text-sm uppercase tracking-[0.2em] text-[var(--tt-text-muted)]">
          Lobby wird endgültig gelöscht …
        </p>
      </TTPanel>
    );
  }
  return (
    <TTPanel
      variant="cyan"
      title={lobby.lobbyName}
      eyebrow={`Erstellt am ${new Date(lobby.createdAt).toLocaleDateString()}`}
      className="w-full focus-within:ring-2 focus-within:ring-[var(--tt-secondary)]"
    >
      <div className="mb-3 w-full">
        <div className="grid w-full grid-cols-2 gap-2">
          <TTButton
            type="button"
            variant="secondary"
            onClick={handleNavigateHome}
            aria-label={`Lobby ${lobby.lobbyName} öffnen`}
            className="w-full justify-center"
          >
            Rejoin
          </TTButton>
          <TTButton
            type="button"
            variant="danger"
            onClick={handleDelete}
            disabled={isDeleting}
            busy={isDeleting}
            aria-label={`Lobby ${lobby.lobbyName} löschen`}
            className="w-full justify-center"
          >
            Löschen
          </TTButton>
        </div>
      </div>
      {showConfirm && (
        <div
          className="mb-3 border border-[var(--tt-yellow)] bg-black/80 p-3 text-sm text-[var(--tt-yellow)]"
          role="alertdialog"
          aria-live="assertive"
          aria-label="Löschbestätigung"
        >
          <p className="font-black uppercase tracking-[0.2em]">Lobby löschen?</p>
          <p className="mt-1 text-white">
            Was weg ist, ist weg ge?
          </p>
          <div className="mt-3 grid w-full grid-cols-2 gap-2">
            <TTButton
              type="button"
              variant="danger"
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              busy={isDeleting}
              className="w-full justify-center"
            >
              LÖSCHEN
            </TTButton>
            <TTButton
              type="button"
              variant="ghost"
              onClick={handleCancelConfirm}
              disabled={isDeleting}
              className="w-full justify-center"
            >
              Abbrechen
            </TTButton>
          </div>
        </div>
      )}
      <div className="mb-3 flex flex-wrap items-center gap-4 border-y border-white/10 py-2 text-sm uppercase tracking-[0.2em] text-[var(--tt-text-muted)]">
        <span>
          Durchgänge: <span className="text-white">{typeof lobby.rounds === "number" ? lobby.rounds : "–"}</span>
        </span>
        <span>
          Spieler:innen: <span className="text-white">{playersSorted.length}</span>
        </span>
      </div>

      <div className="grid gap-1" role="group" aria-label="Spielerliste">
        {hasPlayers ? (
          playersSorted.map((player, index) => (
            <div
              key={player.id || `${player.name}-${index}`}
              className="flex items-center justify-between border-b border-white/10 py-1 text-[var(--tt-danger)]"
            >
              <span className="truncate pr-2">{player.name}</span>
              <span className="font-black text-white">
                {typeof player.pointsTotal === "number" ? formatPoints(player.pointsTotal) : "–"}
              </span>
            </div>
          ))
        ) : (
          <p className="py-2 text-sm text-[var(--tt-text-muted)]">Noch keine Spieler:innen.</p>
        )}
      </div>
      {deleteError && (
        <div
          className="mt-4 border border-[var(--tt-danger)] bg-black/80 p-3 text-sm text-[var(--tt-danger)]"
          role="alert"
          aria-live="assertive"
        >
          <p className="font-black uppercase tracking-[0.2em]">Löschen fehlgeschlagen</p>
          <p className="mt-1 normal-case">{deleteError}</p>
          {deleteErrorCode && (
            <p className="mt-1 text-xs uppercase tracking-[0.3em] text-white/70">Code: {deleteErrorCode}</p>
          )}
          {deleteErrorCode === "lobby-active" && (
            <p className="mt-1 text-xs text-white/80">
              Bitte beende laufende Runden oder entferne aktive Referenzen und versuche es erneut.
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <TTButton
              type="button"
              variant="danger"
              onClick={handleRetryDelete}
              disabled={isDeleting}
              busy={isDeleting}
            >
              Erneut versuchen
            </TTButton>
            <TTButton type="button" variant="ghost" onClick={handleDismissError} disabled={isDeleting}>
              Ausblenden
            </TTButton>
          </div>
        </div>
      )}
    </TTPanel>
  );
}

/** Simpler Debounce-Hook, damit die Suche nicht bei jedem Tastendruck feuert. */
function useDebounce<T>(value: T, ms: number) {
  const [state, setState] = useState(value);
  useEffect(() => {
    const handle = setTimeout(() => setState(value), ms);
    return () => clearTimeout(handle);
  }, [value, ms]);
  return state;
}

/** Fügt neue Einträge sortiert ein bzw. ersetzt bestehende Lobbys. */
function upsertEntry(list: LeaderboardEntry[], entry: LeaderboardEntry) {
  const index = list.findIndex((item) => item.lobbyId === entry.lobbyId);
  if (index === -1) {
    return [entry, ...list].sort((a, b) => {
      const aDate = new Date(a.createdAt).getTime();
      const bDate = new Date(b.createdAt).getTime();
      return bDate - aDate;
    });
  }
  const clone = list.slice();
  clone[index] = entry;
  return clone.sort((a, b) => {
    const aDate = new Date(a.createdAt).getTime();
    const bDate = new Date(b.createdAt).getTime();
    return bDate - aDate;
  });
}

