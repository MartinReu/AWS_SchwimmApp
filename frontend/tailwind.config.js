/**
 * Tailwind-Config für das Schwimm-Frontend.
 * Aktiviert Teletext-Font, Letterspacing und custom Bubble-Animationen (für Page-Transitions/Overlays).
 * Wird von Vite beim Build/Dev gelesen, um nur tatsächlich genutzte Klassen zu generieren.
 * @type {import('tailwindcss').Config}
 */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        teletext: ["EuropeanTeletextNuevo", "ui-monospace", "Menlo", "Consolas", "monospace"],
      },
      letterSpacing: {
        teletext: "0.08em",
      },
      keyframes: {
        "bubble-rise": {
          "0%": { transform: "translate(-50%, 20vh) scale(0.9)", opacity: "1" },
          "100%": { transform: "translate(-50%, -120vh) scale(1.06)", opacity: "1" },
        },
        "bubble-overlay": {
          "0%": { opacity: "1" },
          "90%": { opacity: "1" },
          "100%": { opacity: "0" },
        },
        "bubble-fade": {
          "0%": { opacity: "0" },
          "50%": { opacity: "1" },
          "100%": { opacity: "0" },
        },
      },
      animation: {
        "bubble-rise": "bubble-rise var(--bubble-rise-duration, 1200ms) linear forwards",
        "bubble-overlay": "bubble-overlay var(--bubble-overlay-duration, 1500ms) ease-out forwards",
        "bubble-fade": "bubble-fade 900ms ease-in-out forwards",
      },
    },
  },
  plugins: [],
};
