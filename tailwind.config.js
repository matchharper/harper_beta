/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      backgroundImage: {
        gradblack: "linear-gradient(180deg, #111111 0%, #242424 100%)",
        gradpastel:
          "linear-gradient(90deg, #94B8F0 0%, #F1C4A6 50%, #F2E7AE 100%)",
        gradpastel2:
          "linear-gradient(180deg, #F2E7AE 0%, #F1C4A6 50%, #94B8F0 100%)",
      },
      colors: {
        gray100: "#111111",
        gray200: "#212121", // bg2
        gray300: "#2B2E35",
        gray400: "#393D46",
        gray500: "#5B606A",
        gray600: "#868B94",
        gray700: "#BDC8CD", // caption
        gray800: "#DCDEE3",
        gray900: "#E3E3E3",

        xgrayblack: "#1F2937",
        xprimary: "#1D9BF0",
        xmain: "#000000",
        xopp: "#FFFFFF",
        xlightgray: "#F6F6F8",
        xgray200: "#E3E3E3",
        xgray300: "#E5E6EC",
        xgray400: "#D1D5DC",
        xgray500: "#9DA3AE",
        xgray600: "#657284",
        xgray700: "#4B5462",
        xdarknavy: "#0B1957",

        hgray100: "#111111",
        hgray200: "#212121", // bg2
        hgray300: "#2B2E35",
        hgray400: "#393D46",
        hgray500: "#5B606A",
        hgray600: "#868B94",
        hgray700: "#BDC8CD", // caption
        hgray800: "#DCDEE3",
        hgray900: "#E3E3E3",
        hgray1000: "#FFFFFF",

        // hgray1000: "#000000",
        // hgray900: "#111111",
        // hgray800: "#212121", // bg2
        // hgray700: "#2B2E35",
        // hgray600: "#393D46",
        // hgray500: "#5B606A",
        // hgray400: "#868B94",
        // hgray300: "#BDC8CD", // caption
        // hgray200: "#DCDEE3",
        // hgray100: "#E3E3E3",
        // hgray0: "#FFFFFF",

        brightnavy: "#0624A8",
        beige100: "#FAF9F6",
        beige200: "#F6F0E4",
        accenta1: "#EFFF3F",
        accenta2: "#C0CE2B",
        xgray800: "#8A8B9D",
        bgDark900: "#121212",
        bgDark600: "#1E1E1E",
        bgDark500: "#292929",
        bgDark400: "#302F33",
        bgDark300: "#393939",

        ngray300: "#36363A",
        ngray600: "#8A8B9D",

        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        chart: {
          1: "hsl(var(--chart-1))",
          2: "hsl(var(--chart-2))",
          3: "hsl(var(--chart-3))",
          4: "hsl(var(--chart-4))",
          5: "hsl(var(--chart-5))",
        },
      },
      keyframes: {
        upDowns: {
          "0%, 100%": {
            transform: "translateY(0)",
          },
          "50%": {
            transform: "translateY(-10px)",
          },
        },
        shake: {
          "0%, 100%": {
            transform: "translateX(0)",
          },
          "20%, 60%": {
            transform: "translateX(-3px)",
          },
          "40%, 80%": {
            transform: "translateX(3px)",
          },
        },
        textGlow: {
          "0%, 100%": {
            opacity: "0.6",
          },
          "50%": {
            opacity: "0.9",
          },
        },
      },
      animation: {
        upDown: "upDowns 2s ease-in-out infinite",
        shake: "shake 0.3s ease-in-out",
        textGlow: "textGlow 3s ease-in-out infinite",
      },
      fontFamily: {
        sans: ["PretendardVariable", "system-ui", "sans-serif"],
        inter: ["var(--font-inter)", "sans-serif"],
        hedvig: ["Hedvig Letters Serif", "inter"],
        garamond: ["var(--font-garamond)", "serif"],
        mono: ["Menlo", "monospace", "sans-serif"],
        poppins: ["Poppins", "Inter", "sans-serif"],
        roboto: ["var(--font-roboto)"],
        serif: ["var(--font-serif)"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("tailwind-scrollbar")],
};
