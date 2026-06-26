import { theme, type ThemeTokens } from "../config/theme.ts";

// Apply theme tokens to the document root as `--app-*` CSS variables. The
// Tailwind `@theme` block in style.css maps its color utilities to these.
export function applyTheme(tokens: ThemeTokens = theme): void {
  const root = document.documentElement;
  for (const [name, value] of Object.entries(tokens)) {
    root.style.setProperty(`--app-${name}`, value);
  }
}
