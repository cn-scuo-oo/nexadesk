/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Map Tailwind to NexaDesk CSS custom properties
        primary: {
          DEFAULT: "var(--theme-primary, #1f6b50)",
          hover: "var(--theme-primary-hover, #25483f)",
          muted: "var(--theme-primary-muted, rgba(31,107,80,0.10))",
        },
        accent: {
          DEFAULT: "var(--theme-accent, #d97800)",
          soft: "var(--theme-accent-soft, #fff0c6)",
        },
        surface: {
          DEFAULT: "var(--theme-surface, #fffdf8)",
          raised: "var(--theme-surface-raised, #fff8e6)",
          overlay: "var(--theme-surface-overlay, rgba(255,253,248,0.92))",
        },
        danger: "var(--theme-destructive, #8a2d2d)",
        success: "var(--theme-green, #2e6f55)",
      },
      borderColor: {
        DEFAULT: "var(--theme-border, #e3d8c4)",
        subtle: "var(--theme-border-subtle, rgba(227,216,196,0.5))",
      },
      textColor: {
        DEFAULT: "var(--theme-text, #231f18)",
        secondary: "var(--theme-text-secondary, #6f675b)",
        muted: "var(--theme-text-muted, #9a8e7c)",
      },
      backgroundColor: {
        DEFAULT: "var(--theme-bg, #fff4c8)",
        surface: "var(--theme-surface, #fffdf8)",
        "surface-raised": "var(--theme-surface-raised, #fff8e6)",
        "surface-overlay": "var(--theme-surface-overlay, rgba(255,253,248,0.92))",
      },
      borderRadius: {
        DEFAULT: "var(--theme-radius, 10px)",
      },
    },
  },
  plugins: [
    require("@tailwindcss/typography"),
  ],
};
