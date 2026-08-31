/**
 * Default campaign name when the operator leaves the name field blank.
 *
 * The name used to be asked at the LAST step, optional, and — when a scheduled send fired with no
 * name — filled with a raw machine timestamp ("Terjadwal 2026-08-31T06:00:00+00:00"). In Delivery
 * History those all read "Unnamed" and could not be used to trace anything. This builds a default
 * that NAMES THE SEGMENT AND THE DATE instead, e.g. "gmail test · 31 Agu 2026" — recognisable, never
 * an ISO timestamp. Pure + deterministic so both the composer (placeholder preview) and the send
 * paths (stored value) derive the exact same string.
 */

const MONTHS_ID = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * A short, human date rendered in WIB (UTC+7) so it matches the operator's timezone: "31 Agu 2026"
 * (id) / "31 Aug 2026" (en). Returns null on an unparseable input rather than "Invalid Date".
 */
export function formatShortDateWib(dateIso: string, lang: "id" | "en" = "id"): string | null {
  const t = Date.parse(dateIso);
  if (Number.isNaN(t)) return null;
  const wib = new Date(t + 7 * 60 * 60 * 1000);
  const months = lang === "en" ? MONTHS_EN : MONTHS_ID;
  return `${wib.getUTCDate()} ${months[wib.getUTCMonth()]} ${wib.getUTCFullYear()}`;
}

/**
 * The default campaign name: "{segment} · {date}". Falls back to just the segment name if the date
 * is unparseable, and to a bare "Kampanye"/"Campaign" only if the segment name is empty too — a
 * machine timestamp is never a possible output.
 */
export function defaultCampaignLabel(segmentName: string, dateIso: string, lang: "id" | "en" = "id"): string {
  const name = (segmentName ?? "").trim() || (lang === "en" ? "Campaign" : "Kampanye");
  const date = formatShortDateWib(dateIso, lang);
  return date ? `${name} · ${date}` : name;
}
