/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        accent: "var(--accent)",
        "accent-dark": "var(--accent-dark)",
        ink: "var(--ink)",
        "ink-muted": "var(--ink-muted)",
        scrim: "var(--scrim)",
        line: "var(--line)",
        ok: "var(--ok)",
        warn: "var(--warn)",
        danger: "var(--danger)",
        info: "var(--info)",
      },
      zIndex: {
        drawer: "10",
        sheet: "50",
        lightbox: "60",
      },
      borderRadius: {
        card: "20px",
        btn: "12px",
      },
      boxShadow: {
        warm: "var(--shadow)",
      },
      fontFamily: {
        sans: ["var(--font)"],
      },
    },
  },
  plugins: [],
};
