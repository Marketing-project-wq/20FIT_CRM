import type { SegmentCriteria } from "./segment";
import { tagValueLabel } from "./tags";

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

/** Render a tag list with its human labels (reusing tagValueLabel — never a second label map),
 *  capped so a big multi-select stays one readable clause. */
function tagList(tags: string[], joiner: string, lang: Lang, more: (n: number) => string): string {
  const MAX = 4;
  const labels = tags.slice(0, MAX).map((t) => tagValueLabel(t, lang));
  const head = labels.join(joiner);
  return tags.length > MAX ? `${head}${joiner}${more(tags.length - MAX)}` : head;
}

/** The positive presence phrases (has X). */
function positiveParts(c: SegmentCriteria, lang: Lang): string[] {
  const parts: string[] = [];
  if (c.ecoUnit) parts.push(lang === "id" ? ecoName(c.ecoUnit, lang) : ecoName(c.ecoUnit, lang));
  if (c.srcHyrox) parts.push(lang === "id" ? SRC.srcHyrox.id : SRC.srcHyrox.en);
  if (c.srcMy20fit) parts.push(lang === "id" ? SRC.srcMy20fit.id : SRC.srcMy20fit.en);
  if (c.srcRecency) parts.push(lang === "id" ? SRC.srcRecency.id : SRC.srcRecency.en);
  if (c.srcArena) parts.push(lang === "id" ? SRC.srcArena.id : SRC.srcArena.en);
  if (c.srcGym) parts.push(lang === "id" ? SRC.srcGym.id : SRC.srcGym.en);
  // TAG criteria (TUGAS D). tagsAny reads "bertag salah satu: A atau B"; tagsAll "bertag semua: A dan B".
  if (c.tagsAny.length) {
    const list = tagList(c.tagsAny, lang === "id" ? " atau " : " or ", lang, (n) => (lang === "id" ? `+${n} lainnya` : `+${n} more`));
    parts.push(lang === "id" ? `bertag salah satu: ${list}` : `tagged any of: ${list}`);
  }
  if (c.tagsAll.length) {
    const list = tagList(c.tagsAll, lang === "id" ? " dan " : " and ", lang, (n) => (lang === "id" ? `+${n} lainnya` : `+${n} more`));
    parts.push(lang === "id" ? `bertag semua: ${list}` : `tagged all of: ${list}`);
  }
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
  if (e.tagsAny?.length) {
    const list = tagList(e.tagsAny, lang === "id" ? " atau " : " or ", lang, (n) => (lang === "id" ? `+${n} lainnya` : `+${n} more`));
    parts.push(lang === "id" ? `tidak bertag: ${list}` : `not tagged: ${list}`);
  }
  return parts;
}

/** The full readable presence sentence: positives first, then exclusions. "" if nothing is set. */
export function describePresence(c: SegmentCriteria, lang: Lang = "id"): string {
  const parts = [...positiveParts(c, lang), ...excludeParts(c, lang)];
  return parts.join(lang === "id" ? ", " : ", ");
}
