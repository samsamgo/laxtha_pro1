/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        fx2: {
          bg: "#F4F7FB",
          card: "#FFFFFF",
          surface: "#EAF0F8",
          primary: "#2563EB",
          secondary: "#06B6D4",
          text: "#111827",
          muted: "#6B7280",
          success: "#22C55E",
          warning: "#F59E0B",
          danger: "#EF4444",
          sidebar: "#0F172A",
        }
      },
      borderRadius: {
        card: "20px"
      },
      boxShadow: {
        card: "0 4px 6px -1px rgba(0,0,0,0.07), 0 2px 4px -1px rgba(0,0,0,0.04)"
      },
      spacing: {
        sidebar: "240px",
        header: "80px",
        cardGap: "20px"
      },
      gridTemplateColumns: {
        dashboard: "repeat(12, minmax(0, 1fr))"
      }
    }
  },
  plugins: [],
};
