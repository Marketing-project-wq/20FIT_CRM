import { describe, it, expect } from "vitest";
import {
  MEASURED_MARKER,
  REMEASURE_HEADING,
  MAX_AGE_DAYS,
  BIG_NUMBER_RE,
  UNDATED_LEGACY_DOCS,
  parseMeasuredAt,
  ageInDays,
  remeasureList,
  livingDocs,
  readDoc,
} from "./doc-freshness";

const ROOT = process.cwd();

// See doc-freshness.ts for WHY these exist and — more importantly — what the age guard does NOT
// guarantee. Read that header before making a red run green.

describe("PAGAR BENTUK — angka besar tanpa tanggal ukur ditolak", () => {
  it("setiap dokumen hidup yang memuat angka besar menyatakan kapan ia diukur", () => {
    const offenders = livingDocs(ROOT).filter((name) => {
      const src = readDoc(ROOT, name);
      return BIG_NUMBER_RE.test(src) && !src.includes(MEASURED_MARKER);
    });
    const unexpected = offenders.filter((f) => !UNDATED_LEGACY_DOCS.includes(f));
    expect(
      unexpected,
      `Dokumen ini mengutip angka terukur tanpa mengatakan kapan diukur.\n` +
        `Tambahkan satu baris di kepalanya:  > ## ${MEASURED_MARKER} <tanggal>, <jam> UTC\n` +
        `Jangan menambahkannya ke UNDATED_LEGACY_DOCS — daftar itu hanya boleh menyusut.`,
    ).toEqual([]);
  });

  it("daftar warisan hanya boleh MENYUSUT, tak pernah bertambah", () => {
    // Tanpa asersi ini, pagar di atas bisa dihijaukan dengan menambah satu baris ke daftar —
    // yaitu persis cara pagar berubah menjadi upacara.
    expect(UNDATED_LEGACY_DOCS.length).toBeLessThanOrEqual(31);
  });

  it("setiap entri warisan masih ada, masih memuat angka besar, dan masih tanpa tanggal", () => {
    // Entri yang berkasnya sudah dihapus atau sudah diperbaiki harus DIKELUARKAN dari daftar,
    // bukan dibiarkan — daftar yang memuat nama mati akan hijau selamanya tanpa memeriksa apa pun.
    const living = new Set(livingDocs(ROOT));
    for (const name of UNDATED_LEGACY_DOCS) {
      expect(living.has(name), `${name}: sudah tidak ada — keluarkan dari UNDATED_LEGACY_DOCS`).toBe(true);
      const src = readDoc(ROOT, name);
      expect(
        BIG_NUMBER_RE.test(src) && !src.includes(MEASURED_MARKER),
        `${name}: sudah punya tanggal ukur (atau sudah tak beranggka) — keluarkan dari UNDATED_LEGACY_DOCS`,
      ).toBe(true);
    }
  });

  it("regexnya menangkap angka bergaya repo ini, dan TIDAK menangkap tahun atau id migrasi", () => {
    for (const hit of ["82.830", "18.119", "5.467", "1.549"]) expect(BIG_NUMBER_RE.test(hit)).toBe(true);
    for (const miss of ["2026", "20260907043325", "v1.1", "0.2%"]) expect(BIG_NUMBER_RE.test(miss)).toBe(false);
  });

  it("MENGGIGIT: dokumen berangka tanpa baris tanggal ditolak", () => {
    const src = "# Catatan\n\nPool berisi 82.830 profil.\n";
    expect(BIG_NUMBER_RE.test(src) && !src.includes(MEASURED_MARKER)).toBe(true);
    // …dan diterima begitu barisnya ditambahkan.
    const fixed = `# Catatan\n\n> ## ${MEASURED_MARKER} 8 September 2026, 02:00 UTC\n\nPool berisi 82.830 profil.\n`;
    expect(BIG_NUMBER_RE.test(fixed) && !fixed.includes(MEASURED_MARKER)).toBe(false);
  });
});

