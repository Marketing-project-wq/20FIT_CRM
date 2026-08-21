-- ============================================================================
-- MIGRASI 16 · crm_customer_mirror — tambah kolom is_fitco_member_matched
-- ----------------------------------------------------------------------------
-- Versi ledger Supabase : 20260814040554
-- Nama ledger           : add_is_fitco_member_matched_to_crm_customer_mirror
-- Diterapkan            : 2026-08-14 lewat Supabase MCP apply_migration (satu gate)
--
-- SALINAN PERSIS SQL yang diterapkan (ledger 20260814040554), disalin verbatim dari PR #13
--   (branch claude/20fit-crm-sprint-1-67vvhs, docs/migrations-applied/). Di branch INI berkas
--   migrasi diletakkan di supabase/migrations/ berdampingan dengan migrasi 15 — konvensi branch
--   ini berbeda dari PR #13 (yang memakai docs/migrations-applied/). SUDAH di ledger Supabase —
--   JANGAN terapkan ulang; berkas ini adalah rekaman repo dari definisi cermin agar hidup di
--   repo, bukan hanya di ledger internal Supabase. Urut sesudah migrasi 15
--   (20260813091255 < 20260814040554): 15 membuat cermin 20 kolom (…has_clinic), 16 DROP+recreate
--   jadi 21 kolom (is_fitco_member_matched di posisi 21). CATATAN: prosa PR #13 sempat menyebut
--   "19 kolom lama / kolom ke-20" — salah hitung; SQL-nya (verbatim di bawah) selalu menghasilkan
--   21 kolom, dan DB live pun 21 (pg_attribute, terverifikasi 2026-08-19).
--
-- Metode  : Matview TAK bisa ALTER ADD COLUMN -> DROP + recreate. Definisi 19 kolom lama
--           disalin VERBATIM dari pg_get_viewdef (bukan diketik dari ingatan); satu-satunya
--           perubahan = max("Fitco User") di sub-query st + kolom is_fitco_member_matched.
-- Verifikasi: sidik jari sebelum/sesudah 13 angka — 12 identik, has_clinic 112->114 (drift
--           sumber clinic_patients sejak refresh terakhir, BUKAN salah transkripsi: recompute
--           independen = 114). is_fitco_member_matched = 67.653 (== acuan). Lihat LINIMASA.
-- Keamanan: Matview TANPA RLS — grant satu-satunya perlindungan; di-apply ulang di sini.
-- Rollback: DROP + recreate versi 19-kolom (lihat 20260813091255_create_crm_customer_mirror.sql).
-- ============================================================================

drop materialized view if exists public.crm_customer_mirror;   -- TANPA cascade: tripwire (dependensi terverifikasi = 0)

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
          WHERE clinic_patients.email IS NOT NULL AND clinic_patients.email::text ~~ '%@%'::text)) AS has_clinic,
    -- BARU (Migrasi 16): keanggotaan Fitco dari staging, dicocokkan via email.
    COALESCE(st.fitco_marker = 'Fitco User', false) AS is_fitco_member_matched
   FROM master_customer mc
     LEFT JOIN ( SELECT lower(btrim(staging_20fit_data."Email")) AS em,
            max(staging_20fit_data."RFM per paid order") AS rfm,
            max(staging_20fit_data."Tgl / Tahun lahir") AS dob,
            max(staging_20fit_data."Fitco User") AS fitco_marker   -- BARU: penanda Fitco (max: 'Fitco User' menang atas '-'/NULL)
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

-- Indeks — unique DULU (syarat REFRESH ... CONCURRENTLY manual), lalu tiga btree seperti semula.
create unique index crm_customer_mirror_customer_id_uidx on public.crm_customer_mirror using btree (customer_id);
create index crm_customer_mirror_first_unit_idx on public.crm_customer_mirror using btree (first_unit);
create index crm_customer_mirror_segment_idx    on public.crm_customer_mirror using btree (segment);
create index crm_customer_mirror_city_idx       on public.crm_customer_mirror using btree (city);

-- Grant — matview TANPA RLS; recreate mengembalikan default, jadi APPLY ULANG kunci keamanannya.
revoke all on public.crm_customer_mirror from public;
revoke all on public.crm_customer_mirror from anon;
revoke all on public.crm_customer_mirror from authenticated;
grant select on public.crm_customer_mirror to service_role;

-- Dua kolom, dua definisi tertulis (permintaan eksplisit: jangan substitusi).
comment on column public.crm_customer_mirror.is_fitco_member_matched is
  'Dari staging_20fit_data."Fitco User" = ''Fitco User'', dicocokkan ke master_customer via email lower(btrim). TERVERIFIKASI 2026-08-14: 74.914 baris "Fitco User" di staging (74.913 email unik); 67.653 COCOK ke master_customer; 7.260 TIDAK cocok (celah identity resolution — email staging tanpa padanan di master_customer). Nama pakai _matched karena cermin HANYA melihat 67.653 yang tercocokkan; 7.260 sisanya TAK terwakili di sini & cermin tak bisa memperbaikinya (temuan terpisah T-18). BUKAN engagement_membership.';

comment on column public.crm_customer_mirror.engagement_membership is
  'COUNT baris customer_engagement dengan unit=''membership'' untuk customer ini (angka, bukan boolean). Sumber & definisi BERBEDA dari is_fitco_member_matched (penanda Fitco dari staging). Dua kolom sengaja dipisah — jangan digabung/substitusi.';

-- Meta refresh-stamp. id BOOLEAN (single-row guard) -> where id, mengikuti crm_refresh_customer_mirror().
update public.crm_mirror_meta
   set refreshed_at = now(),
       row_count    = (select count(*) from public.crm_customer_mirror)
 where id;
