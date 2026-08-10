-- ============================================================================
-- Tabel      : crm_audit_log
-- Tujuan     : Jejak append-only "siapa melakukan apa, kapan, ke record mana".
--              Fondasi akuntabilitas; dirujuk semua tabel crm_* lain.
-- Referensi  : PRD Bagian 8.7; kebutuhan jejak pemrosesan UU PDP.
-- Reversible : YA — drop tabel (ikut men-drop trigger) lalu drop function.
-- Dampak     : Nihil, aditif. Satu tabel + satu function + dua trigger, semua
--              baru. TIDAK meng-ALTER apa pun. SENGAJA tanpa FK: baris audit
--              harus tetap utuh walau record yang diacunya (user/customer) kelak
--              dihapus — maka aktor & target disimpan sebagai soft reference.
--
-- Catatan retensi: trigger di bawah menolak DELETE (dan TRUNCATE). Konsekuensinya,
--   kebijakan retensi audit kelak TIDAK bisa dijalankan tanpa MENONAKTIFKAN trigger
--   ini secara sengaja lebih dulu. Itu perilaku yang diinginkan — sejarah tak boleh
--   terhapus diam-diam — tapi harus diketahui saat retensi diputuskan, bukan
--   ditemukan sebagai kejutan. (Kode retensi TIDAK ditulis di sini.)
--
-- Catatan run: TIDAK dijalankan otomatis. Jalankan manual dalam SATU transaksi
--   setelah review. Kondisi terverifikasi 2026-08-10: nol tabel crm_*.
-- ============================================================================

create table public.crm_audit_log (
  -- bigint identity: monotonic → PK sekaligus urutan kronologis (tak perlu indeks
  -- waktu terpisah). "generated always" menolak insert id manual.
  id           bigint generated always as identity primary key,

  occurred_at  timestamptz not null default now(),

  -- Aktor sebagai SOFT REF (tanpa FK): baris tetap menunjuk pelaku walau
  -- auth.users-nya dihapus. actor_id NULL = aksi sistem.
  actor_id     uuid,
  actor_email  text,

  -- Apa yang terjadi; konvensi "resource.verb" (mis. 'role.granted',
  -- 'consent.recorded'). text tanpa CHECK: kosakata aksi masih tumbuh.
  action       text not null,

  -- Target sebagai SOFT REF (tanpa FK). target_id text agar muat PK apa pun
  -- (uuid master_customer, bigint tabel lain) & selamat dari penghapusan target.
  target_table text,
  target_id    text,

  summary      text,
  metadata     jsonb
);

comment on table public.crm_audit_log is
  'Jejak audit append-only. RLS ON tanpa policy + trigger tolak UPDATE/DELETE/TRUNCATE. Tanpa FK (soft ref). PRD 8.7.';

comment on column public.crm_audit_log.actor_email is
  'Snapshot SENGAJA demi akuntabilitas pasca-hapus — bukan duplikasi. uuid yatim tak berguna saat investigasi, dan investigasi justru terjadi setelah pelakunya pergi.';

comment on column public.crm_audit_log.metadata is
  'Konteks NON-PII saja: jumlah baris terdampak, nama segmen, nilai lama/baru field non-sensitif. Identitas pelanggan diwakili target_id — JANGAN disalin ke sini. jsonb bebas di tabel audit adalah jalur bocor PII yang paling sering tak disadari, dan retensinya belum diputuskan.';

-- Append-only ditegakkan di level DB: bahkan service role tak bisa menulis ulang
-- sejarah tanpa sengaja menonaktifkan trigger ini lebih dulu.
create function public.crm_audit_log_no_mutate() returns trigger
  language plpgsql as $$
begin
  raise exception 'crm_audit_log bersifat append-only: % ditolak', tg_op;
end;
$$;

create trigger crm_audit_log_block_row_mutation
  before update or delete on public.crm_audit_log
  for each row execute function public.crm_audit_log_no_mutate();

create trigger crm_audit_log_block_truncate
  before truncate on public.crm_audit_log
  for each statement execute function public.crm_audit_log_no_mutate();

-- Pola wajib (mengikuti doctor_bookings): RLS ON, NOL policy — nol akses klien;
-- tulis (INSERT) hanya via service role di server.
alter table public.crm_audit_log enable row level security;

-- Indeks: PK (id) sudah melayani urutan kronologis. Tambah SATU indeks untuk
-- tujuan inti tabel — "riwayat sebuah record" — yakni pencarian per target.
-- Tidak menambah indeks atas actor_id/action sampai ada query nyata.
create index crm_audit_log_target_idx
  on public.crm_audit_log (target_table, target_id);

-- ROLLBACK (jalankan manual bila perlu membatalkan):
-- drop table if exists public.crm_audit_log;            -- ikut men-drop kedua trigger & indeks
-- drop function if exists public.crm_audit_log_no_mutate();
