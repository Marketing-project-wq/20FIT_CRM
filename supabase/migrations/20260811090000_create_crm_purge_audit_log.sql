-- ============================================================================
-- Migrasi 8 : crm_purge_audit_log — kebijakan retensi audit log
-- Tujuan     : Fungsi pemangkas audit OPERASIONAL berumur > 90 hari, dengan entri
--              KEPATUHAN dikecualikan permanen.
-- Keputusan  : Jeff, disetujui 2026-08-10 — 90 hari untuk audit operasional; entri
--              kepatuhan dikecualikan permanen.
-- Referensi  : PRD 16.4 (record konsen dipertahankan sebagai bukti pemrosesan sah).
-- Reversible : Ya — drop function (lihat ROLLBACK). Tak mengubah tabel/data apa pun.
--
-- MENGAPA kategori kepatuhan DIKECUALIKAN (ditulis sebagai keputusan, bukan gaya):
--   crm_consent menyimpan CURRENT STATE saja; RIWAYAT-nya hidup di audit log — audit
--   log itulah bukti hukum dasar pemrosesan. Memangkas consent.* / suppression.* /
--   role.* / profile.deleted / export.* menghapus bukti yang justru diminta UU PDP &
--   PRD 16.4 untuk dipertahankan. Karena itu mereka TAK PERNAH dipangkas — bukan
--   "belum", tapi tidak akan.
--
-- DESAIN allowlist (bukan denylist) untuk yang BOLEH dihapus:
--   Fungsi hanya menghapus kategori yang SECARA EKSPLISIT boleh dipangkas
--   (profile.viewed, list.viewed, search.*, login.*). Kategori aksi baru yang belum
--   dikenal default DIPERTAHANKAN, bukan terhapus. Denylist kepatuhan tetap dipasang
--   sebagai jaring pengaman kedua, sehingga suntingan allowlist di masa depan tak
--   bisa tak sengaja menjaring kategori kepatuhan.
--
-- TRIGGER append-only: crm_audit_log_block_row_mutation menolak DELETE. Fungsi ini
--   MENONAKTIFKANNYA SECARA SENGAJA, memangkas, lalu MENYALAKANNYA kembali. Itu
--   perilaku yang diinginkan — pemangkasan harus jadi tindakan sadar, bukan diam-diam.
--
-- dry_run = true SEBAGAI DEFAULT: panggilan tanpa argumen HANYA melaporkan apa yang
--   akan dihapus; tidak menyentuh trigger, tidak menulis retention row, tidak menghapus.
--
-- TIDAK DIJADWALKAN. Tidak ada cron. Penjadwalan adalah keputusan terpisah setelah
--   tim melihat perilaku fungsi ini.
--
-- security definer: menonaktifkan/menyalakan trigger butuh kepemilikan tabel; fungsi
--   ini dieksekusi sebagai pemilik (postgres, pemilik crm_audit_log). search_path
--   dipatok ke public agar tak bisa dibajak lewat search_path.
-- ============================================================================

create or replace function public.crm_purge_audit_log(dry_run boolean default true)
returns table (
  was_dry_run   boolean, -- bukan "dry_run": nama itu dipakai parameter input (bentrok di PL/pgSQL)
  matched_count bigint,
  oldest        timestamptz,
  newest        timestamptz,
  purge_log_id  bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cutoff timestamptz := now() - interval '90 days';
  v_count  bigint;
  v_oldest timestamptz;
  v_newest timestamptz;
  v_log_id bigint;
begin
  -- Himpunan yang MEMENUHI SYARAT pangkas: umur > 90 hari, ADA di allowlist, dan
  -- BUKAN kategori kepatuhan (jaring pengaman kedua).
  select count(*), min(occurred_at), max(occurred_at)
    into v_count, v_oldest, v_newest
  from public.crm_audit_log
  where occurred_at < v_cutoff
    and (
      action = 'profile.viewed'
      or action = 'list.viewed'
      or action like 'search.%'
      or action like 'login.%'
    )
    and not (
      action like 'consent.%'
      or action like 'suppression.%'
      or action like 'role.%'
      or action = 'profile.deleted'
      or action like 'export.%'
      or action like 'retention.%'
    );

  v_count := coalesce(v_count, 0);

  -- DRY RUN (default): lapor saja. Tidak ada efek samping apa pun.
  if dry_run then
    return query select true, v_count, v_oldest, v_newest, null::bigint;
    return;
  end if;

  -- Tulis retention.purge_executed LEBIH DULU (INSERT diizinkan trigger). Ini bukti
  -- permanen bahwa pemangkasan dijalankan — dicatat SEBELUM baris mana pun dihapus.
  insert into public.crm_audit_log (actor_email, action, summary, metadata)
  values (
    'system:retention',
    'retention.purge_executed',
    format('Pemangkasan audit operasional: %s baris memenuhi syarat (rentang %s .. %s), cutoff %s.',
      v_count, v_oldest, v_newest, v_cutoff),
    jsonb_build_object(
      'rows_matched', v_count,
      'oldest', v_oldest,
      'newest', v_newest,
      'cutoff', v_cutoff,
      'dry_run', false
    )
  )
  returning id into v_log_id;

  -- Tidak ada yang dipangkas: cukup catatan eksekusi di atas, jangan sentuh trigger.
  if v_count = 0 then
    return query select false, 0::bigint, v_oldest, v_newest, v_log_id;
    return;
  end if;

  -- Menonaktifkan trigger append-only SECARA SENGAJA.
  alter table public.crm_audit_log disable trigger crm_audit_log_block_row_mutation;

  begin
    delete from public.crm_audit_log
    where occurred_at < v_cutoff
      and (
        action = 'profile.viewed'
        or action = 'list.viewed'
        or action like 'search.%'
        or action like 'login.%'
      )
      and not (
        action like 'consent.%'
        or action like 'suppression.%'
        or action like 'role.%'
        or action = 'profile.deleted'
        or action like 'export.%'
        or action like 'retention.%'
      )
      and id <> v_log_id; -- jangan pernah hapus baris retention yang baru ditulis
  exception when others then
    -- Apa pun yang gagal: NYALAKAN trigger lagi sebelum melempar ulang. (Transaksi
    -- akan rollback juga, tapi kita tak meninggalkan trigger mati pada jalur mana pun.)
    alter table public.crm_audit_log enable trigger crm_audit_log_block_row_mutation;
    raise;
  end;

  -- Nyalakan kembali — kembali sepenuhnya append-only.
  alter table public.crm_audit_log enable trigger crm_audit_log_block_row_mutation;

  return query select false, v_count, v_oldest, v_newest, v_log_id;
end;
$$;

comment on function public.crm_purge_audit_log(boolean) is
  'Retensi audit: pangkas audit OPERASIONAL >90 hari (allowlist: profile.viewed, list.viewed, search.*, login.*); kategori KEPATUHAN (consent.*/suppression.*/role.*/profile.deleted/export.*/retention.*) dikecualikan permanen. dry_run=true default (lapor saja). Menonaktifkan trigger append-only secara sengaja lalu menyalakannya kembali. TIDAK dijadwalkan. Keputusan Jeff 2026-08-10; PRD 16.4.';

-- ROLLBACK (jalankan manual bila perlu membatalkan):
-- drop function if exists public.crm_purge_audit_log(boolean);
