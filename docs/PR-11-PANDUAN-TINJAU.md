# PR #11 — Panduan Tinjau

> **Tujuan dokumen ini:** membuat 35 commit / 146 berkas / ~15.000 baris bisa ditinjau
> **per bagian**, bukan sebagai satu tembok datar. Peninjau yang tahu di mana harus fokus
> akan benar-benar meninjau; yang menghadapi 15 ribu baris rata akan menyerah.
>
> PR #11 = `claude/lanjutkan-pekerjaan-mno804` → `main`. Rentang: `origin/main..HEAD`
> (`git log --oneline origin/main..HEAD`). Angka di sini per 2026-08-19 (HEAD `16bfdc7`).
>
> **Baca dulu:** produksi men-deploy dari **branch**, bukan dari `main` (K-27). Fitur di PR ini
> **sudah live**. Merge ke `main` **menyelaraskan** `main` dengan yang berjalan; ia tidak
> menyalakan apa pun yang baru. Jadi tinjauan ini bukan "haruskah kita menyalakan ini" — ini
> sudah menyala — melainkan "apakah `main` layak jadi cermin resmi dari yang sudah berjalan".

---

## Cara memakai peta ini

Enam kelompok di bawah, **diurut dari yang paling butuh mata ke yang paling mekanis**. Setiap
kelompok menyebut: berkas kunci, tingkat risiko, dan apa yang harus dilihat peninjau. Kalau waktu
terbatas, tinjau kelompok 1–3 dengan teliti dan percayai bukti terlampir untuk 4–6.

| # | Kelompok | Risiko | Kira-kira |
|---|---|---|---|
| 1 | Skema & migrasi | **TINGGI** | 5 berkas migrasi + ledger |
| 2 | Jalur tulis (data mutasi) | **TINGGI** | 4 route API |
| 3 | Lapisan baca | SEDANG | ~21 modul `lib/crm/` |
| 4 | Layar | SEDANG-RENDAH | ~25 `app/` + 23 `components/` |
| 5 | Pagar & test | RENDAH (verifikasi otomatis) | 12 berkas test |
| 6 | i18n & dokumen | **MEKANIS** | ratusan string + 48 doc |

---

## Kelompok 1 — Skema & migrasi · **RISIKO TINGGI, tinjau baris demi baris**

Perubahan skema tak bisa di-A/B; salah di sini menyentuh data langsung.

**Berkas kunci (`supabase/migrations/`):**
- `20260812010000_add_crm_consent_contactability_index.sql` — indeks parsial untuk RPC contactability.
- `20260812020000_create_crm_contactable_counts.sql` — RPC hitung contactable (distinct-first, `work_mem`).
- `20260813000000_create_crm_staging_segment_ids.sql` — resolver segmen staging (semi-join, ~35s→0,33s).
- `20260813091255_create_crm_customer_mirror.sql` — **matview cermin** (20 kolom). TANPA RLS —
  grant adalah satu-satunya perlindungan; revoke+grant ada di berkas ini, **wajib**.
- `20260814040554_add_is_fitco_member_matched…​.sql` + `20260814055353_crm_norm_phone_guard_empty_nsn.sql`
  — **ditarik dari PR #13**, SQL verbatim, sudah di ledger (jangan terapkan ulang).
- `20260819061103_schedule_crm_mirror_refresh.sql` — pg_cron harian 03:00 WIB (`0 20 * * *`, DB di UTC).

**Yang harus dilihat peninjau:**
- Matview TANPA RLS → apakah `revoke … from public, anon, authenticated` + `grant … to service_role`
  ada di **setiap** berkas yang membuat/menciptakan ulang matview? (recreate mengembalikan default).
- Konversi zona waktu cron: `0 20 * * *` = 03:00 WIB, **bukan** `0 3 * * *`. Sudah terverifikasi live.
- Ledger ↔ repo: tabel di `README.md` (§migrasi). **18 berkas → 19 entri ledger**; selisih +1 = migrasi 9
  di-apply dua kali (terdokumentasi). Ledger **berbagi** dengan tim lain — cocokkan per NAMA, bukan versi.
