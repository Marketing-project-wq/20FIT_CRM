import type { SegmentCriteria } from "./segment";

/**
 * Plain-language description of the PRESENCE part of a segment (ecosystem + source flags, positive
 * AND excluded). Pure and self-contained so a test can lock it and the builder can render it as the
 * "Filter terbaca" line. The binding (Track A): an exclusion MUST read clearly — "pernah ikut event,
 * bukan anggota, belum pernah ke arena" — or the person building the segment won't know who it hits.
 *
 * This covers only the presence dimensions the exclusion model touches. Master columns (unit,
 * segment, city, revenue) are summarised by the AND/OR tree's own readable line; time criteria have
 * their own control. Returns "" when no presence criterion is set (the caller then shows nothing).
 */

type Lang = "id" | "en";

// Human names for the eco units / source flags, per language. Kept here (not i18n dict) so the pure
// function has no runtime dictionary dependency and the test is deterministic.
const ECO: Record<string, { id: string; en: string }> = {
  event: { id: "peserta event", en: "event participant" },
  membership: { id: "anggota membership", en: "membership member" },
};
function ecoName(unit: string, lang: Lang): string {
  return ECO[unit]?.[lang] ?? unit;
}

const SRC: Record<string, { id: string; en: string }> = {
  srcArena: { id: "pernah ke arena", en: "been to arena" },
  srcGym: { id: "pernah ke gym", en: "been to gym" },
  srcHyrox: { id: "ikut Hyrox", en: "did Hyrox" },
  srcMy20fit: { id: "punya akun aplikasi", en: "has an app account" },
  srcRecency: { id: "beraktivitas nyata di aplikasi", en: "real app activity" },
};

/** The positive presence phrases (has X). */
function positiveParts(c: SegmentCriteria, lang: Lang): string[] {
  const parts: string[] = [];
  if (c.ecoUnit) parts.push(lang === "id" ? ecoName(c.ecoUnit, lang) : ecoName(c.ecoUnit, lang));
  if (c.srcHyrox) parts.push(lang === "id" ? SRC.srcHyrox.id : SRC.srcHyrox.en);
  if (c.srcMy20fit) parts.push(lang === "id" ? SRC.srcMy20fit.id : SRC.srcMy20fit.en);
  if (c.srcRecency) parts.push(lang === "id" ? SRC.srcRecency.id : SRC.srcRecency.en);
  if (c.srcArena) parts.push(lang === "id" ? SRC.srcArena.id : SRC.srcArena.en);
  if (c.srcGym) parts.push(lang === "id" ? SRC.srcGym.id : SRC.srcGym.en);
  return parts;
}

/** The exclusion phrases (NOT X / never X). */
function excludeParts(c: SegmentCriteria, lang: Lang): string[] {
  const e = c.exclude;
  if (!e) return [];
  const parts: string[] = [];
  // "bukan anggota" / "not a member"; "belum pernah ke arena" / "never been to arena".
  if (e.ecoUnit) parts.push(lang === "id" ? `bukan ${ecoName(e.ecoUnit, lang)}` : `not ${ecoName(e.ecoUnit, lang)}`);
  if (e.srcArena) parts.push(lang === "id" ? "belum pernah ke arena" : "never been to arena");
  if (e.srcGym) parts.push(lang === "id" ? "belum pernah ke gym" : "never been to gym");
  if (e.srcHyrox) parts.push(lang === "id" ? "belum pernah ikut Hyrox" : "never did Hyrox");
  if (e.srcMy20fit) parts.push(lang === "id" ? "belum punya akun aplikasi" : "has no app account");
  if (e.srcRecency) parts.push(lang === "id" ? "tak ada aktivitas nyata di aplikasi" : "no real app activity");
  return parts;
}

/** The full readable presence sentence: positives first, then exclusions. "" if nothing is set. */
export function describePresence(c: SegmentCriteria, lang: Lang = "id"): string {
  const parts = [...positiveParts(c, lang), ...excludeParts(c, lang)];
  return parts.join(lang === "id" ? ", " : ", ");
}
