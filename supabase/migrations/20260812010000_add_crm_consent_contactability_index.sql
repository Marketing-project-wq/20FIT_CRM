-- ============================================================================
-- Migrasi 12 : indeks contactability untuk crm_consent
-- Tujuan     : Mempercepat jalur baca "bisa dihubungi" (dashboard + segment builder).
--              Sesudah Migrasi 11 (408.119 baris), hitung contactable tak-terbatas
--              melakukan Parallel Seq Scan atas crm_consent yang difilter
--              (purpose,status) — ~10–18 detik. Indeks ini mengubahnya jadi index
--              scan. Angka jawaban TIDAK berubah (82.253 per purpose) — hanya cepat.
-- Referensi  : lib/crm/contactability-read.ts (jalur baca yang dipercepat).
-- Reversible : YA — drop indeks, nol kehilangan data (ROLLBACK di bawah).
--
-- KENAPA BUKAN `CREATE INDEX CONCURRENTLY`:
--   apply_migration menjalankan DDL di dalam SATU transaksi; `CONCURRENTLY` menolak
--   jalan di dalam blok transaksi (SQLSTATE 25001) dan percobaan yang gagal
--   meninggalkan indeks INVALID. `CONCURRENTLY` gunanya menghindari kunci-tulis pada
--   tabel yang SIBUK; crm_consent nyaris tak pernah ditulis (hanya oleh backfill +
--   tulis consent yang jarang), jadi `CREATE INDEX` biasa — yang mengunci TULIS
--   beberapa detik saat membangun (~408k baris), baca tak terpengaruh — dapat
--   diterima, dan ledger tetap bersih. Keputusan tercatat di
--   docs/riwayat/KEPUTUSAN.md.
--
-- Bentuk indeks: (purpose, status) INCLUDE (customer_id). Filter jalur baca persis
--   (purpose,status); customer_id dibawa sebagai payload agar index-only scan bisa
--   memberi kunci semi-join tanpa menyentuh heap.
--
-- Catatan run: TIDAK otomatis. Dijalankan via apply_migration 2026-08-12.
-- ============================================================================

create index if not exists crm_consent_purpose_status_customer_idx
  on public.crm_consent (purpose, status) include (customer_id);

-- ROLLBACK (jalankan manual bila perlu membatalkan — nol kehilangan data):
-- drop index if exists public.crm_consent_purpose_status_customer_idx;