- `supabase db push` **dilarang** sampai ledger↔repo direkonsiliasi penuh (README menjelaskan).

## Kelompok 2 — Jalur tulis · **RISIKO TINGGI**

Satu-satunya kode yang **mengubah** data. Semua lain baca-saja.

**Berkas kunci:**
- `app/api/suppression/route.ts` + `app/api/suppression/lift/route.ts` — catat/angkat suppression
  (atomik lewat `crm_record_suppression`, Sprint 3H). **Suppression menang** & append-only.
- `app/api/consent/route.ts` — jalur tulis consent.
- `lib/crm/export.ts` + `app/api/exports/route.ts` — ekspor CSV: **mengecualikan** suppression,
  gated, diaudit, kolom aman saja.

**Yang harus dilihat peninjau:** apakah setiap tulis melewati gerbang peran; apakah suppression
benar-benar dikecualikan dari ekspor; apakah audit dicatat tanpa PII.

## Kelompok 3 — Lapisan baca · **RISIKO SEDANG**

~21 modul `lib/crm/`. Baca-saja, tapi angka salah menyesatkan keputusan.

**Berkas kunci:** `mirror.ts` (+`mirror-constants.ts`) — sumber cermin; `dashboard.ts` +
`dashboard-sources.ts` + `dashboard-viz.ts` — tiga lapis dashboard; `contactability-read.ts`;
`segment.ts` + `segment-read.ts` + `filter-tree.ts` — segmen & pohon filter AND/OR;
`multisource.ts` + `clinic-source.ts` — enrichment arena/gym/klinik; `staging.ts`,
`segment-ai.ts` (+`-shared.ts`), `export.ts`, `quality.ts`.

**Yang harus dilihat:** kolom aman-saja (konstanta `*-constants.ts`), tabel dikutip (quoted
identifiers), tidak ada PII di jalur agregat. Catatan: supabase-js hanya PostgREST — agregat rumit
lewat RPC (migrasi) atau app-path terpotong (`.in()`).

## Kelompok 4 — Layar · **RISIKO SEDANG-RENDAH**

~25 `app/` + 23 `components/`. Sebagian besar wiring + tampilan.

**Berkas kunci:** `app/(app)/audience/page.tsx` + `[id]/page.tsx` (detail profil, disederhanakan
5B-T1), `segments/page.tsx`, `quality/page.tsx`, `consent/page.tsx`; `components/dashboard/*`
(kartu, bar-list, tiga lapis). **`app/dev/preview/page.tsx`** — pratinjau fixture (404 di produksi
via `app/dev/layout.tsx`); dipakai untuk screenshot.

**Yang harus dilihat:** tanpa kelas warna bernomor (K-11); token desain; peringatan basi tampil.

## Kelompok 5 — Pagar & test · **RISIKO RENDAH (verifikasi otomatis)**

**630 test hijau, 5 pagar.** Pagar sengaja dibuat menggigit:
- `lib/i18n/warning-guards.test.ts` — lantai panjang 0.6 + istilah terlarang (dibuktikan menggigit, 4D-T1).
- `lib/crm/migration-execute-guard.test.ts` — EXECUTE anon + SELECT grant matview.
- `lib/i18n/coverage.test.ts` — registry cakupan swa-hapus.
- `lib/i18n/i18n.test.ts` — paritas runtime id↔en (tsc menangkap kunci hilang saat kompilasi).
- `lib/crm/tailwind-tokens.test.ts` — tak ada kelas warna bernomor.

**Yang harus dilihat:** hampir tidak ada — jalankan `npx vitest run` (bukan jest) dan lihat hijau.

## Kelompok 6 — i18n & dokumen · **MEKANIS**

