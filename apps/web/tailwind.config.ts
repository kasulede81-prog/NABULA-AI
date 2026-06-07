import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        nebula: {
          50: "#f5f3ff",
          100: "#ede9fe",
          500: "#8b5cf6",
          600: "#7c3aed",
          700: "#6d28d9",
          900: "#4c1d95",
        },
        surface: {
          DEFAULT: "#0f1117",
          card: "#161b22",
          border: "#21262d",
        },
      },
    },
  },
  plugins: [],
};

export default config;
