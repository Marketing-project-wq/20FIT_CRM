/**
 * Human default campaign name — "{segment} · {date}" (e.g. "gmail test · 31 Agu 2026"), never an ISO
 * timestamp.
 *
 * NOTE (naming policy): the composer now REQUIRES a campaign name — this helper is no longer wired
 * into the compose form or the create-run server action. It is kept ONLY as defence-in-depth for the
 * scheduled-send cron (app/api/campaigns/run-scheduled): a pre-existing pending row whose run_label is
 * NULL (created before the name became mandatory) still gets a readable label at fire time instead of
 * a raw timestamp. Pure + deterministic; safe to reuse elsewhere that legacy data lacks a name.
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
