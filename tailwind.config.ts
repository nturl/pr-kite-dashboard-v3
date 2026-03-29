import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg:       "#050a14",
        "bg-2":   "#0d1525",
        "bg-3":   "#111c30",
        border:   "rgba(255,255,255,0.08)",
        cyan:     "#00e5ff",
        lime:     "#b6ff4a",
        orange:   "#ff8c42",
        purple:   "#c084fc",
        red:      "#ff4757",
      },
      fontFamily: {
        display: ["'JetBrains Mono'", "monospace"],
        sans:    ["'Inter'", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
