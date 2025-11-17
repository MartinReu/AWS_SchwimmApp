/**
 * TTPanel: Container-Komponente für Teletext-Karten mit Eyebrow/Title/Actions.
 * Dient als Grundbaustein für Lobbypanels, Statusanzeigen und Guards.
 */
import { HTMLAttributes, PropsWithChildren, ReactNode } from "react";
import clsx from "clsx";

type PanelVariant = "default" | "cyan" | "magenta" | "danger";

type TTPanelProps = PropsWithChildren<{
  title?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  variant?: PanelVariant;
  className?: string;
  bodyClassName?: string;
}> &
  HTMLAttributes<HTMLElement>;

/** Rahmenkomponente für Teletext-Boxen inkl. Eyebrow, Titel und Aktionsleiste. */
export default function TTPanel({
  title,
  eyebrow,
  actions,
  variant = "default",
  className,
  bodyClassName,
  children,
  ...rest
}: TTPanelProps) {
  return (
    <section
      {...rest}
      className={clsx("tt-panel", variant !== "default" && `tt-panel--${variant}`, className)}
    >
      {(title || actions || eyebrow) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            {eyebrow && (
              <p className="tt-text text-xs font-black uppercase tracking-[0.3em] text-[var(--tt-secondary)]">
                {eyebrow}
              </p>
            )}
            {title && <h2 className="tt-panel__title m-0 leading-none text-white">{title}</h2>}
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}
      <div className={clsx("tt-panel__body", bodyClassName)}>{children}</div>
    </section>
  );
}
