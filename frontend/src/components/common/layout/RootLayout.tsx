/**
 * RootLayout: Teletext-Grundgerüst mit Header/Footer/Content-Bereich.
 * Alle Seiten nutzen dieses Layout, um Shell-Styling und optionale Page-Transitions zu erhalten.
 */
import { PropsWithChildren, ReactNode } from "react";
import clsx from "clsx";

type RootLayoutProps = PropsWithChildren<{
  header: ReactNode;
  footer?: ReactNode;
  className?: string;
}>;

const ENABLE_PAGE_TRANSITIONS = String(import.meta.env.VITE_ENABLE_PAGE_TRANSITIONS ?? "true").toLowerCase() !== "false";

/** Standard-Layout: kapselt Header/Footer und optional animierte Page-Transitions. */
export default function RootLayout({ header, footer, className, children }: RootLayoutProps) {
  const innerClass = clsx("tt-shell__inner", ENABLE_PAGE_TRANSITIONS && "tt-page-transition");
  return (
    <div className={clsx("tt-shell", className)}>
      <header className="tt-shell__header">{header}</header>
      <main className="tt-shell__content" role="main">
        <div className={innerClass}>{children}</div>
      </main>
      {footer && <footer className="tt-shell__footer">{footer}</footer>}
    </div>
  );
}
