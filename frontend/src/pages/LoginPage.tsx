/**
 * LoginPage: Einstieg in die App über einen Spielernamen.
 * Bietet Dropdown mit bestehenden Namen und ermöglicht neue Eingaben, bevor es Richtung HomePage weitergeht.
 */
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import clsx from "clsx";
import RootLayout from "../components/common/layout/RootLayout";
import TeletextHeader from "../components/common/TeletextHeader";
import LoadingOverlay from "../components/common/LoadingOverlay";
import TTPanel from "../components/common/ui/TTPanel";
import TTButton from "../components/common/ui/TTButton";
import TTToolbar from "../components/common/ui/TTToolbar";
import LobbyDropdown from "../components/lobby/LobbyDropdown";
import { api } from "../api";
import { usePlayerSession } from "../context/PlayerSessionContext";
import { useTransitionOverlay } from "../context/TransitionOverlayContext";
import { isInitialLoginRequired, markInitialLoginComplete } from "../utils/session";

const MAX_PLAYER_NAME = 18;
const UNSAFE_NAME_PATTERN = /[<>]/;
const LOGIN_OVERLAY_DURATION_MS = 3000;
// Teletext-/ASCII-Blöcke für das Login-Content-Layout; reine Stimmungstexte ohne Logikbezug.
const SESSION_TEXT = [
  "Ja (Icke),",
  "",
  "Sie trägt ein Deutschland-Klebetattoo auf der Fotze",
  "Ick sitz' in mein' Trainingsanzug vor der Glotze, ja",
  "Gleich is Anpfiff, sie fragt mich, ob sie Schwanz kricht",
  "Nein, aber sie darf mein'n Pimmel blasen unterm Stammtisch",
  "Heh, ick bin ratzevoll, ick bin nich janz dicht",
  "Ick lebe für dit Atzenvolk und jetz wird jekickt",
  "Deutschlandflagge, zwei Stück im Jesicht",
  "Erste Strophe sing' ick mit, dit war keene Absicht",
].join("\n");
const PYRO_PIXELS = ["A   A   A   A", "|\\  |\\  |\\  |\\", "| > | > | > | >", "|/  |/  |/  |/", "V   V   V   V", "PYRO * IS KEEN * VERBRECHEN"].join("\n");
const FLAG_PIXELS = [
  "##############################",
  "##############################",
  "------------------------------",
  "------------------------------",
  "==============================",
  "==============================",
].join("\n");
const SNACK_PIXELS = ["[CHIPS][FUNNY][FRISCH]", "|TISCH||FLIESSEN||TISCH|", "==##==##==##==##==", "SNACK MODE AKTIV"].join("\n");
const MATCH_PIXELS = [
  "90:00   |   RUND > ECKE",
  "OELF MANN  AUF  DEM  PLATZ",
  "[ >>>> KEVIN KURANY <<<<]",
  "SCHACH . RASEN . SCHACH",
].join("\n");

