/**
 * Zitatbox auf der Lobby-Seite.
 * Laedt Sprueche ueber das API, rotiert sie automatisch und erlaubt das Einreichen neuer Texte im Teletext-Stil.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import TTActionButton from "../common/ui/TTActionButton";
import { api } from "../../api";

/** Teletext-Quote-Box: laedt Sprueche, rotiert sie alle 10 s und erlaubt neue Beitraege. */
type Quote = { id: string; text: string; createdAt: string };

const ROTATE_MS = 10000;
const MAX_LEN = 220;

export default function LobbyQuoteBox() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [progressPct, setProgressPct] = useState(0);

  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  // Timer-Ref fuer die Quote-Rotation
  const rotateIntervalRef = useRef<number | null>(null);
  const progressIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = await api.listQuotes();
        if (!alive) return;
        setQuotes(list);
        setIdx(0);
      } catch (e: any) {
        setErr(e?.message || "Fehler beim Laden.");
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
      stopRotate();
      stopProgress();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rotation steuern
  useEffect(() => {
    if (editing || loading || !quotes.length) {
      stopRotate();
      stopProgress();
      return;
    }
    startRotate();
    return () => {
      stopRotate();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, loading, quotes.length]);

  // Fortschrittsbalken an Quote-Rotation koppeln
  useEffect(() => {
    if (editing || loading || !quotes.length) {
      stopProgress();
      setProgressPct(0);
      return;
    }
    startProgress();
    return () => stopProgress();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, editing, loading, quotes.length]);

  /** Startet den Fortschritts-/Rotations-Timer fuer Quotes. */
  function startRotate() {
    stopRotate();
    rotateIntervalRef.current = window.setInterval(() => {
      setIdx((prev) => (quotes.length ? (prev + 1) % quotes.length : 0));
    }, ROTATE_MS) as unknown as number;
  }
  /** Stoppt den Timer und raeumt Intervals auf (z. B. wenn Liste oder Edit-Mode wechselt). */
  function stopRotate() {
    if (rotateIntervalRef.current) {
      clearInterval(rotateIntervalRef.current);
      rotateIntervalRef.current = null;
    }
  }

  function startProgress() {
    stopProgress();
    setProgressPct(0);
    const startedAt = Date.now();
    progressIntervalRef.current = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const next = Math.min(100, (elapsed / ROTATE_MS) * 100);
      setProgressPct(next);
    }, 140) as unknown as number;
  }

  function stopProgress() {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  }

  /**
   * Validiert und sendet einen neuen Spruch.
   * Fuegt das Ergebnis sofort vorne ein, damit der Teletext-Bereich den neuesten Text zeigt.
   */
  async function submitQuote() {
    const t = sanitize(text);
    if (t.length < 5) {
      setErr("Der Spruch ist zu kurz.");
      return;
    }
    if (t.length > MAX_LEN) {
      setErr(`Maximal ${MAX_LEN} Zeichen.`);
      return;
    }

    setBusy(true);
    setErr(null);
    try {
      const q = await api.createQuote(t);
      setQuotes((qs) => [q, ...qs]); // vorne anfuegen
      setIdx(0); // sofort anzeigen
      setEditing(false);
      setText("");
    } catch (e: any) {
      setErr(e?.message || "Konnte Spruch nicht speichern.");
    } finally {
      setBusy(false);
    }
  }

  const current = useMemo(() => quotes[idx]?.text ?? "", [quotes, idx]);
  const currentQuoteId = quotes[idx]?.id ?? idx;

  return (
    <div className="bg-[var(--tt-yellow)] text-[var(--tt-blue)] border-4 border-black shadow-[0_0_0_2px_#111_inset] p-4 sm:p-6 tt-text text-sm sm:text-base leading-relaxed">
      {!editing ? (
        <>
          <p className="whitespace-pre-wrap tt-justify">
            {loading ? "Lade Sprueche ..." : current || "Noch keine Sprueche vorhanden. Schreib den ersten!"}
          </p>

          <div className="mt-4 flex items-center justify-between">
            <span className="text-black font-bold">{">> Press RED to start"}</span>
            <span className="text-black font-bold">161</span>
          </div>

          <div className="mt-3">
            <TTActionButton variant="red" onClick={() => setEditing(true)} className="w-full sm:w-auto">
              Schreib rein
            </TTActionButton>
          </div>

          {/* Ladebalken im Teletext-Stil */}
          {quotes.length > 0 && !loading && (
            <div className="mt-4">
              <div className="tt-progress-track" key={currentQuoteId}>
                <div
                  className="tt-progress-bar"
                  style={{
                    ["--tt-progress-duration" as string]: `${ROTATE_MS}ms`,
                    ["--tt-progress-value" as string]: `${progressPct / 100}`,
                  }}
                />
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <label className="sr-only" htmlFor="quote">
            Neuer Spruch
          </label>
          <textarea
            id="quote"
            rows={4}
            value={text}
            maxLength={MAX_LEN}
            onChange={(e) => setText(e.target.value)}
            className="w-full bg-[var(--tt-yellow)] text-[var(--tt-blue)] resize-none outline-none border-4 border-black p-3 tt-text"
            placeholder="Reife Frauen in deiner Gegend..."
          />
          <div className="mt-2 flex items-center justify-between text-sm">
            <span className="text-black">
              {text.length}/{MAX_LEN}
            </span>
            {err && <span className="text-red-700 font-bold">{err}</span>}
          </div>
          <div className="mt-3 flex flex-wrap gap-3">
            <TTActionButton variant="red" onClick={submitQuote} busy={busy} className="w-full sm:w-auto">
              Abschicken
            </TTActionButton>
            <TTActionButton
              variant="cyan"
              onClick={() => {
                setEditing(false);
                setErr(null);
              }}
              className="w-full sm:w-auto"
            >
              Abbrechen
            </TTActionButton>
          </div>
        </>
      )}
    </div>
  );
}

function sanitize(s: string) {
  return s.replace(/\s+/g, " ").trim();
}
