import type { ScreenId } from "./coverage";

/**
 * DETECTOR for untranslated (hard-coded Indonesian) text in screens that claim to be bilingual.
 *
 * WHY THIS EXISTS. A screen only leaves PENDING_SCREENS for BILINGUAL_SCREENS once "every string it
 * renders is routed through the dictionary". Until now that was verified by hand — and a MISSED
 * string produces silent mixed-language output that NO test caught (the length/forbidden guards fire
 * only on `.warn.` paths). That manual-completeness dependency is exactly what made translating a
 * big screen (profile detail, ~100 strings) expensive and endlessly deferrable. This guard removes
 * it: it scans the component files of every BILINGUAL screen for common Indonesian words and fails
 * if it finds them, so the flip to bilingual is PROVEN, not trusted — and a later regression (a new
 * Indonesian literal added to a bilingual screen) fails the build.
 *
 * It is a HEURISTIC, on purpose (the prompt's guidance: "need not be perfect; catch the misses").
 * It scans comment-stripped source for a curated list of unambiguously-Indonesian words as whole
 * words. Comments are stripped (they are often written in Indonesian by design). Technical strings
 * (snake_case columns, classNames, import paths, `font-mono` values) are English and do not match
 * the word list. A false positive is fixed by translating the string or, rarely, refining the list.
 */

/** Files that render each screen's text. audience/ is mixed (search vs profile) so lists are
 *  EXPLICIT, not globbed. Only screens currently in BILINGUAL_SCREENS are scanned (see the test);
 *  profile/diagnostik are listed so they are covered automatically the moment they are flipped. */
export const SCREEN_FILES: Record<ScreenId, string[]> = {
  quality: ["app/(app)/quality/page.tsx", "components/quality/quality-dashboard.tsx"],
  segments: [
    "app/(app)/segments/page.tsx",
    "components/segments/segment-builder.tsx",
    "components/segments/filter-tree-builder.tsx",
  ],
  audit: [
    "app/(app)/settings/page.tsx",
    "components/settings/roles-panel.tsx",
    "components/settings/audit-log-panel.tsx",
    "components/settings/whatsapp-panel.tsx",
  ],
  consent: [
    "app/(app)/consent/page.tsx",
    "components/consent/consent-register.tsx",
    "components/consent/suppression-form.tsx",
    "components/consent/lift-dialog.tsx",
  ],
  search: [
    "app/(app)/audience/page.tsx",
    "components/audience/audience-pool.tsx",
    "components/audience/profile-search.tsx",
  ],
  profile: ["app/(app)/audience/[id]/page.tsx", "components/audience/profile-detail.tsx"],
  diagnostik: ["app/(app)/settings/diagnostik/page.tsx"],
};

/**
 * Curated Indonesian words. Chosen to be UNAMBIGUOUS — none is an English word or a substring that
 * collides with code identifiers when matched whole-word. Function words appear in almost any
 * Indonesian sentence; content words are UI-specific. Add sparingly, keeping the no-English-collision
 * rule.
 */
export const INDONESIAN_WORDS: string[] = [
  // function words
  "dari", "tidak", "belum", "tanpa", "dengan", "untuk", "yang", "atau", "sudah", "bukan",
  "karena", "tetapi", "lewat", "saat", "adalah", "akan", "agar", "oleh", "juga", "hanya",
  "masih", "harus", "bisa", "dan", "ada", "ini", "itu", "pada", "para", "seperti", "namun",
  // UI / content words
  "sumber", "kontak", "profil", "cocok", "keyakinan", "permintaan", "berhenti", "nama", "kota",
  "alamat", "darurat", "pilih", "simpan", "menyimpan", "lengkapi", "digerbangi", "provinsi",
  "kosong", "terisi", "tersambung", "terhubung", "jejak", "waktu", "duplikat", "catatan",
  "diterbitkan", "domisili", "kehadiran", "kunjungan", "pengguna", "anggota", "penerima",
  "dilewati", "terkirim", "dikirim", "disetujui", "ditolak", "tersimpan", "memuat", "menghubungi",
  "gerbang", "hitung", "jumlah", "tautan", "pesan", "kirim", "kesehatan", "klinik", "telepon",
  "gagal", "ditemukan", "disamarkan", "kembali", "terakhir", "aktivitas", "nyata", "diperbarui",
  "dibuat", "sembunyikan", "tampil", "dibaca", "disimpan", "berbeda", "sepakat", "penuh",
  "pertama", "keluar", "masuk", "kunci", "cari", "hasil", "muncul", "bagian", "tabel", "baris",
];

export interface Violation {
  file: string;
  line: number;
  word: string;
  text: string;
}

/** Blank out // and /* *​/ comments line-by-line, preserving line count. Also removes {/* … *​/}
 *  JSX comment bodies. Mirrors lib/design/tailwind-tokens.test.ts so guards share one idiom. */
export function stripCommentsPerLine(src: string): string[] {
  const out: string[] = [];
  let inBlock = false;
  for (let line of src.split("\n")) {
    if (inBlock) {
      const end = line.indexOf("*/");
      if (end === -1) {
        out.push("");
        continue;
      }
      line = line.slice(end + 2);
      inBlock = false;
    }
    line = line.replace(/\/\*.*?\*\//g, ""); // inline block comments
    const open = line.indexOf("/*");
    if (open !== -1) {
      inBlock = true;
      line = line.slice(0, open);
    }
    line = line.replace(/\/\/.*/, ""); // line comments
    out.push(line);
  }
  return out;
}

const wordRe = new RegExp(`\\b(${INDONESIAN_WORDS.join("|")})\\b`, "i");

/** Scan one file's content for Indonesian words (whole-word, case-insensitive), comment-stripped. */
export function scanIndonesian(content: string, file: string): Violation[] {
  const out: Violation[] = [];
  stripCommentsPerLine(content).forEach((line, i) => {
    const m = wordRe.exec(line);
    if (m) out.push({ file, line: i + 1, word: m[1].toLowerCase(), text: line.trim().slice(0, 120) });
  });
  return out;
}
