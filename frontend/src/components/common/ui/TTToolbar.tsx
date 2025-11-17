/**
 * TTToolbar: Kopfzeile für Abschnitte, inklusive Titel, Beschreibung und Actions.
 * Wird z. B. auf Home-, Game- und Leaderboard-Seiten eingesetzt.
 */
import { PropsWithChildren, ReactNode } from "react";
import clsx from "clsx";

type TTToolbarProps = PropsWithChildren<{
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}>;

/** Kopfzeile für Seitenabschnitte: zeigt Titel, Beschreibung und optionale Actions. */
export default function TTToolbar({ title, description, actions, className, children }: TTToolbarProps) {
  return (
    <div className={clsx("tt-toolbar", className)}>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {title && <div className="tt-toolbar__title">{title}</div>}
        {description && <p className="tt-toolbar__description">{description}</p>}
        {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
      </div>
      {actions && <div className="tt-toolbar__actions">{actions}</div>}
    </div>
  );
}