describe("PAGAR UMUR — tanggal ukur yang menua jadi merah", () => {
  const NOW = Date.UTC(2026, 8, 8); // 8 Sep 2026

  it("membaca tanggal Indonesia dan ISO", () => {
    expect(parseMeasuredAt(`> ${MEASURED_MARKER} 7 September 2026, 17:30 UTC`)?.toISOString())
      .toBe("2026-09-07T00:00:00.000Z");
    expect(parseMeasuredAt(`${MEASURED_MARKER} 2026-09-07`)?.toISOString())
      .toBe("2026-09-07T00:00:00.000Z");
  });

  it("tanpa penanda, dan penanda yang tak terbaca, DIPERLAKUKAN SAMA: null", () => {
    // "ada tanggalnya tapi tak ada yang bisa membacanya" bukan kesegaran.
    expect(parseMeasuredAt("# Tanpa penanda")).toBeNull();
    expect(parseMeasuredAt(`${MEASURED_MARKER} kemarin sore`)).toBeNull();
    expect(parseMeasuredAt(`${MEASURED_MARKER} 7 Sepptember 2026`)).toBeNull();
  });

  it("MENGGIGIT: tanggal dimundurkan 31 hari → melewati ambang", () => {
    const segar = parseMeasuredAt(`${MEASURED_MARKER} 2026-09-07`)!;
    expect(ageInDays(segar, NOW)).toBe(1);
    expect(ageInDays(segar, NOW) > MAX_AGE_DAYS).toBe(false);

    const mundur31 = parseMeasuredAt(`${MEASURED_MARKER} 2026-08-07`)!;
    expect(ageInDays(mundur31, NOW)).toBe(32);
    expect(ageInDays(mundur31, NOW) > MAX_AGE_DAYS).toBe(true);

    // Tepat di ambang masih hijau; sehari sesudahnya merah.
    expect(ageInDays(parseMeasuredAt(`${MEASURED_MARKER} 2026-08-09`)!, NOW)).toBe(30);
    expect(ageInDays(parseMeasuredAt(`${MEASURED_MARKER} 2026-08-08`)!, NOW)).toBe(31);
  });

  it("ACUAN-UTAMA masih di dalam ambang, dan pesan gagalnya menyebut angka apa yang harus diukur", () => {
    const src = readDoc(ROOT, "ACUAN-UTAMA.md");
    const measuredAt = parseMeasuredAt(src);
    expect(measuredAt, `ACUAN-UTAMA.md wajib memuat baris ${MEASURED_MARKER}`).not.toBeNull();

    const daftar = remeasureList(src);
    expect(
      daftar.length,
      `ACUAN-UTAMA.md wajib memuat bagian "${REMEASURE_HEADING}" berisi daftar berbutir — ` +
        `pesan kegagalan pagar ini membacanya, supaya yang membaca kegagalan langsung punya ` +
        `daftar kerjanya alih-alih harus menyusunnya sendiri.`,
    ).toBeGreaterThan(0);

    const umur = ageInDays(measuredAt!, Date.now());
    expect(
      umur,
      `ACUAN-UTAMA.md diukur ${umur} hari lalu (ambang ${MAX_AGE_DAYS}). ` +
        `Angkanya BELUM TENTU salah — tapi tak ada yang tahu, dan itulah kegagalannya.\n` +
        `Ukur ulang yang berikut, lalu perbarui baris ${MEASURED_MARKER}:\n` +
        daftar.map((d) => `  - ${d}`).join("\n") +
        `\n\nPERINGATAN: mengubah baris tanggalnya SAJA akan menghijaukan pengujian ini. ` +
        `Pagar ini tak bisa membedakan pengukuran ulang dari ketikan. Lihat kepala doc-freshness.ts.`,
    ).toBeLessThanOrEqual(MAX_AGE_DAYS);
  });

  it("MENGGIGIT: dokumen yang menyatakan tanggal tapi tak punya daftar ukur-ulang ditolak", () => {
    expect(remeasureList(`# X\n\n${MEASURED_MARKER} 2026-09-07\n\nisi.`)).toEqual([]);
    expect(remeasureList(`${REMEASURE_HEADING}\n\n- pool master_customer\n- jumlah gagal kirim\n\n## Lain`))
      .toEqual(["pool master_customer", "jumlah gagal kirim"]);
  });
});
