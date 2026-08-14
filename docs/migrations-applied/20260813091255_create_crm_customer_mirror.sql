-- ============================================================================
-- MIGRASI 15 · crm_customer_mirror — matview cermin + meta + fungsi refresh
-- ----------------------------------------------------------------------------
-- Versi ledger Supabase : 20260813091255
-- Nama ledger           : create_crm_customer_mirror
-- Diterapkan            : 2026-08-13 09:12:55 lewat Supabase MCP apply_migration
--
-- ⚠️ REKONSTRUKSI, BUKAN BERKAS ASLI. SQL migrasi 15 yang asli TIDAK PERNAH di-commit
--   ke repo (diterapkan langsung ke DB). Berkas ini DIREKONSTRUKSI dari katalog hidup
--   pada 2026-08-14 — matview via pg_get_viewdef, indeks via pg_get_indexdef, fungsi via
--   pg_get_functiondef, tabel meta & ACL via information_schema/pg_catalog. Menjalankannya
--   di DB kosong menghasilkan objek YANG SAMA, tapi teks komentar/urutan bisa berbeda dari
--   yang aslinya ditulis. Dipertahankan agar definisi cermin hidup di repo (lihat README di
--   folder ini + supabase/migrations/README.md soal kenapa tidak di supabase/migrations/).
--
-- Objek yang dibuat: (1) tabel crm_mirror_meta, (2) matview crm_customer_mirror [19 kolom,
--   PRA-Fitco], (3) 4 indeks, (4) grant matview, (5) fungsi crm_refresh_customer_mirror(),
--   (6) grant fungsi, (7) seed baris meta. Migrasi 16 kemudian menambah kolom ke-20
--   is_fitco_member_matched (DROP+recreate).
-- ============================================================================

-- (1) Tabel meta — satu baris (id boolean CHECK(id) = penjaga baris tunggal).
create table if not exists public.crm_mirror_meta (
  id           boolean primary key default true,
  refreshed_at timestamptz not null default now(),
  row_count    bigint,
  constraint crm_mirror_meta_id_check check (id)
);

-- (2) Matview cermin — VERSI 19 KOLOM (pra-Fitco). Disalin verbatim dari pg_get_viewdef
--     kondisi pra-migrasi-16. Migrasi 16 menambahkan is_fitco_member_matched.
create materialized view public.crm_customer_mirror as
 SELECT mc.customer_id,
    mc.full_name,
    mc.phone_normalized,
    mc.email_normalized,
    mc.city,
    mc.first_unit,
    mc.segment,
    mc.lifetime_value,
    st.rfm AS staging_rfm,
    st.dob AS staging_dob,
    COALESCE(eng.arena_count, 0::bigint) AS engagement_arena,
    COALESCE(eng.clinic_count, 0::bigint) AS engagement_clinic,
    COALESCE(eng.gym_count, 0::bigint) AS engagement_gym,
    COALESCE(eng.event_count, 0::bigint) AS engagement_event,
    COALESCE(eng.membership_count, 0::bigint) AS engagement_membership,
    mc.email_normalized IS NOT NULL AND (mc.email_normalized IN ( SELECT lower(btrim(cf_hyrox_participants.email)) AS lower
           FROM cf_hyrox_participants
          WHERE cf_hyrox_participants.email IS NOT NULL)) AS has_hyrox,
    mc.email_normalized IS NOT NULL AND (mc.email_normalized IN ( SELECT lower(btrim(my20fit_profile.email)) AS lower
           FROM my20fit_profile
          WHERE my20fit_profile.email IS NOT NULL)) AS has_my20fit,
    mc.email_normalized IS NOT NULL AND (mc.email_normalized IN ( SELECT lower(btrim(arena_class_bookings.email)) AS lower
           FROM arena_class_bookings
          WHERE arena_class_bookings.email IS NOT NULL
        UNION
         SELECT lower(btrim(arena_bookings.email)) AS lower
           FROM arena_bookings
          WHERE arena_bookings.email IS NOT NULL
        UNION
         SELECT lower(btrim(arena_package_orders.email)) AS lower
           FROM arena_package_orders
          WHERE arena_package_orders.email IS NOT NULL
        UNION
         SELECT lower(btrim(arena_members.email)) AS lower
           FROM arena_members
          WHERE arena_members.email IS NOT NULL)) AS has_arena,
    mc.email_normalized IS NOT NULL AND (mc.email_normalized IN ( SELECT lower(btrim(gym_class_bookings.email)) AS lower
           FROM gym_class_bookings
          WHERE gym_class_bookings.email IS NOT NULL
        UNION
         SELECT lower(btrim(gym_memberships.email)) AS lower
           FROM gym_memberships
          WHERE gym_memberships.email IS NOT NULL
        UNION
         SELECT lower(btrim(gym_membership_orders.email)) AS lower
           FROM gym_membership_orders
          WHERE gym_membership_orders.email IS NOT NULL)) AS has_gym,
    mc.phone_normalized IS NOT NULL AND (mc.phone_normalized IN ( SELECT crm_norm_phone(clinic_patients.phone::text) AS crm_norm_phone
           FROM clinic_patients
          WHERE clinic_patients.phone IS NOT NULL)) OR mc.email_normalized IS NOT NULL AND (mc.email_normalized IN ( SELECT lower(btrim(clinic_patients.email::text)) AS lower
           FROM clinic_patients
          WHERE clinic_patients.email IS NOT NULL AND clinic_patients.email::text ~~ '%@%'::text)) AS has_clinic
   FROM master_customer mc
     LEFT JOIN ( SELECT lower(btrim(staging_20fit_data."Email")) AS em,
            max(staging_20fit_data."RFM per paid order") AS rfm,
            max(staging_20fit_data."Tgl / Tahun lahir") AS dob
           FROM staging_20fit_data
          WHERE staging_20fit_data."Email" IS NOT NULL AND btrim(staging_20fit_data."Email") <> ''::text
          GROUP BY (lower(btrim(staging_20fit_data."Email")))) st ON st.em = mc.email_normalized
     LEFT JOIN ( SELECT customer_engagement.customer_id,
            count(*) FILTER (WHERE customer_engagement.unit = 'arena'::text) AS arena_count,
            count(*) FILTER (WHERE customer_engagement.unit = 'clinic'::text) AS clinic_count,
            count(*) FILTER (WHERE customer_engagement.unit = 'gym'::text) AS gym_count,
            count(*) FILTER (WHERE customer_engagement.unit = 'event'::text) AS event_count,
            count(*) FILTER (WHERE customer_engagement.unit = 'membership'::text) AS membership_count
           FROM customer_engagement
          GROUP BY customer_engagement.customer_id) eng ON eng.customer_id = mc.customer_id;

