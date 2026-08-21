/**
 * i18n entry point (Sprint 4B). `getDictionary(lang)` returns the message tree for a language;
 * `Dict` is its type. Both dictionaries share one shape (enforced by TypeScript + i18n.test.ts).
 */

import { id, type Messages } from "./messages/id";
import { en } from "./messages/en";
import type { Lang } from "./config";

export const DICTS: Record<Lang, Messages> = { id, en };

export type Dict = Messages;

export function getDictionary(lang: Lang): Dict {
  return DICTS[lang];
}

export type { Lang } from "./config";
export { LANGS, DEFAULT_LANG, LANG_COOKIE, LOCALE, isLang, parseLang } from "./config";
export { formatCount, formatPct, formatDecimal, formatDate, formatDateTime } from "./format";
