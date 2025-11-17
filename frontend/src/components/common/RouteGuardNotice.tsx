/**
 * RouteGuardNotice: generisches Panel, das z. B. bei fehlendem Kontext angezeigt wird (Security Guard).
 * Leitfaden: erklärt kurz das Problem und bietet einen Button zurück zur Lobby.
 */
import { Link } from "react-router-dom";
import clsx from "clsx";
import TTPanel from "./ui/TTPanel";
import TTButton from "./ui/TTButton";

type RouteGuardNoticeProps = {
  title: string;
  description: string;
  actionLabel?: string;
  actionTo?: string;
  className?: string;
};

/**
 * Fallback-Panel für Route-Guards: informiert Nutzer:innen und führt zurück zur sicheren Lobby.
 * Wird sowohl für Security-Guards als auch für URL-Hardening genutzt.
 */
export default function RouteGuardNotice({
  title,
  description,
  actionLabel = "Zur Lobby",
  actionTo = "/",
  className,
}: RouteGuardNoticeProps) {
  return (
    <TTPanel
      title={title}
      eyebrow=">> Zugang blockiert"
      variant="danger"
      className={clsx("tt-transparent-panel", className)}
    >
      <p className="text-white">{description}</p>
      <TTButton
        as={Link}
        to={actionTo}
        variant="secondary"
        className="mt-4 w-full justify-center"
      >
        {actionLabel}
      </TTButton>
    </TTPanel>
  );
}
