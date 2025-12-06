/**
 * TTActionButton: leichte Button-Variante für Inline-CTAs (QuoteBox etc.).
 * Reduziert Props auf Variante/Busy, behält aber Teletext-Optik bei.
 */
import { ButtonHTMLAttributes, PropsWithChildren } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "green" | "red" | "cyan";
  busy?: boolean;
};

/** Minimaler Teletext-Button für interne Komponenten wie die QuoteBox. */
export default function TTActionButton({
  variant = "green",
  busy,
  children,
  className = "",
  ...rest
}: PropsWithChildren<Props>) {
  const base =
    "rounded-none px-4 py-3 font-extrabold tracking-wide tt-text text-base sm:text-lg shadow-sm active:translate-y-[1px] transition disabled:opacity-60";
  const variants: Record<NonNullable<Props["variant"]>, string> = {
    green: "bg-[var(--tt-green)] text-black",
    red: "bg-[var(--tt-red)] text-[var(--tt-yellow)]",
    cyan: "bg-[var(--tt-cyan)] text-[var(--tt-blue)]"
  };
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...rest}>
      {busy ? "…" : children}
    </button>
  );
}
