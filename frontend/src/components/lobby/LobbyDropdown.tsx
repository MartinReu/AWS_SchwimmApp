/**
 * LobbyDropdown: Teletext-inspiriertes Eingabefeld mit Filter-/Dropdown-Funktion.
 * Wird auf der Home-Seite sowohl für Lobbynamen als auch Spielerauswahl genutzt.
 * Unterstützt freie Eingaben, Vorschläge mit Hinweisen und einfache Validierung.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";

type DropdownOption =
  | string
  | {
      label: string;
      value?: string;
      disabled?: boolean;
      hint?: string;
    };

type NormalizedOption = {
  label: string;
  value: string;
  disabled: boolean;
  hint?: string;
};

type Props = {
  value: string;
  onChange: (v: string) => void;
  options: DropdownOption[];
  placeholder?: string;
  maxLen?: number;
  error?: string | null;
  disabled?: boolean;
};

/** Teletext-Eingabefeld mit Dropdown/Filter, ideal für Lobby- und Spielernamen. */
export default function LobbyDropdown({
  value,
  onChange,
  options,
  placeholder = "Lobby wählen oder neu eingeben",
  maxLen = 22,
  error,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const [isFocused, setIsFocused] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const normalizedOptions = useMemo(() => options.map(normalizeOption), [options]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return normalizedOptions;
    return normalizedOptions.filter((option) => option.label.toLowerCase().includes(q));
  }, [normalizedOptions, query]);
  const normalizedValue = value.trim().toLowerCase();

  /**
   * Übernimmt eine Option aus der Liste.
   * Respektiert disabled-Status, synchronisiert Eingabefeld und schließt das Dropdown.
   */
  function pick(option: NormalizedOption) {
    if (option.disabled) return;
    onChange(option.value);
    setQuery(option.value);
    setOpen(false);
    inputRef.current?.focus();
  }

  /**
   * Reagiert auf Texteingaben: begrenzt Länge, öffnet Liste und spiegelt Wert an Parent onChange.
   */
  function onInput(v: string) {
    const next = v.slice(0, maxLen);
    setQuery(next);
    onChange(next);
    if (!open) setOpen(true);
  }

  /**
   * Tastaturkürzel:
   * - Pfeil runter öffnet die Liste
   * - Escape/Enter schließen sie (Enter übernimmt bereits per onInput)
   */
  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      setOpen(true);
      e.preventDefault();
    }
    if (e.key === "Escape") setOpen(false);
    if (e.key === "Enter") setOpen(false);
  }

  return (
    <div className="relative space-y-1" ref={wrapRef} aria-expanded={open} aria-haspopup="listbox">
      <div className="grid grid-cols-[1fr_auto] gap-0">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => onInput(e.target.value)}
          onKeyDown={onKey}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={isFocused || query.trim().length > 0 ? "" : placeholder}
          maxLength={maxLen}
          disabled={disabled}
          className={clsx(
            "tt-input rounded-none border-[3px] border-[var(--tt-secondary)] bg-[#050818] text-[var(--tt-info)] placeholder:text-white/60 focus:placeholder-transparent",
            error && "tt-input--error",
            disabled && "cursor-not-allowed opacity-60"
          )}
        />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label="Lobbys öffnen"
          className={clsx(
            "h-12 border-[3px] border-l-0 border-[var(--tt-secondary)] bg-[#050818] px-4 font-black uppercase tracking-[0.2em] text-[var(--tt-secondary)] transition-colors",
            open && "bg-[var(--tt-secondary)] text-black",
            disabled && "cursor-not-allowed opacity-50",
            !disabled && "hover:bg-[var(--tt-secondary)] hover:text-black"
          )}
          disabled={disabled}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            className={clsx("fill-current transition-transform", open && "rotate-180")}
          >
            <path d="M7 10l5 5 5-5H7z" />
          </svg>
        </button>
      </div>

      <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-[var(--tt-text-muted)]">
        <span>{error && <span className="text-[var(--tt-danger)] font-black">{error}</span>}</span>
        <span>
          {query.length}/{maxLen}
        </span>
      </div>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 right-0 z-20 mt-2 max-h-48 overflow-auto border-4 border-black bg-black/95 text-white shadow-[0_0_0_3px_var(--tt-primary)]"
        >
          {filtered.length === 0 && <div className="px-4 py-3 text-sm text-gray-300">Keine Einträge gefunden</div>}
          {filtered.map((option, i) => {
            const optionValue = option.value.trim().toLowerCase();
            const isSelected = optionValue === normalizedValue;
            return (
              <button
                type="button"
                role="option"
                aria-selected={isSelected}
                key={`${option.value}-${i}`}
                onClick={() => pick(option)}
                disabled={option.disabled}
                className={clsx(
                  "block w-full border-b border-white/10 px-4 py-3 text-left text-sm font-semibold uppercase tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tt-primary)]",
                  isSelected
                    ? "bg-[var(--tt-primary)] text-black"
                    : option.disabled
                      ? "bg-[#0d1536] text-white/60"
                      : "bg-[#0f1b4c] text-white hover:bg-[#152979]",
                  option.disabled && "cursor-not-allowed opacity-70"
                )}
              >
                <span>{option.label}</span>
                {option.hint && (
                  <span className="mt-1 block text-xs font-normal uppercase tracking-[0.3em] text-white/60">
                    {option.hint}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Vereinheitlicht string/objektbasierte Optionen zu einem klaren Renderobjekt. */
function normalizeOption(option: DropdownOption): NormalizedOption {
  if (typeof option === "string") {
    return {
      label: option,
      value: option,
      disabled: false,
    };
  }
  const label = option.label ?? option.value ?? "";
  const value = option.value ?? label;
  return {
    label,
    value,
    disabled: Boolean(option.disabled),
    hint: option.hint,
  };
}