-- (3) Indeks — unique customer_id (syarat REFRESH CONCURRENTLY manual) + tiga btree.
create unique index crm_customer_mirror_customer_id_uidx on public.crm_customer_mirror using btree (customer_id);
create index crm_customer_mirror_first_unit_idx on public.crm_customer_mirror using btree (first_unit);
create index crm_customer_mirror_segment_idx    on public.crm_customer_mirror using btree (segment);
create index crm_customer_mirror_city_idx       on public.crm_customer_mirror using btree (city);

-- (4) Grant matview — TANPA RLS; grant satu-satunya perlindungan.
revoke all on public.crm_customer_mirror from public;
revoke all on public.crm_customer_mirror from anon;
revoke all on public.crm_customer_mirror from authenticated;
grant select on public.crm_customer_mirror to service_role;

-- (5) Fungsi refresh — SECURITY DEFINER, REFRESH biasa (bukan CONCURRENTLY), stamp meta
--     dalam pemanggilan yang sama. Disalin verbatim dari pg_get_functiondef.
CREATE OR REPLACE FUNCTION public.crm_refresh_customer_mirror()
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  ts timestamptz;
  n  bigint;
begin
  refresh materialized view public.crm_customer_mirror;
  ts := now();
  select count(*) into n from public.crm_customer_mirror;
  update public.crm_mirror_meta set refreshed_at = ts, row_count = n where id;
  return ts;
end;
$function$;

-- (6) Grant fungsi — K-15: fungsi baru auto-dapat EXECUTE anon; wajib cabut + grant service_role.
revoke all on function public.crm_refresh_customer_mirror() from public;
revoke all on function public.crm_refresh_customer_mirror() from anon;
revoke all on function public.crm_refresh_customer_mirror() from authenticated;
grant execute on function public.crm_refresh_customer_mirror() to service_role;

-- (7) Seed baris meta (fungsi refresh meng-UPDATE where id, jadi baris harus ada dulu).
insert into public.crm_mirror_meta (id, refreshed_at, row_count)
  values (true, now(), (select count(*) from public.crm_customer_mirror))
  on conflict (id) do update
    set refreshed_at = excluded.refreshed_at,
        row_count    = excluded.row_count;
