import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { normalizePhoneID } from "./normalize";

/**
 * PARITAS  crm_norm_phone (SQL)  ⇄  normalizePhoneID (TS).
 *
 * K-06 (dan header normalize.ts): normalisasi telepon hidup di SATU kanon —
 * normalizePhoneID (TS). SQL `crm_norm_phone(text)` hanya boleh MENIRUNYA; ia dipakai
 * di `has_clinic` pada matview `crm_customer_mirror`. "Aturan yang ditulis dua kali akan
 * menyimpang" — dan memang pernah: SEBELUM migrasi 17, crm_norm_phone mengembalikan `'62'`
 * telanjang untuk input degenerate (`'62'`, `'0'`, `'+62'`, `'62 '`, `'000'`) sementara TS
 * mengembalikan `null`. `'62'` COCOK DENGAN DIRINYA SENDIRI → dua input rusak jadi orang
 * yang sama (pencocokan identitas palsu; sistem ini sudah punya celah identitas T-18).
 * Migrasi 17 menambah guard `nsn <> ''` sehingga SQL menyamai TS.
 *
 * ⚠️ SUBSTITUSI — BUKAN PARITAS LIVE. vitest jalan OFFLINE; tidak bisa memanggil
 * `crm_norm_phone` di database. Maka test ini terdiri dari dua lapis, keduanya proxy:
 *
 *   (A) GOLDEN-VECTOR. Nilai kanon di `VECTORS` DIAMBIL dari `crm_norm_phone` LIVE
 *       (pg_get_functiondef + eksekusi tiap vektor lewat Supabase) pada 2026-08-14,
 *       SETELAH migrasi 17. Test mengunci sisi TS ke nilai yang sudah diverifikasi sama
 *       dengan SQL. Kalau SQL di DB REGRESI, test ini TIDAK menangkapnya sendiri —
 *       verifikasi ulang manual (jalankan vektor yang sama di DB) saat salah satu sisi
 *       berubah. (Re-verifikasi live terhadap fungsi DB dijalankan lagi 2026-08-19 saat
 *       berkas ini ditarik ke branch ini — 22/22 vektor cocok.)
 *
 *   (B) STRUKTURAL. Membaca SALINAN SQL yang di-commit
 *       (supabase/migrations/20260814055353_crm_norm_phone_guard_empty_nsn.sql — di branch
 *       ini berkas migrasi tinggal di supabase/migrations/, bukan docs/migrations-applied/
 *       seperti di PR #13) dan memastikan guard empty-NSN masih ada di sana — menangkap
 *       regresi pada REKAMAN repo (bukan DB live). Pola meniru lib/crm/retention-policy.parity.test.ts.
 *
 * Vektor WAJIB memuat kasus degenerate yang DULU divergen. Test yang hanya menguji kasus
 * realistis (yang sudah pasti lolos di kedua sisi) tidak membuktikan paritas apa pun.
 */

// [input, kanon] — kanon diverifikasi == crm_norm_phone LIVE 2026-08-14 (pasca migrasi 17)
// DAN == normalizePhoneID. Keduanya harus setuju pada SETIAP baris di bawah.
const VECTORS: ReadonlyArray<readonly [string, string | null]> = [
  // — realistis: banyak bentuk, satu kanon —
  ["08123456789", "628123456789"],
  ["+628123456789", "628123456789"],
  ["628123456789", "628123456789"],
  ["8123456789", "628123456789"],
  ["0812-3456-789", "628123456789"],
  ["0812 3456 789", "628123456789"],
  ["  08123456789  ", "628123456789"],
  ["(0812) 3456-789", "628123456789"],
  ["0062 812 3456 789", "628123456789"],
  ["62 812 3456 789", "628123456789"],
  ["0812.3456.789", "628123456789"],
  ["021-5551234", "62215551234"],
  // kedua sisi sama-sama menyisakan '0' nyasar setelah 62 — paritas tetap (bukan "benar",
  // tapi IDENTIK; kalau ini mau diperbaiki, perbaiki di normalize.ts lalu perbarui SQL+baris ini)
  ["+62 (0)812 3456 789", "6208123456789"],
  // — DEGENERATE (WAJIB): dulu SQL '62' vs TS null; pasca migrasi 17 keduanya null —
  ["62", null],
  ["0", null],
  ["+62", null],
  ["62 ", null],
  ["000", null],
  ["00", null],
  // — invalid —
  ["", null],
  ["   ", null],
  ["abc", null],
];

describe("crm_norm_phone (SQL) ⇄ normalizePhoneID (TS) — golden vectors (diambil live 2026-08-14, pasca migrasi 17)", () => {
  for (const [raw, canon] of VECTORS) {
    it(`${JSON.stringify(raw)} -> ${canon === null ? "null" : JSON.stringify(canon)}`, () => {
      expect(normalizePhoneID(raw)).toBe(canon);
    });
  }

  it("degenerate empty-NSN MUST be null (regresi = '62' telanjang yang cocok dengan dirinya sendiri)", () => {
    for (const raw of ["62", "0", "+62", "62 ", "000", "00"]) {
      expect(normalizePhoneID(raw)).toBeNull();
    }
  });

  it("kanon tidak pernah '62' telanjang, tidak pernah berawalan '+' (K-05)", () => {
    for (const [raw] of VECTORS) {
      const out = normalizePhoneID(raw);
      if (out !== null) {
        expect(out).not.toBe("62");
        expect(out.startsWith("+")).toBe(false);
        expect(out.startsWith("62")).toBe(true);
      }
    }
  });
});

// (B) Struktural: salinan SQL yang di-commit harus MASIH memuat guard empty-NSN.
// Kalau berkas ini hilang/pindah, atau guard-nya dicabut, test GAGAL keras.
const APPLIED_SQL = fileURLToPath(
  new URL(
    "../../supabase/migrations/20260814055353_crm_norm_phone_guard_empty_nsn.sql",
    import.meta.url,
  ),
);

describe("crm_norm_phone — salinan SQL repo masih memuat guard (menangkap regresi rekaman)", () => {
  const sql = readFileSync(APPLIED_SQL, "utf8");
  const flat = sql.replace(/\s+/g, " ");

  it("memuat definisi fungsi crm_norm_phone", () => {
    expect(flat).toMatch(/create or replace function public\.crm_norm_phone/i);
  });

  it("memuat guard empty-NSN (nsn <> '')", () => {
    expect(flat).toContain("nsn <> ''");
  });

  it("memuat digit-check & strip separator (bentuk kanon yang sama dengan TS)", () => {
    expect(sql).toContain("^[0-9]+$");
    expect(sql).toContain("[[:space:]().-]");
  });
});
