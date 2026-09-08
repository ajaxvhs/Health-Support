/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["DM Sans", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Sora", "DM Sans", "sans-serif"],
      },
      colors: {
        ink: "#18312f",
        teal: {
          50: "#effcf9",
          100: "#d9f5ef",
          200: "#b5e9df",
          500: "#14a88c",
          600: "#0f8b76",
          700: "#0c7062",
          800: "#0d584f",
        },
        cream: "#f6f8f7",
      },
      boxShadow: {
        soft: "0 8px 32px rgba(24,49,47,.07)",
        lift: "0 14px 40px rgba(24,49,47,.12)",
        float: "0 14px 36px rgba(15,23,42,.14)",
      },
      keyframes: {
        "toast-in": {
          from: { opacity: "0", transform: "translateY(-8px) scale(.98)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)" },
        },
      },
      animation: { "toast-in": "toast-in 180ms ease-out" },
      backgroundImage: { "dot-grid": "radial-gradient(#c8d8d4 1px, transparent 1px)" },
    },
  },
  plugins: [],
};
