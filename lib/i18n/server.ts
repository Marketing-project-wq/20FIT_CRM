import "server-only";
import { cookies } from "next/headers";
import { parseLang, LANG_COOKIE, DEFAULT_LANG, type Lang } from "./config";
import { getDictionary, type Dict } from "./index";

/**
 * Server-side language + dictionary (Sprint 4B). Reads the same cookie the client sets, so route
 * handlers, server components, the CSV export, and the AI prompt all speak the user's chosen
 * language. Fail-safe to the default if cookies are unavailable.
 */
export function getLang(): Lang {
  try {
    return parseLang(cookies().get(LANG_COOKIE)?.value);
  } catch {
    return DEFAULT_LANG;
  }
}

export function getServerDict(): { lang: Lang; t: Dict } {
  const lang = getLang();
  return { lang, t: getDictionary(lang) };
}
