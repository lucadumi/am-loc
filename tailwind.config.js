const { hairlineWidth } = require("nativewind/theme");

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  /* Follows the system setting rather than a class the app toggles: NativeWind
     applies `.dark` from `Appearance` itself, so there is one source of truth
     and it is the one the driver already set on their phone. */
  darkMode: "class",
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border) / <alpha-value>)",
        background: "hsl(var(--background) / <alpha-value>)",
        foreground: "hsl(var(--foreground) / <alpha-value>)",
        primary: {
          DEFAULT: "hsl(var(--primary) / <alpha-value>)",
          foreground: "hsl(var(--primary-foreground) / <alpha-value>)",
        },
        secondary: "hsl(var(--secondary) / <alpha-value>)",
        destructive: "hsl(var(--destructive) / <alpha-value>)",
        muted: {
          foreground: "hsl(var(--muted-foreground) / <alpha-value>)",
        },
        card: "hsl(var(--card) / <alpha-value>)",
        free: "hsl(var(--free) / <alpha-value>)",
        leaving: "hsl(var(--leaving) / <alpha-value>)",
        taken: "hsl(var(--taken) / <alpha-value>)",
        indigo: {
          50: "#EEF2FF",
          100: "#E0E7FF",
          200: "#C7D2FE",
          300: "#A5B4FC",
          400: "#818CF8",
          500: "#6366F1",
          600: "#4F46E5",
          700: "#4338CA",
          800: "#3730A3",
          900: "#312E81",
          950: "#1E1B4B",
        },
      },
      borderRadius: {
        xl: "calc(var(--radius) + 4px)",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 4px)",
        sm: "calc(var(--radius) - 8px)",
      },
      fontFamily: {
        sans: ["Montserrat_400Regular"],
        mid: ["Montserrat_500Medium"],
        semi: ["Montserrat_600SemiBold"],
        title: ["Montserrat_700Bold"],
        heavy: ["Montserrat_800ExtraBold"],
      },
      borderWidth: {
        hairline: hairlineWidth(),
      },
    },
  },
};
