/**
 * TTInput: Formfeld mit Teletext-Styling, Label/Hints und Fehleranzeige.
 * Wird als generisches Input-Primitiv in Toolbars, Leaderboards etc. genutzt.
 */
import { forwardRef, InputHTMLAttributes, ReactNode } from "react";
import clsx from "clsx";

type TTInputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  wrapperClassName?: string;
};

/** Eingabeelement im Teletext-Stil mit Label, Fehlertext und optionalem Hint. */
const TTInput = forwardRef<HTMLInputElement, TTInputProps>(function TTInput(
  { label, hint, error, className, wrapperClassName, id, ...rest },
  ref
) {
  const inputId = id ?? rest.name;
  return (
    <div className={clsx("flex w-full flex-col gap-1", wrapperClassName)}>
      {label && (
        <label
          htmlFor={inputId}
          className="tt-text text-xs font-black uppercase tracking-[0.3em] text-[var(--tt-secondary)]"
        >
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        className={clsx("tt-input", error && "tt-input--error", className)}
        aria-invalid={Boolean(error)}
        {...rest}
      />
      {(hint || error) && (
        <p
          className={clsx(
            "tt-text text-[0.7rem] uppercase tracking-[0.2em]",
            error ? "text-[var(--tt-danger)]" : "text-[var(--tt-text-muted)]"
          )}
          aria-live={error ? "polite" : undefined}
        >
          {error ?? hint}
        </p>
      )}
    </div>
  );
});

export default TTInput;