/** Holt Login-Daten, zeigt Autocomplete und setzt nach Bestätigung den globalen Spielernamen. */
export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { confirmPlayerName, isLoggedIn } = usePlayerSession();
  const { triggerBubbleTransition } = useTransitionOverlay();

  const redirectTarget = useMemo(() => resolveRedirectTarget(location.state), [location.state]);
  const [playerName, setPlayerName] = useState("");
  const [errPlayer, setErrPlayer] = useState<string | null>(null);
  const [names, setNames] = useState<string[]>([]);
  const [loadingNames, setLoadingNames] = useState(true);
  const [namesError, setNamesError] = useState<string | null>(null);
  const [namesFetchKey, setNamesFetchKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [showOverlay, setShowOverlay] = useState(true);
  const playerInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isLoggedIn) return;
    if (isInitialLoginRequired()) return;
    // Überspringt die Login-Seite komplett, sobald eine gültige Session existiert (Erstbesuch bereits erledigt).
    navigate(redirectTarget, { replace: true });
  }, [isLoggedIn, navigate, redirectTarget]);

  useEffect(() => {
    setLoadingNames(true);
    setNamesError(null);
    let alive = true;
    api
      .fetchAllPlayerNames()
      .then((list) => {
        if (!alive) return;
        setNames(list);
      })
      .catch((error) => {
        if (!alive) return;
        setNamesError(error?.message || "Spielerliste konnte nicht geladen werden.");
        setNames([]);
      })
      .finally(() => {
        if (alive) setLoadingNames(false);
      });
    return () => {
      alive = false;
    };
  }, [namesFetchKey]);

  useEffect(() => {
    const trimmed = playerName.trim();
    if (!trimmed) {
      setErrPlayer(null);
      return;
    }
    if (UNSAFE_NAME_PATTERN.test(trimmed)) {
      setErrPlayer("Keine < oder > - Teletext hat Angst vor Skript-Kiddies.");
    } else if (trimmed.length < 2) {
      setErrPlayer("Mindestens 2 Zeichen, sonst verknotet das Modem.");
    } else if (trimmed.length > MAX_PLAYER_NAME) {
      setErrPlayer(`Max. ${MAX_PLAYER_NAME} Zeichen – kurz und bündig.`);
    } else {
      setErrPlayer(null);
    }
  }, [playerName]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
    const timer = window.setTimeout(() => {
      setShowOverlay(false);
      window.scrollTo({ top: 0, behavior: "auto" });
    }, LOGIN_OVERLAY_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, []);

  /** Reicht den Namen ein, persistiert ihn global und navigiert zur HomePage. */
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = playerName.trim();
    if (!trimmed) {
      setErrPlayer("Wie heißt du denn? Schreib kurz was rein.");
      return;
    }
    if (UNSAFE_NAME_PATTERN.test(trimmed)) {
      setErrPlayer("Keine spitzen Klammern oder HTML-Fetzen bitte.");
      return;
    }
    if (errPlayer) return;

    setSubmitting(true);
    try {
      const upper = trimmed.toUpperCase();
      setPlayerName(upper);
      confirmPlayerName(upper);
      markInitialLoginComplete();
      triggerBubbleTransition();
      navigate(redirectTarget, { replace: true });
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = !submitting && !errPlayer && playerName.trim().length >= 2;
  const playerOptions = useMemo(() => names, [names]);

  return (
    <>
      <RootLayout
        header={<TeletextHeader mode="LOGIN" />}
        footer={<span className="tt-text text-xs">Login zuerst, dann ab ins Becken.</span>}
      >
        <div className={clsx("tt-stack pb-10 tt-login-scroll", showOverlay && "tt-login-scroll--intro")}>
          <TTToolbar
            title="Wer bist du?"
            description={<span className="text-white">samma mäuschen, du bist ja rischtisch groß jeworden.</span>}
          />

          <div className="tt-panel-stack xl:grid xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] xl:items-start">
            <div className="tt-panel-stack">
              <TTPanel title="Gib Name Nutte" eyebrow=">> Login 000" variant="magenta">
                <form onSubmit={onSubmit} className="space-y-4" autoComplete="off">
                  <LobbyDropdown
                    value={playerName}
                    onChange={(v) => setPlayerName(v.toUpperCase())}
                    options={playerOptions}
                    maxLen={MAX_PLAYER_NAME}
                    error={errPlayer}
                    placeholder="Boris Becken"
                    inputRef={playerInputRef}
                    openOnFocus
                  />

                  <div className="space-y-2 text-sm text-[var(--tt-text-muted)]" aria-live="polite" aria-busy={loadingNames}>
                    {loadingNames && (
                      <p className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full border-2 border-current border-t-transparent motion-safe:animate-spin" />
                        Ziehe bekannte Namen aus dem Archiv …
                      </p>
                    )}
                    {!!names.length && !loadingNames && (
                      <p className="uppercase tracking-[0.2em]">
                        {String(names.length).padStart(2, "0")} alte Hasen im Dropdown – such dir einen aus oder tipp was Neues. Einzigartig wie du, Bitch!
                      </p>
                    )}
                    {namesError && (
                      <div className="tt-card border-[var(--tt-danger)] bg-red-950/50 text-sm text-white" role="alert">
                        <div className="flex flex-wrap items-center gap-3">
                          <span>Spielerarchiv nicht erreichbar – versuch's gleich nochmal.</span>
                          <TTButton type="button" variant="danger" size="md" onClick={() => setNamesFetchKey((key) => key + 1)}>
                            Reload
                          </TTButton>
                        </div>
                      </div>
                    )}
                  </div>

                  <TTButton
                    type="submit"
                    variant="secondary"
                    className={clsx(
                      "tt-login-continue w-full justify-center",
                      !canSubmit && "line-through decoration-2 decoration-[var(--tt-danger)]"
                    )}
                    disabled={!canSubmit}
                    busy={submitting}
                  >
                    Weiter
                  </TTButton>
                </form>
              </TTPanel>

              <TTPanel title="Geistreich" eyebrow=">> Session 1312" variant="cyan">
                <div className="space-y-4">
                  <div className="tt-text text-xs font-mono uppercase tracking-[0.3em] text-[var(--tt-green)]">#[MACH-LACK]</div>
                  <p className="tt-text whitespace-normal text-sm leading-relaxed text-white tt-justify">{SESSION_TEXT}</p>
                </div>
              </TTPanel>
            </div>

            <div className="tt-panel-stack">
              <TTPanel title="Pyro Raster" eyebrow=">> Rubrik 191" variant="danger" className="lg:min-h-[220px]">
                <div className="space-y-3">
                  <pre className="tt-text whitespace-pre font-mono text-xs uppercase leading-4 text-[var(--tt-yellow)]">{PYRO_PIXELS}</pre>
                  <p className="tt-text text-sm text-white tt-justify">
                    Wir fackeln allet ab – der Pyrotechnik-Trick meldet Dauerfeuer direkt aus dem Stammtischkeller.
                  </p>
                </div>
              </TTPanel>

              <div className="tt-panel-stack sm:grid sm:grid-cols-2 sm:items-start">
                <TTPanel
                  title="Schland Pixel"
                  eyebrow=">> Rubrik 101"
                  variant="magenta"
                  className="h-full"
                  style={{ borderColor: "#8a2be2" }}
                >
                  <div className="space-y-2">
                    <pre className="tt-text whitespace-pre font-mono text-xs uppercase leading-4 text-[var(--tt-yellow)]">{FLAG_PIXELS}</pre>
                    <p className="tt-text text-sm text-white tt-justify">
                      #Schwarz, -Rot, =Jold <br />
                      Glas is voll.
                    </p>
                  </div>
                </TTPanel>

                <TTPanel title="Snack-O-Mat" eyebrow=">> Rubrik 333" variant="cyan" className="h-full">
                  <div className="space-y-2">
                    <pre className="tt-text whitespace-pre font-mono text-xs uppercase leading-4 text-[var(--tt-green)]">{SNACK_PIXELS}</pre>
                    <p className="tt-text text-sm text-white tt-justify">Chips, Fliesentisch und Tankenbier bilden die Pflichtverpflegung. Hätt ich gewusst das du vorbeikommst, hätt ich nicht gewichst...</p>
                  </div>
                </TTPanel>
              </div>

              <TTPanel title="Rasenschach" eyebrow=">> Rubrik 451" variant="default">
                <div className="space-y-2">
                  <pre className="tt-text whitespace-pre font-mono text-xs uppercase leading-4 text-[var(--tt-secondary)]">{MATCH_PIXELS}</pre>
                  <p className="tt-text text-sm text-white tt-justify">
                    Ölf Mann auf dem Platz, Runde ins Eckige – hier laufen die Teletext-Linien fürs nächste Match.
                  </p>
                </div>
              </TTPanel>
            </div>
          </div>
        </div>
      </RootLayout>
      <LoadingOverlay visible={showOverlay} text="Schwimmzug wird geladen …" />
    </>
  );
}

function resolveRedirectTarget(state: unknown) {
  if (state && typeof state === "object" && "from" in state) {
    const from = (state as { from?: string | null }).from;
    if (typeof from === "string" && from.startsWith("/")) return from;
  }
  return "/";
}




