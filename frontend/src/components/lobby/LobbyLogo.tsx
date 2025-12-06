/**
 * LobbyLogo: Teletext-Kacheln für den Schriftzug SCHWIMM.
 * Wird auf der Startseite angezeigt und nutzt responsive Grid-Kacheln im Retro-Look.
 */
import clsx from "clsx";

type LobbyLogoProps = {
  className?: string;
};

export default function LobbyLogo({ className }: LobbyLogoProps) {
  const letters = ["S", "C", "H", "W", "I", "M", "M"];

  return (
    <div className={clsx("w-full", className)}>
      <div className="grid w-full grid-cols-7 gap-1.5 sm:gap-2.5">
        {letters.map((ch, i) => (
          <div
            key={i}
            className="
              bg-white text-black border-4 border-black
              aspect-[1/1] flex items-center justify-center text-center
              text-[clamp(2.4rem,7.8vw,4.4rem)] sm:text-[4rem] lg:text-[4.4rem] font-extrabold tracking-[0.08em]
              shadow-[0_0_0_3px_#000_inset] px-4 sm:px-5
              tt-text
            "
          >
            {ch}
          </div>
        ))}
      </div>
    </div>
  );
}
