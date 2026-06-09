/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0b0f17",
        slate: "#101826",
        frost: "#e6eefc",
        gold: "#f2c572",
        mint: "#9de3d6",
        cobalt: "#4c7bf3"
      },
      fontFamily: {
        display: ["Space Grotesk", "sans-serif"],
        body: ["Manrope", "sans-serif"]
      },
      boxShadow: {
        glow: "0 0 40px rgba(76, 123, 243, 0.25)",
        glass: "0 20px 60px rgba(11, 15, 23, 0.35)"
      }
    }
  },
  plugins: []
};
