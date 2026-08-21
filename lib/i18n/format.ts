/**
 * Locale-aware number/date formatting (Sprint 4B). PURE. The single most dangerous place to get
 * i18n wrong: on /quality, `82.253` in id-ID means eighty-two-thousand and in en-US means
 * eighty-two-point-two-five-three. Every count/percent/date on screen goes through here so the
 * separators follow the language, not the developer's habit.
 */

import { LOCALE, type Lang } from "./config";

/** Whole-number count, grouped per locale ("82.253" id / "82,253" en). */
export function formatCount(n: number, lang: Lang): string {
  return new Intl.NumberFormat(LOCALE[lang]).format(n);
}

/** Percent with exactly two decimals, per locale ("7,03%" id / "7.03%" en). The `%` sign is
 *  appended (not Intl `style:"percent"`, which would divide by 100 — our inputs are already 0–100). */
export function formatPct(rate: number, lang: Lang): string {
  const n = Number.isFinite(rate) ? rate : 0;
  return `${new Intl.NumberFormat(LOCALE[lang], {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)}%`;
}

/** A number with a fixed number of decimals, per locale. */
export function formatDecimal(n: number, lang: Lang, digits = 2): string {
  return new Intl.NumberFormat(LOCALE[lang], {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number.isFinite(n) ? n : 0);
}

/** Date only — day, long month, year, Asia/Jakarta — rendered in the language. "—" when absent. */
export function formatDate(iso: string | null | undefined, lang: Lang): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(LOCALE[lang], {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(d);
}

/** Date + time, Asia/Jakarta, in the language. "—" when absent. */
export function formatDateTime(iso: string | null | undefined, lang: Lang): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(LOCALE[lang], {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  }).format(d);
}
