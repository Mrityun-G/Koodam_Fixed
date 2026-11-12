// Imported tailwind configuration!
export default 
{
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      // Motion used by the landing and loading screens. Defined here rather
      // than pulled in as a plugin so the app keeps building offline, and so
      // every animation the app uses is visible in one place.
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(14px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" }
        },
        // Overshoots slightly, so the logo lands rather than just appearing
        "pop-in": {
          "0%": { opacity: "0", transform: "scale(0.82)" },
          "60%": { opacity: "1", transform: "scale(1.04)" },
          "100%": { opacity: "1", transform: "scale(1)" }
        },
        // Very slow drift across the hero photo
        "ken-burns": {
          "0%": { transform: "scale(1)" },
          "100%": { transform: "scale(1.09) translateY(-1.5%)" }
        },
        "float-soft": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-5px)" }
        },
        // Rings expanding out from under the logo while the app boots
        "ring-out": {
          "0%": { transform: "scale(0.75)", opacity: "0.5" },
          "100%": { transform: "scale(1.9)", opacity: "0" }
        },
        // Indeterminate progress: a short bar sweeping the track
        "bar-slide": {
          "0%": { transform: "translateX(-110%)" },
          "100%": { transform: "translateX(340%)" }
        }
      },
      animation: {
        "fade-up": "fade-up .62s cubic-bezier(.22,.9,.3,1) both",
        "fade-in": "fade-in .8s ease-out both",
        "pop-in": "pop-in .7s cubic-bezier(.34,1.46,.5,1) both",
        "ken-burns": "ken-burns 20s ease-out forwards",
        "float-soft": "float-soft 4.5s ease-in-out infinite",
        "ring-out": "ring-out 2.2s cubic-bezier(.2,.6,.3,1) infinite",
        "bar-slide": "bar-slide 1.3s cubic-bezier(.65,.05,.36,1) infinite"
      },
      colors: {
        "surface-variant": "#d3e4fe",
        "on-error-container": "#93000a",
        "surface-tint": "#a14000",
        "secondary": "#1b2a5e",
        "secondary-light": "#4e5c92",
        "inverse-on-surface": "#eaf1ff",
        "on-surface": "#0b1c30",
        "on-error": "#ffffff",
        "on-secondary-fixed-variant": "#354479",
        "on-secondary-container": "#404e83",
        "primary-fixed": "#ffdbcc",
        "surface": "#f8f9ff",
        "surface-container": "#e5eeff",
        "outline-variant": "#e2bfb0",
        "on-tertiary-fixed": "#002113",
        "secondary-container": "#b3c1ff",
        "secondary-fixed-dim": "#b7c4ff",
        "surface-container-low": "#eff4ff",
        "tertiary": "#006c49",
        "tertiary-fixed": "#6ffbbe",
        "background": "#f8f9ff",
        "on-tertiary-fixed-variant": "#005236",
        "on-primary-fixed-variant": "#7b2f00",
        "surface-bright": "#f8f9ff",
        "on-tertiary-container": "#003925",
        "surface-container-highest": "#d3e4fe",
        "on-surface-variant": "#5a4136",
        "tertiary-container": "#00ae78",
        "surface-dim": "#cbdbf5",
        "on-tertiary": "#ffffff",
        "error-container": "#ffdad6",
        "tertiary-fixed-dim": "#4edea3",
        "error": "#ba1a1a",
        "inverse-surface": "#213145",
        "on-secondary": "#ffffff",
        "on-primary": "#ffffff",
        "primary-container": "#ff6a00",
        "inverse-primary": "#ffb694",
        "on-background": "#0b1c30",
        "primary": "#a14000",
        "secondary-fixed": "#dce1ff",
        "primary-fixed-dim": "#ffb694",
        "surface-container-high": "#dce9ff",
        "outline": "#8e7164",
        "on-secondary-fixed": "#05164b",
        "on-primary-container": "#571f00",
        "on-primary-fixed": "#351000",
        "surface-container-lowest": "#ffffff"
      },
      borderRadius: {
        "DEFAULT": "1rem",
        "lg": "2rem",
        "xl": "3rem",
        "full": "9999px"
      },
      spacing: {
        "space-xl": "2rem",
        "margin-tablet": "1.5rem",
        "margin": "1rem",
        "space-sm": "0.5rem",
        "space-md": "1rem",
        "gutter-sm": "0.75rem",
        "space-lg": "1.5rem",
        "space-xs": "0.25rem",
        "gutter": "1rem"
      },
      fontFamily: {
        sans: ["'Plus Jakarta Sans'", "'Noto Sans Tamil'", "'Noto Sans Kannada'", "sans-serif"],
        "headline-lg-mobile": ["'Plus Jakarta Sans'", "'Noto Sans Tamil'", "'Noto Sans Kannada'", "sans-serif"],
        "display-lg": ["'Plus Jakarta Sans'", "'Noto Sans Tamil'", "'Noto Sans Kannada'", "sans-serif"],
        "label-lg": ["'Plus Jakarta Sans'", "'Noto Sans Tamil'", "'Noto Sans Kannada'", "sans-serif"],
        "body-sm": ["'Plus Jakarta Sans'", "'Noto Sans Tamil'", "'Noto Sans Kannada'", "sans-serif"],
        "body-lg": ["'Plus Jakarta Sans'", "'Noto Sans Tamil'", "'Noto Sans Kannada'", "sans-serif"],
        "headline-sm": ["'Plus Jakarta Sans'", "'Noto Sans Tamil'", "'Noto Sans Kannada'", "sans-serif"],
        "headline-lg": ["'Plus Jakarta Sans'", "'Noto Sans Tamil'", "'Noto Sans Kannada'", "sans-serif"],
        "headline-md": ["'Plus Jakarta Sans'", "'Noto Sans Tamil'", "'Noto Sans Kannada'", "sans-serif"],
        "label-sm": ["'Plus Jakarta Sans'", "'Noto Sans Tamil'", "'Noto Sans Kannada'", "sans-serif"],
        "label-md": ["'Plus Jakarta Sans'", "'Noto Sans Tamil'", "'Noto Sans Kannada'", "sans-serif"],
        "body-md": ["'Plus Jakarta Sans'", "'Noto Sans Tamil'", "'Noto Sans Kannada'", "sans-serif"]
      },
      fontSize: {
        "headline-lg-mobile": ["24px", { lineHeight: "32px", letterSpacing: "-0.01em", fontWeight: "700" }],
        "display-lg": ["36px", { lineHeight: "44px", letterSpacing: "-0.02em", fontWeight: "800" }],
        "label-lg": ["14px", { lineHeight: "20px", letterSpacing: "0.01em", fontWeight: "600" }],
        "body-sm": ["12px", { lineHeight: "16px", letterSpacing: "0.01em", fontWeight: "400" }],
        "body-lg": ["16px", { lineHeight: "24px", letterSpacing: "0em", fontWeight: "400" }],
        "headline-sm": ["18px", { lineHeight: "24px", letterSpacing: "0em", fontWeight: "600" }],
        "headline-lg": ["30px", { lineHeight: "38px", letterSpacing: "-0.015em", fontWeight: "700" }],
        "headline-md": ["20px", { lineHeight: "28px", letterSpacing: "-0.01em", fontWeight: "700" }],
        "label-sm": ["11px", { lineHeight: "14px", letterSpacing: "0.03em", fontWeight: "700" }],
        "label-md": ["12px", { lineHeight: "16px", letterSpacing: "0.02em", fontWeight: "600" }],
        "body-md": ["14px", { lineHeight: "20px", letterSpacing: "0em", fontWeight: "400" }]
      }
    },
  },
  plugins: [],
}
