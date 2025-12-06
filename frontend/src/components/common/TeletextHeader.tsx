/**
 * TeletextHeader: animierter Balken mit Länder-Codes, Teletext-Zahl und Uhrzeit.
 * Simuliert die zufällige Nummern-/Buchstabenfolge des Originals mittels requestAnimationFrame plus Zufallstimer.
 */
import { useEffect, useMemo, useRef, useState } from "react";

/** Animierter Teletext-Header mit wechselnden Länder-Codes, Uhrzeit und Modusanzeige. */
type Mode = "LOGIN" | "MAIN" | "GAME" | "WIN" | "LOSE" | "SCORES" ;

const COUNTRY_CODES = [
  "DE","AT","CH","FR","IT","ES","NL","BE","DK","SE","NO","FI","PL","CZ","HU","UK","IE","PT"
];

function pad3(n: number) { return n.toString().padStart(3, "0"); }

/** Tickende Uhr, liefert formatierte Datums-/Zeitstrings für den Header. */
function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  const dateStr = useMemo(() => {
    const d = now;
    const w = d.toLocaleDateString("de-DE",{weekday:"long"});
    const tag = d.getDate().toString().padStart(2,"0");
    const mon = d.toLocaleDateString("de-DE",{month:"short"}).toUpperCase();
    const yy = (d.getFullYear()%100).toString().padStart(2,"0");
    return `${w.charAt(0).toUpperCase()+w.slice(1)} ${tag} ${mon} ${yy}`;
  }, [now]);
  const timeStr = now.toLocaleTimeString("de-DE", { hour12: false });
  return { dateStr, timeStr };
}

/** Wählt einen anderen Country-Code, damit die Animation abwechslungsreich bleibt. */
function pickNextCountry(prev: string) {
  const pool = COUNTRY_CODES.filter(c => c !== prev);
  return pool[Math.floor(Math.random()*pool.length)] || prev;
}
const randMs = (min:number,max:number)=> min + Math.floor(Math.random()*(max-min+1));
type Phase = "run" | "hold";

export default function TeletextHeader({ mode="MAIN" }: { mode?: Mode }) {
  const { dateStr, timeStr } = useClock();

  const [cc, setCc] = useState("DE");
  const [num, setNum] = useState(666);

  const phaseRef = useRef<Phase>("run");
  const deadlineRef = useRef<number>(performance.now() + randMs(1000, 3000));
  const lastFinalCcRef = useRef<string>("DE");

  const lastTickRef = useRef<number>(performance.now());
  const tickMsRef = useRef<number>(pickTeletextTick());
  const tickWindowUntilRef = useRef<number>(performance.now() + randMs(700, 1800));
  const microPauseUntilRef = useRef<number>(0);

  const targetCcRef = useRef<string>("DE");
  const lettersActiveRef = useRef<boolean>(false);

  const rafRef = useRef<number | null>(null);
  const timersRef = useRef<number[]>([]);
  const addTimer = (id:number)=>timersRef.current.push(id);
  const clearTimers = ()=>{timersRef.current.forEach(clearTimeout); timersRef.current=[];};
  const stopRAF = ()=>{ if(rafRef.current) cancelAnimationFrame(rafRef.current); rafRef.current=null; };

  useEffect(() => {
    const nextCc = pickNextCountry(lastFinalCcRef.current);
    targetCcRef.current = nextCc;
    lettersActiveRef.current = true;
    animateLetters_likeOriginal(cc, nextCc, setCc, () => {
      lastFinalCcRef.current = nextCc;
      lettersActiveRef.current = false;
    });

    let alive = true;
    const loop = () => {
      if (!alive) return;
      const now = performance.now();
      if (now >= deadlineRef.current) {
        if (phaseRef.current === "run") {
          phaseRef.current = "hold";
          deadlineRef.current = now + 1000;
          if (lettersActiveRef.current) {
            lettersActiveRef.current = false;
            setCc(targetCcRef.current);
            lastFinalCcRef.current = targetCcRef.current;
          }
        } else {
          phaseRef.current = "run";
          deadlineRef.current = now + randMs(1000, 3000);
          tickMsRef.current = pickTeletextTick();
          tickWindowUntilRef.current = now + randMs(700, 1800);
          microPauseUntilRef.current = 0;
          lastTickRef.current = now;

          const next = pickNextCountry(lastFinalCcRef.current);
          targetCcRef.current = next;
          lettersActiveRef.current = true;
          animateLetters_likeOriginal(cc, next, setCc, () => {
            lastFinalCcRef.current = next;
            lettersActiveRef.current = false;
          });
        }
      }
      if (phaseRef.current === "run") {
        if (microPauseUntilRef.current <= now) {
          if (now >= tickWindowUntilRef.current) {
            tickMsRef.current = pickTeletextTick();
            tickWindowUntilRef.current = now + randMs(700, 1800);
            if (Math.random() < 0.2) microPauseUntilRef.current = now + randMs(100, 220);
          }
          if (now - lastTickRef.current >= tickMsRef.current) {
            lastTickRef.current = now;
            setNum(prev => (prev + 1) % 1000);
          }
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { stopRAF(); clearTimers(); lettersActiveRef.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="tt-header tt-text">
      <div className="tt-header__row">
        <div className="tt-header__left">
          <span className="tt-header__code">{cc}</span>
          <span className="tt-header__num">{pad3(num)}</span>
        </div>
        <div className="tt-header__center">
          <span className="tt-header__mode">{mode}</span>
          <span className="tt-header__date">{dateStr}</span>
        </div>
        <div className="tt-header__time tabular-nums">{timeStr}</div>
      </div>
    </div>
  );

  function pickTeletextTick() { return Math.random() < 0.55 ? randMs(10, 24) : randMs(28, 80); }
  /**
   * Blättert Buchstaben nacheinander durch das Alphabet (wie beim Teletext),
   * bis der Zielcode erreicht ist oder eine Sicherheitsanzahl an Steps überschritten wird.
   */
  function animateLetters_likeOriginal(from: string, to: string, set: (v: string) => void, done: () => void) {
    const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let i0 = Math.max(0, A.indexOf(from[0]));
    let i1 = Math.max(0, A.indexOf(from[1]));
    const t0 = A.indexOf(to[0]); const t1 = A.indexOf(to[1]);
    let steps = 0; const maxSteps = 400;
    const tick = () => {
      if (phaseRef.current !== "run" || !lettersActiveRef.current) return;
      steps++; i0=(i0+1)%26; if (steps%2===0) i1=(i1+1)%26; set(A[i0]+A[i1]);
      const reached = (i0===t0 && i1===t1);
      if (reached || steps>maxSteps) { if (!reached) set(to); done(); return; }
      const delay = 24 + Math.floor(Math.random()*10);
      const id = window.setTimeout(() => {
        if (phaseRef.current !== "run" || !lettersActiveRef.current) return;
        requestAnimationFrame(tick);
      }, delay);
      addTimer(id);
    };
    requestAnimationFrame(tick);
  }
}
