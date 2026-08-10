-- ============================================================================
-- Tabel      : crm_profile_demographic
-- Tujuan     : Lapisan KURASI demografis untuk master_customer (1:1). Terpisah
--              dari import mentah; menang saat terisi, fallback saat tidak.
-- Referensi  : PRD Bagian 8.7.
-- Reversible : YA — drop tabel (lihat ROLLBACK).
-- Dampak     : Nihil, aditif. FK cascade ke master_customer (referensi; tak
--              mengubahnya).
--
-- ARBITRASE DUA LAPIS (Q5-1) — ditulis sekali, dipatuhi selalu:
--   * master_customer            = lapisan IMPOR MENTAH. JANGAN diubah.
--   * crm_profile_demographic    = lapisan KURASI. MENANG saat keduanya terisi.
--   * NULL / baris tak ada di satelit = "BELUM DIKURASI" (bukan "tidak ada data")
--     → FALLBACK ke master_customer.
--   Baris hanya dibuat saat ada kurasi (BUKAN satu baris per profil), sesuai
--   realitas isi: plafon backfill DOB ~5.810 baris (<=7,06%), gender <=678 (<=0,82%).
--   Tabel ini kosong untuk mayoritas profil dalam waktu lama.
--
--   ATURAN BACA DITULIS SATU KALI (view / fungsi accessor), BUKAN coalesce() yang
--   diulang di tiap query — dilacak sebagai komitmen fase kode (lihat laporan).
--   Tanpa itu, kurasi hanya menambah kolom yang membingungkan.
--
-- Provenance (Q5-1): kolom *_source membedakan diisi-orangnya-sendiri vs
--   ditebak-dari-tabel-lain. Yang ditebak (backfill_*) TIDAK boleh dipakai untuk
--   keputusan yang menyentuh orangnya.
--
-- Catatan run: TIDAK dijalankan otomatis. Jalankan manual dalam SATU transaksi
--   setelah review. Kondisi terverifikasi 2026-08-10: nol tabel crm_*.
-- ============================================================================

create table public.crm_profile_demographic (
  -- 1:1; PK = customer_id. CASCADE (K-3): satelit tak bermakna tanpa induk; saat
  -- profil dihapus (hak hapus), kurasi ikut terhapus — benar untuk penghapusan.
  customer_id          uuid primary key
                         references public.master_customer (customer_id) on delete cascade,

  -- SEMUA nullable: sumber 0% terisi untuk gender/DOB/alamat. Tak ada NOT NULL,
  -- tak ada default yang mengarang data.
  gender               text,
  date_of_birth        date,

  -- Tahun lahir TERPISAH dari DOB (Q5-2): progressive profiling jauh lebih mungkin
  -- dapat tahun lahir daripada tanggal penuh; untuk segmentasi usia itu cukup.
  birth_year           integer
                         constraint crm_profile_demographic_birth_year_check
                         check (birth_year is null or birth_year between 1900 and 2100),

  address              text,
  city                 text,
  province             text,
  postal_code          text,

  -- Provenance untuk field yang menyentuh keputusan-ke-orang. Konvensi nilai:
  -- 'progressive_profiling' | 'staff_entry' | 'backfill_<sumber>'. backfill_* =
  -- ditebak dari tabel lain → JANGAN dipakai untuk keputusan yang menyentuh orangnya.
  gender_source        text
                         constraint crm_profile_demographic_gender_source_check
                         check (gender_source is null
                                or gender_source in ('progressive_profiling','staff_entry')
                                or left(gender_source, 9) = 'backfill_'),
  date_of_birth_source text
                         constraint crm_profile_demographic_dob_source_check
                         check (date_of_birth_source is null
                                or date_of_birth_source in ('progressive_profiling','staff_entry')
                                or left(date_of_birth_source, 9) = 'backfill_'),
  birth_year_source    text
                         constraint crm_profile_demographic_birth_year_source_check
                         check (birth_year_source is null
                                or birth_year_source in ('progressive_profiling','staff_entry')
                                or left(birth_year_source, 9) = 'backfill_'),

  updated_at           timestamptz not null default now()
);

comment on table public.crm_profile_demographic is
  'Lapisan KURASI demografis (1:1 master_customer). Kurasi MENANG saat terisi; NULL/absen = belum dikurasi -> fallback master_customer. Aturan baca ditulis SEKALI (view/accessor), bukan coalesce() berulang. master_customer JANGAN diubah. RLS ON tanpa policy.';

comment on column public.crm_profile_demographic.gender_source is
  'Provenance: progressive_profiling | staff_entry | backfill_<sumber>. backfill_* = ditebak dari tabel lain; TIDAK boleh dipakai untuk keputusan yang menyentuh orangnya.';

-- Pola wajib (mengikuti doctor_bookings): RLS ON, NOL policy — akses via service role.
alter table public.crm_profile_demographic enable row level security;

-- Indeks: hanya PK. Tabel kecil (hanya profil terkurasi, plafon beberapa ribu).
-- Belum ada query yang membenarkan indeks lain. Tidak menebak.

-- ROLLBACK (jalankan manual bila perlu membatalkan):
-- drop table if exists public.crm_profile_demographic;
