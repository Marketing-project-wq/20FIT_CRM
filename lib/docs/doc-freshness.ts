import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The rule these two guards enforce, and the one they DO NOT.
 *
 * Eight silent failures are on record in this project. Two of them were sentences, not code: a
 * dashboard caption that was true when written and stopped being true (T-50), and a runbook that
 * expired three days after it was verified and then misled the next reader (T-63). Source-scanning
 * guards cannot check prose — nothing can read "82.830" and know whether it is still right.
 *
 * So these guards check the one thing that IS mechanical: whether a document SAYS WHEN it was
 * measured, and whether that statement has gone stale. A number without a measurement date is a
 * claim with no expiry; a measurement date older than the threshold is a document nobody has
 * revisited.
 *
 * WHAT THE AGE GUARD DOES NOT GUARANTEE — read this before trusting a green run.
 *
 * Its failure is repaired by editing one date line. Someone in a hurry can make it green without
 * measuring anything, and the result is WORSE than no guard at all, because a fresh date gets
 * believed. The guard cannot tell a re-measurement from a keystroke.
 *
 * The only defence built in here is to make measuring cheaper than guessing: a document that
 * declares a measurement date must also declare WHICH figures it measured (the RE-MEASURE section),
 * and the failure message prints that list so the next person has the work-list in front of them
 * instead of having to reconstruct it. That reduces the temptation. It does not remove it.
 *
 * Owner's decision, 8 Sep 2026: build both, and write this limitation inside the guard itself so
 * the next person knows what it does not promise.
 */

/** The line a living document must carry, e.g. `> ## ⏱ DIUKUR: 7 September 2026, 17:30 UTC`. */
export const MEASURED_MARKER = "⏱ DIUKUR:";

/** The heading that lists what was measured — printed back in the age guard's failure message. */
export const REMEASURE_HEADING = "## Angka yang wajib diukur ulang";

/** Days a measurement may stand before the guard calls it unverified. A month: long enough that a
 *  stable document is not nagged, short enough that a load or a schema change lands inside it. */
export const MAX_AGE_DAYS = 30;

/** A "big number" in this repo's writing style: 82.830, 18.119, 5.467. Three-digit groups with the
 *  Indonesian thousands separator. Deliberately NOT `\d{4,}` — years (2026) and migration ids would
 *  match that and the guard would be crying wolf on every document. */
export const BIG_NUMBER_RE = /\d{1,3}\.\d{3}(?!\d)/;

const ID_MONTHS: Record<string, number> = {
  januari: 0, februari: 1, maret: 2, april: 3, mei: 4, juni: 5,
  juli: 6, agustus: 7, september: 8, oktober: 9, november: 10, desember: 11,
};

/**
 * Parse the date out of a `⏱ DIUKUR:` line. Accepts `7 September 2026` and `2026-09-07`, because
 * the documents are written in Indonesian and the ISO form is what a tool would emit.
 * Returns null when the marker is absent OR present but unparseable — and the callers treat those
 * two the SAME WAY (fail), because "there is a date but nobody can read it" is not freshness.
 */
export function parseMeasuredAt(src: string): Date | null {
  const line = src.split("\n").find((l) => l.includes(MEASURED_MARKER));
  if (!line) return null;
  const after = line.slice(line.indexOf(MEASURED_MARKER) + MEASURED_MARKER.length);

  const iso = after.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]));

  const id = after.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (id) {
    const month = ID_MONTHS[id[2].toLowerCase()];
    if (month === undefined) return null;
    return new Date(Date.UTC(+id[3], month, +id[1]));
  }
  return null;
}

export function ageInDays(measuredAt: Date, nowMs: number): number {
  return Math.floor((nowMs - measuredAt.getTime()) / 86_400_000);
}

/** The figures the document itself says it measured, pulled out of its RE-MEASURE section so the
 *  failure message can name them. Empty array when the section is missing — which is itself a
 *  failure, handled by the caller. */
export function remeasureList(src: string): string[] {
  const at = src.indexOf(REMEASURE_HEADING);
  if (at === -1) return [];
  const rest = src.slice(at + REMEASURE_HEADING.length);
  const end = rest.search(/\n#{1,2} /);
  return (end === -1 ? rest : rest.slice(0, end))
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("- "))
    .map((l) => l.slice(2).trim());
}

/** Top-level `docs/*.md`. `docs/riwayat/**` is EXCLUDED on purpose: it is the frozen record —
 *  sprint prompts and session summaries that are supposed to state what was true on their own date
 *  and never change. Forcing a live measurement line onto an archive would be asking a diary to
 *  keep itself current. */
export function livingDocs(root: string): string[] {
  return readdirSync(join(root, "docs"), { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".md"))
    .map((e) => e.name)
    .sort();
}

export function readDoc(root: string, name: string): string {
  return readFileSync(join(root, "docs", name), "utf8");
}

/**
 * Living documents that carry big numbers and NO measurement line — as they stood on 8 Sep 2026.
 *
 * An explicit frozen list, never a pattern, for the same reason SYSTEM_BARE_TAGS is one: these are
 * facts about production as it is, not a rule anyone should be able to satisfy by accident. A new
 * document cannot join it — the test asserts the list may only SHRINK. Each entry leaves when its
 * document is next revised and gains a `⏱ DIUKUR:` line.
 *
 * This is a debt register, not an exemption policy. 31 documents in this repo quote measured figures with
 * nothing saying when they were taken; that is the backlog, written down.
 */
export const UNDATED_LEGACY_DOCS: readonly string[] = [
  "CEKLIS-verifikasi-live.md",
  "ESKALASI-paparan-data-sensitif.md",
  "ESKALASI-plafon-kirim.md",
  "EVALUASI-LINGKUP-24agu.md",
  "KEBUTUHAN-SISTEM.md",
  "KOLOM-WAKTU.md",
  "KOREKSI-DEPLOY.md",
  "MENUNGGU-TINDAKAN-MANUSIA.md",
  "PETA-JALAN-menghubungi.md",
  "PETA-WORKFLOW.md",
  "PR-11-PANDUAN-TINJAU.md",
  "PR-sprint-3k-3p.md",
  "PR-sprint-3r.md",
  "PROGRES-workflow-marketing.md",
  "RENCANA-agregat-event-dashboard.md",
  "RENCANA-batas-kirim.md",
  "RENCANA-impor-audiens.md",
  "RENCANA-ingest-ticket.md",
  "RENCANA-instans-kampanye.md",
  "RENCANA-koreksi-kontak.md",
  "RENCANA-message-log.md",
  "RENCANA-multisumber.md",
  "RENCANA-render-data-nyata.md",
  "RENCANA-template-simpan.md",
  "RINGKASAN-keputusan-merge.md",
  "RISIKO-masking-bypass.md",
  "SIGNOFF-legal-consent.md",
  "SUMBER-AKTIVITAS.md",
  "TINJAUAN-pra-merge.md",
  "USULAN-pipeline-harian.md",
  "VERIFIKASI-ekspor-per-kategori.md",
] as const;
