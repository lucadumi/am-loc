const { hairlineWidth } = require("nativewind/theme");

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border) / <alpha-value>)",
        input: "hsl(var(--input) / <alpha-value>)",
        ring: "hsl(var(--ring) / <alpha-value>)",
        background: "hsl(var(--background) / <alpha-value>)",
        foreground: "hsl(var(--foreground) / <alpha-value>)",
        primary: {
          DEFAULT: "hsl(var(--primary) / <alpha-value>)",
          foreground: "hsl(var(--primary-foreground) / <alpha-value>)",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary) / <alpha-value>)",
          foreground: "hsl(var(--secondary-foreground) / <alpha-value>)",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "hsl(var(--muted) / <alpha-value>)",
          foreground: "hsl(var(--muted-foreground) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "hsl(var(--accent) / <alpha-value>)",
          foreground: "hsl(var(--accent-foreground) / <alpha-value>)",
        },
        popover: {
          DEFAULT: "hsl(var(--popover) / <alpha-value>)",
          foreground: "hsl(var(--popover-foreground) / <alpha-value>)",
        },
        card: {
          DEFAULT: "hsl(var(--card) / <alpha-value>)",
          foreground: "hsl(var(--card-foreground) / <alpha-value>)",
        },
        free: "hsl(var(--free) / <alpha-value>)",
        leaving: "hsl(var(--leaving) / <alpha-value>)",
        taken: "hsl(var(--taken) / <alpha-value>)",
        gray: {
          50: "#F4F4F5",
          100: "#E4E4E7",
          200: "#C9C9CF",
          300: "#A9A9B2",
          400: "#7D7D8C",
          500: "#60606C",
          600: "#484851",
          700: "#37373E",
          800: "#29292E",
          900: "#1D1D20",
          950: "#161618",
        },
        yellow: {
          50: "#FEFAE6",
          100: "#FDF0B9",
          200: "#FBE488",
          300: "#F9D658",
          400: "#F6CC31",
          500: "#F5C518",
          600: "#E1A809",
          700: "#B87E0A",
          800: "#8D590C",
          900: "#603B10",
          950: "#2C2211",
        },
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
  plugins: [require("tailwindcss-animate")],
};
