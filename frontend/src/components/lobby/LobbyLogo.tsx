/**
 * LobbyLogo: Teletext-Kacheln für den Schriftzug SCHWIMM.
 * Wird auf der Startseite angezeigt und nutzt responsive Grid-Kacheln im Retro-Look.
 */
export default function LobbyLogo() {
  const letters = ["S", "C", "H", "W", "I", "M", "M"];

  return (
    <div className="my-8 w-full">
      <div
        className="
          grid grid-cols-7 gap-2 sm:gap-3
          max-w-[680px] mx-auto
        "
      >
        {letters.map((ch, i) => (
          <div
            key={i}
            className="
              bg-white text-black border-4 border-black
              aspect-[1/1.1] flex items-center justify-center
              text-5xl sm:text-7xl font-extrabold
              shadow-[0_0_0_2px_#000_inset]
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
