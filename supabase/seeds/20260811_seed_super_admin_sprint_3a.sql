-- ============================================================================
-- Seed       : Dua super_admin bootstrap (Sprint 3A)
-- Tujuan     : Memberi peran super_admin ke tifany@20fit.id dan marketing@20fit.id
--              agar RBAC punya identitas awal. Tanpa ini, RBAC fail-closed mengunci
--              SEMUA orang (getCurrentUserRole -> null untuk semua). PRD 5/17.
-- Jenis      : DATA, bukan skema — karena itu di supabase/seeds/, BUKAN migrations/.
-- Reversible : Ya untuk baris peran (delete crm_user_role). Baris audit TIDAK bisa
--              dihapus (append-only by design) — itu memang tujuannya.
--
-- PRASYARAT MANUAL: kedua user harus SUDAH dibuat di Supabase Auth (Add user +
--   Auto Confirm) lebih dulu. crm_user_role.user_id ber-FK ke auth.users(id);
--   tanpa baris auth, seed ini tidak memberi peran ke user itu (dan tidak error —
--   CTE hanya memproses email yang ketemu).
--
-- IDEMPOTEN: aman dijalankan ulang. crm_user_role.user_id adalah PK; ON CONFLICT
--   DO NOTHING. Baris audit HANYA ditulis untuk peran yang BENAR-BENAR baru
--   di-insert (RETURNING), jadi menjalankan ulang tidak menggandakan jejak audit.
--
-- Dijalankan dalam SATU transaksi: peran + audit menyatu. Bila salah satu gagal,
--   keduanya batal — tidak ada peran tanpa jejak, tidak ada jejak tanpa peran.
--
-- CATATAN RISIKO (diangkat ke Jeff, diterima): marketing@20fit.id kemungkinan
--   mailbox BERSAMA. Semua tindakannya tercatat sebagai satu identitas di audit log,
--   sehingga pelaku individual tak bisa dibedakan. Ini melemahkan akuntabilitas untuk
--   peran ber-izin tertinggi. Dicatat sebagai risiko yang diterima, bukan bug seed ini.
-- ============================================================================

begin;

with target as (
  -- Cari user_id dari email — JANGAN hardcode uuid. Hanya email yang benar-benar
  -- ada di auth.users yang diproses.
  select id as user_id, email
  from auth.users
  where email in ('tifany@20fit.id', 'marketing@20fit.id')
),
granted as (
  insert into public.crm_user_role (user_id, role, granted_by, granted_at)
  select user_id, 'super_admin', null, now()  -- granted_by NULL: bootstrap, tak ada pemberi manusia
  from target
  on conflict (user_id) do nothing
  returning user_id
)
insert into public.crm_audit_log
  (actor_id, actor_email, action, target_table, target_id, summary, metadata)
select
  null,                       -- aksi sistem, bukan aktor manusia
  'system:seed',              -- snapshot aktor untuk akuntabilitas
  'role.granted',
  'crm_user_role',
  g.user_id::text,
  'Seed awal Sprint 3A: pemberian peran super_admin bootstrap untuk ' || t.email
    || '. granted_by NULL karena tidak ada pemberi manusia (bootstrap RBAC).',
  -- metadata: NON-PII saja (peran + penanda seed). Identitas diwakili target_id/summary.
  jsonb_build_object('role', 'super_admin', 'seed', 'sprint-3a')
from granted g
join target t on t.user_id = g.user_id;

commit;

-- Verifikasi (jalankan setelah commit):
--   select user_id, role, granted_by, granted_at from public.crm_user_role;
--   select id, actor_email, action, target_table, target_id, summary
--     from public.crm_audit_log where action = 'role.granted' order by id;
-- Harapan: dua baris crm_user_role (super_admin), dua baris role.granted.
