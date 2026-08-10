/**
 * Theme is persisted in a cookie (never localStorage) so the server can render
 * the correct `data-theme` on <html> with no flash of the wrong theme.
 *
 * Default is light: content surfaces use the light theme, while the sidebar and
 * login screen force the dark theme locally with the white lockup (PRD §18.8).
 */
export const THEME_COOKIE = "20fit_theme";

export type Theme = "light" | "dark";

export function resolveTheme(value: string | undefined | null): Theme {
  return value === "dark" ? "dark" : "light";
}
