/** @type {import('tailwindcss').Config} */
// Paleta de marca BloKKit (mismo sistema que apps/web):
// charcoal #1F1F1F · cream #F2F2F2 · cyan #7FCEEC · cyan-strong #3FA8E0 · coral #FB6E60
// Se conservan los NOMBRES de clase originales (ink/frost/gold/...) remapeados
// a los valores de marca, para rebrandear todas las vistas sin tocarlas.
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1F1F1F",
        slate: "#26272A",
        frost: "#F2F2F2",
        gold: "#7FCEEC",
        mint: "#7FCEEC",
        cobalt: "#3FA8E0",
        coral: "#FB6E60"
      },
      fontFamily: {
        display: ["'Archivo Black'", "sans-serif"],
        body: ["Inter", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"]
      },
      boxShadow: {
        glow: "0 0 40px rgba(127, 206, 236, 0.18)",
        glass: "0 20px 60px rgba(0, 0, 0, 0.35)"
      }
    }
  },
  plugins: []
};
