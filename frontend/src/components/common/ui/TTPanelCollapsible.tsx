/**
 * Teletext-Panel mit einklappbarem Body-Bereich.
 * Verpackt Titel/Eyebrow und einen Toggle-Button, der den Inhalt ein- und ausblendet, bleibt ansonsten styling-kompatibel zu TTPanel.
 */
import { HTMLAttributes, PropsWithChildren, ReactNode, useId, useState } from "react";
import clsx from "clsx";

type PanelVariant = "default" | "cyan" | "magenta" | "danger";

type TTPanelCollapsibleProps = PropsWithChildren<{
  title: ReactNode;
  eyebrow?: ReactNode;
  variant?: PanelVariant;
  className?: string;
  bodyClassName?: string;
  initialExpanded?: boolean;
}> &
  HTMLAttributes<HTMLElement>;

export default function TTPanelCollapsible({
  title,
  eyebrow,
  variant = "default",
  className,
  bodyClassName,
  initialExpanded = true,
  children,
  ...rest
}: TTPanelCollapsibleProps) {
  const [expanded, setExpanded] = useState(initialExpanded);
  const contentId = useId();
  const bodyId = `${contentId}-body`;

  return (
    <section
      {...rest}
      className={clsx("tt-panel", variant !== "default" && `tt-panel--${variant}`, className)}
    >
      <button
        type="button"
        className={clsx(
          "flex w-full items-center justify-between gap-3 bg-transparent p-0 text-left text-white outline-none focus-visible:ring-2 focus-visible:ring-[var(--tt-secondary)] focus-visible:ring-offset-2 focus-visible:ring-offset-black",
          expanded && "mb-4"
        )}
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        aria-controls={bodyId}
      >
        <div className="flex flex-col text-left">
          {eyebrow && (
            <p className="tt-text m-0 text-xs font-black uppercase tracking-[0.3em] text-[var(--tt-secondary)]">
              {eyebrow}
            </p>
          )}
          <span className="tt-panel__title m-0 leading-none text-white">{title}</span>
        </div>
        <span
          className={clsx(
            "ml-auto inline-flex h-14 w-14 items-center justify-center text-[var(--tt-secondary)] transition-transform",
            expanded && "rotate-180"
          )}
          aria-hidden="true"
        >
          <svg className="h-9 w-9 fill-current" viewBox="0 0 24 24" focusable="false" aria-hidden="true">
            <path d="M7 10l5 5 5-5H7z" />
          </svg>
        </span>
      </button>

      <div
        id={bodyId}
        className={clsx("tt-panel__body", !expanded && "hidden", bodyClassName)}
        aria-hidden={!expanded}
      >
        {children}
      </div>
    </section>
  );
}
