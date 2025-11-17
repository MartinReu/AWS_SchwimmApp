/** @type {import('tailwindcss').Config} */
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
    },
  },
  plugins: [],
};
