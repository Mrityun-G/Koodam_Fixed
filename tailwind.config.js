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
      // The GigEzee palette, from the Welcome Screen: navy #101F55 for
      // text, golden yellow #FFC928 for primary actions, cream #FFF3D5
      // backgrounds, white cards and orange #F47B16 for small accents.
      // The lighter tints are the Welcome Screen's own. Red is kept for
      // errors only.
      colors: {
        "gz-navy": "#101F55",
        "gz-gold": "#FFC928",
        "gz-cream": "#FFF3D5",
        "gz-orange": "#F47B16",

        "surface-variant": "#FFF3D5",
        "on-error-container": "#93000a",
        "surface-tint": "#FFC928",
        "secondary": "#101F55",
        "secondary-light": "#4E5C92",
        "inverse-on-surface": "#FFF3D5",
        "on-surface": "#101F55",
        "on-error": "#ffffff",
        "on-secondary-fixed-variant": "#101F55",
        "on-secondary-container": "#101F55",
        "primary-fixed": "#FFE7A8",
        "surface": "#FFF3D5",
        "surface-container": "#FFF3D5",
        "outline-variant": "#E6E9F4",
        "on-tertiary-fixed": "#101F55",
        "secondary-container": "#FFE7A8",
        "secondary-fixed-dim": "#FFD65A",
        "surface-container-low": "#FFF7E0",
        "tertiary": "#101F55",
        "tertiary-fixed": "#FFE7A8",
        "background": "#FFF3D5",
        "on-tertiary-fixed-variant": "#101F55",
        "on-primary-fixed-variant": "#101F55",
        "surface-bright": "#FFF3D5",
        "on-tertiary-container": "#101F55",
        "surface-container-highest": "#FFE7A8",
        "on-surface-variant": "#4E5C92",
        "tertiary-container": "#FFC928",
        "surface-dim": "#FFE7A8",
        "on-tertiary": "#ffffff",
        "error-container": "#ffdad6",
        "tertiary-fixed-dim": "#FFD65A",
        "error": "#ba1a1a",
        "inverse-surface": "#101F55",
        "on-secondary": "#ffffff",
        "on-primary": "#ffffff",
        "primary-container": "#FFC928",
        "inverse-primary": "#FFD65A",
        "on-background": "#101F55",
        "primary": "#101F55",
        "secondary-fixed": "#FFF3D5",
        "primary-fixed-dim": "#FFD65A",
        "surface-container-high": "#FFE7A8",
        "outline": "#4E5C92",
        "on-secondary-fixed": "#101F55",
        "on-primary-container": "#101F55",
        "on-primary-fixed": "#101F55",
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
