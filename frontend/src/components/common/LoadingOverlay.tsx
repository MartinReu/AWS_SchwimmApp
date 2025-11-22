/**
 * LoadingOverlay: Vollflächige Intro-Animation für die LoginPage.
 * Zeigt pixeligen Schwimm-Spinner plus Text, respektiert prefers-reduced-motion.
 */
import clsx from "clsx";
import LeckerLogo from "../../assets/ui/lecker_logo.svg?url";

type LoadingOverlayProps = {
  visible: boolean;
  text?: string;
};

/** Halbtransparentes Overlay mit Teletext-Ladeanimation. */
export default function LoadingOverlay({ visible, text = "Abtauchen …" }: LoadingOverlayProps) {
  return (
    <div
      aria-hidden={!visible}
      className={clsx(
        "tt-loading-overlay",
        visible ? "tt-loading-overlay--visible" : "tt-loading-overlay--hidden"
      )}
    >
      <div className="tt-loading-overlay__content">
        <div className="tt-loading-overlay__box">
          <img
            src={LeckerLogo}
            width={320}
            height={220}
            className="tt-loading-overlay__logo"
            alt="Lecker Teletext Logo"
            aria-hidden="true"
          />
          <p className="tt-text text-center text-xs uppercase tracking-[0.4em] text-[var(--tt-yellow)]" role="status" aria-live="polite">
            {text}
          </p>
        </div>
      </div>
    </div>
  );
}
