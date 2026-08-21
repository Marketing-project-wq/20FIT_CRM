/**
 * Language configuration (Sprint 4B). Indonesian is the default; English is added.
 *
 * Persistence mirrors the theme system EXACTLY (lib/theme.ts): a cookie, never localStorage, so
 * the server renders in the right language with no flash and every server surface (route errors,
 * CSV headers, the reset email, the AI prompt) can read the SAME choice the client sees. Stored
 * per user via their browser cookie; survives sessions (max-age one year). No schema change — the
 * choice lives in the cookie, not the database.
 */

export const LANGS = ["id", "en"] as const;
export type Lang = (typeof LANGS)[number];

export const DEFAULT_LANG: Lang = "id";

/** Cookie name (same convention as 20fit_theme). */
export const LANG_COOKIE = "20fit_lang";

/** Intl locale per language — the reason number/date formatting can never be language-agnostic:
 *  `82.253` is eighty-two-thousand in id-ID and eighty-two-point-two-five-three in en-US. */
export const LOCALE: Record<Lang, string> = {
  id: "id-ID",
  en: "en-US",
};

export function isLang(value: unknown): value is Lang {
  return typeof value === "string" && (LANGS as readonly string[]).includes(value);
}

/** Coerce any cookie value to a valid language, falling back to the default. */
export function parseLang(value: unknown): Lang {
  return isLang(value) ? value : DEFAULT_LANG;
}
