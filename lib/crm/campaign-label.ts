/**
 * Human default campaign name — "{segment} · {date}" (e.g. "gmail test · 31 Agu 2026"), never an ISO
 * timestamp.
 *
 * NOTE (naming policy): the composer now REQUIRES a campaign name — this helper is no longer wired
 * into the compose form or the create-run server action. But it is NOT a leftover: it is the SOLE
 * guarantee of a valid name on the scheduled-send cron path (app/api/campaigns/run-scheduled → via
 * cronRunLabel below). The cron calls createRun DIRECTLY, bypassing the composer's mandatory-name
 * validation entirely — so nothing but this fallback stands between a name-less pending row and the
 * label/run_label NOT NULL constraint (a NULL there = run_create_failed, a real cron failure, not just
 * an ugly name). Keep it alive. It gives a pre-existing pending row whose run_label is NULL/blank a
 * readable label at fire time instead of a raw timestamp. Pure + deterministic.
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

/**
 * Resolve the label the scheduled-send cron must write for a run. Returns the stored run_label when it
 * carries real text, otherwise the human default. Uses `?.trim() ||` — NOT `??` — on purpose: `??`
 * only catches null/undefined, so a whitespace-only run_label (" ") would slip through and then be
 * collapsed to NULL by createRun's own trim. Once run_label/label are NOT NULL that NULL would make the
 * cron fail (run_create_failed) rather than merely produce an ugly name. defaultCampaignLabel never
 * returns empty, so this is guaranteed non-blank — the sole guarantee of a valid label on the cron path
 * (the composer's mandatory-name validation does not run here; the cron calls createRun directly).
 */
export function cronRunLabel(
  runLabel: string | null | undefined,
  segmentName: string,
  dateIso: string,
  lang: "id" | "en" = "id",
): string {
  return runLabel?.trim() || defaultCampaignLabel(segmentName, dateIso, lang);
}
