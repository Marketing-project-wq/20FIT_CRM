# Migrasi yang diterapkan — DDL referensi (BUKAN dijalankan CLI)

Folder ini menyimpan **salinan DDL** migrasi yang sudah diterapkan ke
`cpvzwqptzcxnwzfzgrmt` lewat Supabase MCP `apply_migration`, tapi yang **sengaja TIDAK**
diletakkan di `supabase/migrations/`.

## Kenapa di sini, bukan di `supabase/migrations/`

Ledger migrasi proyek ini **sudah diverge**: setiap migrasi CRM dijalankan lewat
`apply_migration` (satu per gate), yang mencap versinya sendiri — tak satu pun cocok dengan
timestamp nama berkas di `supabase/migrations/`. `supabase db push` karena itu **dilarang**:
CLI akan menganggap seluruh berkas repo belum diterapkan dan menjalankan ulang semuanya (lihat
peringatan di `README.md` utama).

Menaruh migrasi 15 & 16 di `supabase/migrations/` **menambah** berkas yang akan dicoba
dijalankan CLI — menaikkan risiko demi kerapian kosmetik, tanpa menyelesaikan divergensi.
Menaruhnya **hanya di ledger internal Supabase + arsip percakapan** membuat definisi 20 kolom
cermin — kode yang menentukan arti setiap angka di dashboard — hilang kalau DB harus dibangun
ulang. Folder ini adalah jalan tengah: **DDL hidup di repo, CLI tak menyentuhnya.**

> Pointer wajib ada di `supabase/migrations/README.md` supaya folder migrasi tidak "berbohong
> dengan diam" — orang yang membukanya harus tahu dua migrasi cermin ada di sini.

## Peta ledger

| # | Berkas di folder ini | Versi ledger | Diterapkan | Isi |
|---|---|---|---|---|
| 15 | `20260813091255_create_crm_customer_mirror.sql` | `20260813091255` | 2026-08-13 | Matview cermin (19 kolom) + `crm_mirror_meta` + `crm_refresh_customer_mirror()` |
| 16 | `20260814040554_add_is_fitco_member_matched_to_crm_customer_mirror.sql` | `20260814040554` | 2026-08-14 | DROP+recreate cermin, tambah kolom ke-20 `is_fitco_member_matched` (Fitco, 67.653) |

**Migrasi 15 adalah REKONSTRUKSI** dari katalog hidup (SQL asli tak pernah di-commit) —
menjalankannya menghasilkan objek yang sama, tapi teks/urutan bisa beda dari yang asli.
**Migrasi 16 adalah salinan PERSIS** SQL yang diterapkan.

## Aturan penomoran temuan/keputusan (tie-break)

Ditetapkan 2026-08-14, berlaku seterusnya: **nomor yang SUDAH dirujuk dari komentar DB menang
atas pesanan yang hanya ada di dokumen.** Komentar DB adalah DDL di database bersama + satu
entri ledger lagi (mahal diubah); dokumen dinomori ulang gratis. Contoh: migrasi 16 menulis
`T-18` ke komentar kolom `is_fitco_member_matched`; kalau branch dokumen lain memesan `T-18`
untuk hal berbeda, **dokumen itu** yang dinomori ulang, bukan komentar DB.

## Utang teknis (JANGAN dikerjakan tanpa gate sendiri)

**Rekonsiliasi ledger vs repo** (mis. `supabase migration repair`) supaya `db push` aman lagi:
tabel ledger di `README.md` utama & `LINIMASA.md` masih berhenti di migrasi **10**, sementara
DB memuat migrasi CRM **11–14** (consent backfill, indeks, dst. — terarsip di
`docs/riwayat/sprint-4a/` pada branch yang belum-merge) plus **15–16** di sini. Enumerasi penuh
11–16 + reconciliation adalah tugas tersendiri dengan gate-nya sendiri.
