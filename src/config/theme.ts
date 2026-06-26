// Single source of truth for the app theme. Edit these tokens to retheme the
// whole app — they are applied as CSS custom properties at startup and consumed
// by the Tailwind `@theme` mapping in src/style.css.
//
// Style: "dark minimalist".

export type ThemeTokens = Record<string, string>;

export const theme: ThemeTokens = {
  base: "#0b0d10", // page background
  surface: "#14171c", // cards / panels
  elevated: "#1b1f26", // inputs / raised elements
  content: "#e6e8eb", // primary text
  muted: "#8b94a0", // secondary text
  line: "#272c34", // borders / dividers
  accent: "#6ea8fe", // primary action
  "accent-contrast": "#0b0d10", // text on accent
  danger: "#f87171",
  success: "#4ade80",
};
