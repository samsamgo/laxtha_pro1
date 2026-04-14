/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        fx2: {
          bg: "#F4F7FB",
          card: "#FFFFFF",
          primary: "#2563EB",
          secondary: "#06B6D4",
          text: "#111827",
          muted: "#6B7280",
          success: "#10B981",
          warning: "#F59E0B",
          danger: "#EF4444"
        }
      },
      borderRadius: {
        card: "20px"
      },
      boxShadow: {
        card: "0 10px 30px rgba(148, 163, 184, 0.16)"
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