Ratusan string terjemahan (`lib/i18n/messages/id.ts` + `en.ts`) + 48 berkas `docs/`. **Tidak butuh
tinjauan baris-demi-baris** — paritas dijamin tsc (`en: Messages = typeof id`) + test runtime +
pagar panjang/terlarang. Baca judul doc untuk konteks, jangan audit tiap kalimat.

---

## Apa yang SUDAH terverifikasi (jangan ulang — ada buktinya)

- **Angka dicocokkan ke DB langsung** (proyek `cpvzwqptzcxnwzfzgrmt`): pool 82.253; 11 angka cermin
  = jalur baca live sebelum/sesudah apply; `is_fitco_member_matched` = 67.653; RPC contactability;
  event_transaction 78/4.712 (total 4.790); lapis-3 gap (my20fit 745/919). Lihat `FAKTA-DATA.md`.
- **Pagar dibuktikan menggigit:** probe istilah-terlarang + panjang (4D-T1) benar-benar gagal saat dilanggar.
- **Screenshot fixture** dashboard (ID+EN) — skala-akar membuat gym (2) terlihat, banner basi menonjol.
- **Cron terpasang & TERBUKTI BERJALAN:** jobid 9, `0 20 * * *`. Eksekusi pertama 19 Agu 2026 20:00 UTC
  (03:00 WIB), `status=succeeded`, durasi 9,02 dtk, `refreshed_at` bergerak ke 2026-08-19 20:00 (FAKTA-DATA).

## Apa yang BELUM pernah terverifikasi (jujur)

- **Render data nyata di balik login** — belum pernah; sandbox tak punya kredensial/egress. Pratinjau
  memakai fixture. Jalur nyata ditulis sebagai OPSI di `docs/RENCANA-render-data-nyata.md`, tak dijalankan.
- **Ekspor CSV di produksi** — ekspor nyata **pertama** (20 Agu 2026) **gagal diam-diam**: jalur
  ambil-baris menyebut kolom `phone` yang tak ada di `master_customer` (ada `phone_normalized`),
  jadi berkas terpotong setelah judul kolom — jalur hitung sehat, hanya jalur baris yang tak pernah
  diuji. **Sudah diperbaiki** + test paritas hitung↔baris untuk keempat kategori (terbukti
  menggigit), penanda kegagalan yang kelihatan di berkas, UTF-8 BOM, dan baris kriteria yang
  menyebut kategori sebenarnya. Rincian: `docs/riwayat/FAKTA-DATA.md` (§Ekspor per kategori). Jalur
  unduh terautentikasi **masih** tak terbukti di sandbox — instruksi uji pemilik produk (email-only,
  `# EOF total_baris=638`) di `docs/VERIFIKASI-ekspor-per-kategori.md`.
- **Asisten segmen AI** — kode lengkap, tapi **belum menyala** (butuh `ANTHROPIC_API_KEY`; tanpa itu 503).

---

## Urutan merge & revert

1. **Migrasi berlaku terlepas dari merge kode.** Semua migrasi PR ini **sudah** di DB. Merge/revert
   kode **tidak** menerapkan atau membatalkan migrasi. Membalikkan skema = migrasi terbalik terpisah
   (via `apply_migration`), **bukan** `git revert`.
2. **Merge:** izin di tangan pemilik repo (agen tidak merge sendiri). Karena prod deploy dari branch,
   merge hanya menyelaraskan `main` — aman kapan saja setelah tinjauan + gate hijau.
3. **Revert kode:** `git revert` mengembalikan lapisan baca/layar/i18n ke `main` lama. Migrasi tetap
   di DB (matview, RPC, cron tetap ada) — jalur baca lama tetap kompatibel dengannya.
4. **JANGAN arahkan Railway ke `main` sebelum merge** — itu memundurkan produksi ke jalur baca lama
   dengan angka contactability salah **tanpa error**. Urutan wajib: merge dulu, baru repoint (K-27,
   `docs/KOREKSI-DEPLOY.md`). Lihat juga `docs/MENUNGGU-TINDAKAN-MANUSIA.md`.
