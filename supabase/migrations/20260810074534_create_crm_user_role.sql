-- ============================================================================
-- Tabel      : crm_user_role
-- Tujuan     : Memetakan setiap auth.users ke satu peran RBAC CRM (fondasi RBAC).
-- Referensi  : PRD Bagian 5 (daftar peran) dan Bagian 17 (matriks izin).
-- Reversible : YA — drop tabel (lihat blok ROLLBACK di bawah).
-- Dampak     : Nihil, aditif. Membuat satu tabel baru public.crm_user_role.
--              Tidak meng-ALTER apa pun. FK ke auth.users(id) hanya referensi
--              (membaca), tak mengubah auth.users.
--
-- Catatan run: TIDAK dijalankan otomatis. Jalankan manual dalam SATU transaksi
--   (default di Supabase SQL editor & `supabase db push`) setelah review.
--   Dibuat atas kondisi terverifikasi 2026-08-10: nol tabel crm_*.
-- ============================================================================

create table public.crm_user_role (
  -- Satu peran per user: user_id sebagai PK menjamin keunikan (tak ada baris ganda).
  user_id    uuid primary key references auth.users (id) on delete cascade,

  -- Peran RBAC (PRD Bagian 5). Sengaja text + CHECK, BUKAN enum: daftar peran
  -- berasal dari PRD yang masih "Draft for Review" — himpunannya belum tetap.
  -- CHECK bisa diubah lewat migrasi biasa (alter ... drop/add constraint);
  -- nilai enum tak bisa dihapus tanpa membuat ulang type — mahal di DB bersama.
  role       text not null
               constraint crm_user_role_role_check
               check (role in (
                 'super_admin',
                 'crm_manager',
                 'crm_operator',
                 'unit_manager',
                 'analyst',
                 'data_steward'
               )),

  -- Governance: siapa memberi peran & kapan. granted_by NULL untuk super_admin
  -- bootstrap (tak ada pemberi). on delete set null: bila pemberi dihapus, baris
  -- peran tetap ada (jangan kehilangan akses hanya karena admin lama pergi).
  granted_by uuid references auth.users (id) on delete set null,
  granted_at timestamptz not null default now()
);

comment on table public.crm_user_role is
  'RBAC: satu peran per auth.users. RLS ON tanpa policy; akses hanya via service role server-side. PRD 5/17.';

-- Pola wajib (mengikuti doctor_bookings): RLS ON, NOL policy.
-- Tanpa policy, klien anon/authenticated TIDAK bisa membaca tabel ini; seluruh
-- baca/tulis peran lewat service role (lib/supabase/admin.ts) di server.
alter table public.crm_user_role enable row level security;

-- Indeks: hanya PK (otomatis atas user_id). Tabel sekecil jumlah staf; belum ada
-- query yang membenarkan indeks tambahan (mis. atas role). Tidak menebak indeks.

-- ROLLBACK (jalankan manual bila perlu membatalkan):
-- drop table if exists public.crm_user_role;
