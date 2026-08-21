-- ============================================================================
-- MIGRASI 23 · Satukan sumber identitas ke cermin — jalur (A+)
-- ----------------------------------------------------------------------------
-- Versi berkas          : 20260821060000  ·  Ledger Supabase (apply) : 20260821154415 (nama sama)
-- Nama ledger           : unify_identity_sources_aplus
-- DITERAPKAN            : 2026-08-21 ~15:44 UTC via apply_migration (Opsi B build-new-then-swap).
--   Terverifikasi: teks-diff pg_get_viewdef (HANYA baris flag berubah + 6 flag baru; kolom beku
--   byte-identik) · frozen identik (82.253 / fitco 67.653 / city 5.786 / ltv 1.112 / rfm_tanpa 1.332 /
--   engagement counts+sums) · REFRESH CONCURRENTLY 2,59 dtk (index unik ter-rename benar) · demografi
--   0→248 (gender 248, DOB 246) · NIK 0 · grant anon/authenticated=false, service_role=true.
--   CATATAN: query apply memangkas sebagian comment agar muat payload; SQL eksekutabel identik berkas ini.
--
-- KEPUTUSAN (prompt LANJUTAN-IDENTITAS, 2026-08-21): jalur (A+) = (A) flag per-sumber di
--   cermin + tabel kandidat milik CRM `crm_identity_candidate`. BUKAN (B): NOL tulisan ke
--   master_customer; penggabungan identitas = sprint tersendiri dengan desain dedup/merge.
--
-- APA YANG DILAKUKAN
--   §1 Tabel `crm_identity_candidate` (RLS ON, 0 policy — pola doctor_bookings). Menampung
--      identitas yang BELUM ada di pool, lintas 7 sumber, DEDUP (satu baris per orang).
--      BUKAN pool, BUKAN audiens, DILARANG dipakai kampanye/segmen/ekspor (lihat comment).
--   §2 Fungsi `crm_rebuild_identity_candidates()` — DELETE+INSERT idempoten, metode dedup
--      SAMA dengan peta A1 (bool_or(matched) per coalesce(email,telepon) ternormalisasi).
--   §3 Panggil sekali → mengisi 2.797 baris (angka A1 terverifikasi).
--   §4a/§4b Cermin `crm_customer_mirror` — OPSI B build-new-then-swap (matview tak bisa ALTER ADD
--      COLUMN): §4a bangun `crm_customer_mirror_v2` (21 kolom lama + 6 flag baru: has_event_txn,
--      has_ticket_participant, has_my20fit_buyer, has_uob, has_rc_participant, has_clinic_booking)
--      TANPA mengunci yang lama; §4b (setelah §5/§6) TUKAR: drop lama + rename v2 → nama kanonik +
--      rename 4 indeks. Blok pembaca menyusut dari ~45–80 dtk jadi ~milidetik. Grant _v2 SEBELUM
--      rename; index unik ada (syarat CONCURRENTLY). KANON EMAIL: semua subquery FLAG diseragamkan
--      ke normalize_email (K-35), telepon crm_norm_phone (K-06) — nilai identik (master bersih,
--      diverifikasi pra-apply). Join staging `st` TETAP lower(btrim) (jalur fitco/rfm/dob, bukan flag).
--      CATATAN: arena_bookings SUDAH tercakup has_arena — TIDAK diberi flag terpisah; celahnya
--      tetap terlihat lewat crm_identity_candidate.
--   §5 `crm_refresh_customer_mirror()` CREATE OR REPLACE — badan migrasi 18 VERBATIM + hitung
--      6 flag baru + blok `sources` (matched per-sumber dari FLAG cermin, bukan anti-join
--      master live — INVARIAN K-19) + blok `candidates` (total + per-sumber dari tabel
--      kandidat; itu tabel CRM statis, BUKAN sinyal eligibility → boleh dibaca di sini).
--   §6 A3: isi `crm_profile_demographic` (0 baris) untuk peserta tiket yang SUDAH di pool.
--      gender/DOB HANYA dari field eksplisit (rc_ticket_invites.form_data.participants[]),
--      provenance 'progressive_profiling'. TIDAK lewat crm_upsert_profile_demographic() —
--      fungsi itu mematok 'staff_entry' + menulis audit per baris (untuk edit admin, bukan
--      backfill massal). DOB dibatasi rentang waras (data mentah punya 0095-01-19 & 2026-…).
--   §7 Stempel ulang crm_mirror_meta.row_count (blok stats penuh diisi post-apply via
--      `select crm_refresh_customer_mirror();` — REFRESH CONCURRENTLY tak boleh dalam txn migrasi).
--
-- LARANGAN yang ditegakkan di sini
--   * NOL tulisan ke master_customer (grep buktinya: tak ada `master_customer` di sisi tulis).
--   * NIK / golongan darah / kontak darurat / waiver: NOL — tak diambil, tak disimpan, tak di
--     jsonb, tak di audit. Allowlist eksplisit: name/email/phone/gender/date_of_birth saja.
--   * Gender/DOB TIDAK diturunkan dari NIK (field eksplisit sudah ada & lebih baik; K-34).
--   * Tak ada baris crm_consent untuk kandidat — mereka kandidat, bukan audiens.
--
-- DAMPAK terukur (read-only, 2026-08-21, sebelum apply)
--   * crm_identity_candidate: 2.797 saat preview → 2.799 saat apply (drift +2: clinic_bookings 15→16,
--     uob_users 15→16 — 2 identitas baru di sumber hidup dalam ~40 mnt; unique index jamin nol duplikat).
--     Per sumber (prioritas, dedup): event_transaction 1.887 · rc_ticket_invites 329 · my20fit_buyers 543
--     · clinic_bookings 16 · uob_users 16 · arena_bookings 4 · rc_participants 4.
--   * crm_profile_demographic: 0 → 248 baris (gender 248, DOB 246 setelah batas waras;
--     2 DOB dibuang karena di luar rentang 1920..now-10th — data mentah 0095-01-19 & masa depan).
--     "Ratusan" ini RELATIF terhadap nol; sisanya (490 peserta tiket di luar pool) ada di
--     crm_identity_candidate, menunggu sprint penggabungan.
--   * Pool tetap 82.253. Cermin tetap 1:1 master_customer. 21 kolom lama: kolom BEKU byte-identik
--     (row/fitco/city/ltv/rfm/engagement); kolom HIDUP (has_arena 654→656, has_clinic 134→140) refresh
--     WAJAR. Diverifikasi lewat TEKS-DIFF pg_get_viewdef, bukan byte-fingerprint (rebuild matview = refresh
--     → nilai kolom hidup memang ikut segar; teks-diff yang benar untuk salah-transkripsi). K-35: kanon
--     email flag = normalize_email (5 flag lama + 6 baru); join staging `st` tetap lower(btrim) (jalur fitco).
--
-- ROLLBACK (batalkan penuh) — lihat blok di akhir berkas.
-- ============================================================================

-- Operasi besar (recreate matview 82k + backfill) bisa > 60 dtk (K-24). Naikkan timeout
-- server untuk transaksi migrasi ini; klien MCP boleh putus di 60 dtk — backend lanjut &
-- COMMIT (migrasi ATOMIK). Verifikasi lewat pg_stat_activity + hasil, JANGAN blind-retry.
set local statement_timeout = '15min';
-- §5 (refresh fn) di-CREATE SEBELUM swap §4b — saat itu crm_customer_mirror LAMA belum punya kolom
-- flag baru. plpgsql memvalidasi SQL tertanam saat EKSEKUSI (pasca-swap), bukan saat CREATE; matikan
-- check_function_bodies eksplisit sebagai sabuk-pengaman agar CREATE OR REPLACE tak menolak referensi.
set local check_function_bodies = off;


-- ── §1 · Tabel kandidat (RLS ON, 0 policy) ──────────────────────────────────
create table if not exists public.crm_identity_candidate (
  id                    uuid primary key default gen_random_uuid(),
  full_name             text,
  email_normalized      text,
  phone_normalized      text,
  gender                text check (gender is null or gender in ('male','female')),
  date_of_birth         date,
  gender_source         text,
  date_of_birth_source  text,
  source_table          text not null,
  source_ref            text,
  status                text not null default 'pending_review'
                          check (status in ('pending_review','dismissed','merged')),
  first_seen_at         timestamptz not null default now(),
  -- minimal satu jalur kontak; kunci identitas = coalesce(email, telepon)
  constraint crm_identity_candidate_has_contact
    check (email_normalized is not null or phone_normalized is not null)
);

-- Kunci dedup: satu baris per identitas (email ternormalisasi, atau telepon bila email kosong).
create unique index if not exists crm_identity_candidate_idkey_uidx
  on public.crm_identity_candidate ((coalesce(email_normalized, phone_normalized)));
create index if not exists crm_identity_candidate_source_idx
  on public.crm_identity_candidate (source_table);

-- RLS ON tanpa policy → hanya service_role (BYPASSRLS) yang melihat isinya; anon/authenticated
-- balik KOSONG tanpa error (pola doctor_bookings). Baca WAJIB lewat createAdminClient().
alter table public.crm_identity_candidate enable row level security;
revoke all on public.crm_identity_candidate from public, anon, authenticated;
grant select, insert, update, delete on public.crm_identity_candidate to service_role;

comment on table public.crm_identity_candidate is
  'KANDIDAT identitas yang BELUM ada di master_customer (pool), dikumpulkan lintas 7 sumber '
  '(event_transaction, rc_ticket_invites peserta, my20fit_buyers, uob_users, rc_participants, '
  'arena_bookings, clinic_bookings) lalu DEDUP (satu baris per orang, kunci coalesce(email,telepon) '
  'ternormalisasi). BUKAN pool. BUKAN audiens. DILARANG dipakai untuk segmen, kampanye, atau '
  'ekspor apa pun — tak ada baris crm_consent untuk mereka. Penggabungan ke master_customer '
  'adalah sprint tersendiri (desain dedup/merge); sampai itu, status=pending_review. Diisi/di-'
  'refresh oleh crm_rebuild_identity_candidates(). NOL sentuhan ke master_customer. gender/DOB '
  'HANYA dari field eksplisit peserta (progressive_profiling); NIK/golongan darah/kontak darurat '
  'TIDAK pernah masuk sini.';
comment on column public.crm_identity_candidate.source_table is
  'Sumber PRIORITAS tempat identitas ini pertama diklaim (event_transaction > rc_ticket_invites > '
  'my20fit_buyers > uob_users > rc_participants > clinic_bookings > arena_bookings). Satu orang '
  'bisa muncul di beberapa sumber; kolom ini menyimpan yang prioritasnya tertinggi. Jumlah per '
  'source_table menjumlah tepat ke total kandidat (dedup).';


-- ── §2 · Fungsi rebuild (idempoten, metode dedup = peta A1) ──────────────────
create or replace function public.crm_rebuild_identity_candidates()
 returns bigint
 language plpgsql
 security definer
 set search_path to 'public'
as $fn$
declare
  n bigint;
begin
  delete from public.crm_identity_candidate;

  insert into public.crm_identity_candidate
    (full_name, email_normalized, phone_normalized, gender, date_of_birth,
     gender_source, date_of_birth_source, source_table, source_ref, status, first_seen_at)
  with rows as (
    select 1 as pri, 'event_transaction' as src, et.id as ref, et.customer_name as nm,
           normalize_email(et.email) as ek, crm_norm_phone(et.phone) as pk,
           null::text as g, null::date as d
      from public.event_transaction et
    union all
    select 2, 'rc_ticket_invites', ti.id::text, elem->>'name',
           normalize_email(elem->>'email'), crm_norm_phone(elem->>'phone_number'),
           rc_norm_gender(elem->>'gender'),
           case when (elem->>'date_of_birth') ~ '^\d{4}-\d{2}-\d{2}$'
                     and (elem->>'date_of_birth')::date
                         between date '1920-01-01' and (current_date - interval '10 years')
                then (elem->>'date_of_birth')::date end
      from public.rc_ticket_invites ti,
           lateral jsonb_array_elements(ti.form_data->'participants') elem
     where ti.form_data ? 'participants'
    union all
    select 3, 'my20fit_buyers', mb.id::text, mb.display_name,
           normalize_email(mb.primary_email), crm_norm_phone(mb.primary_phone), null, null
      from public.my20fit_buyers mb
    union all
    select 4, 'uob_users', uu.id::text, uu.full_name,
           normalize_email(uu.email), crm_norm_phone(uu.phone), rc_norm_gender(uu.gender), null
      from public.uob_users uu
    union all
    select 5, 'rc_participants', rp.id::text, rp.name,
           normalize_email(rp.email), null, rc_norm_gender(rp.gender), null
      from public.rc_participants rp
    union all
    select 6, 'clinic_bookings', cb.id::text, cb.full_name,
           normalize_email(cb.email::text), crm_norm_phone(cb.phone::text), null, null
      from public.clinic_bookings cb
    union all
    select 7, 'arena_bookings', ab.id::text, ab.full_name,
           normalize_email(ab.email), crm_norm_phone(ab.phone), null, null
      from public.arena_bookings ab
  ),
  tagged as (
    select r.*, coalesce(r.ek, r.pk) as idkey,
      ( exists (select 1 from public.master_customer m where m.email_normalized = r.ek)
        or exists (select 1 from public.master_customer m where m.phone_normalized = r.pk)
      ) as matched
    from rows r
    where coalesce(r.ek, r.pk) is not null
  ),
  perid as (
    select
      idkey,
      bool_or(matched)                                     as any_matched,
      (array_agg(nm  order by pri))[1]                     as full_name,
      (array_remove(array_agg(ek order by pri), null))[1]  as email_normalized,
      (array_remove(array_agg(pk order by pri), null))[1]  as phone_normalized,
      (array_remove(array_agg(g  order by pri), null))[1]  as gender,
      (array_remove(array_agg(d  order by pri), null))[1]  as date_of_birth,
      (array_agg(src order by pri))[1]                     as source_table,
      (array_agg(ref order by pri))[1]                     as source_ref
    from tagged
    group by idkey
  )
  select
    full_name, email_normalized, phone_normalized, gender, date_of_birth,
    case when gender is not null then 'progressive_profiling' end,
    case when date_of_birth is not null then 'progressive_profiling' end,
    source_table, source_ref, 'pending_review', now()
  from perid
  where not any_matched;

  get diagnostics n = row_count;
  return n;
end;
$fn$;

revoke all on function public.crm_rebuild_identity_candidates() from public, anon, authenticated;
grant execute on function public.crm_rebuild_identity_candidates() to service_role;

comment on function public.crm_rebuild_identity_candidates() is
  'Bangun ulang crm_identity_candidate: kumpulkan 7 sumber, buang yang sudah di pool '
  '(bool_or(email/telepon cocok master_customer) per identitas — metode SAMA dengan peta A1, '
  'menghasilkan 2.797), dedup ke satu baris per coalesce(email,telepon). gender/DOB HANYA dari '
  'field eksplisit (provenance progressive_profiling); NIK tak pernah dibaca untuk turunan. '
  'DELETE+INSERT (MVCC-friendly, tanpa ACCESS EXCLUSIVE). NOL tulisan ke master_customer '
  '(hanya dibaca untuk anti-join). Panggil sesudah sumber berubah; belum dijadwalkan.';


-- ── §3 · Isi tabel kandidat sekali (≈2.797) ─────────────────────────────────
select public.crm_rebuild_identity_candidates();


-- ── §4a · Cermin: BUILD `_v2` lalu SWAP (Opsi B: build-new-then-swap) ───────
-- DROP/CREATE langsung → ACCESS EXCLUSIVE, pembaca cermin memblok ~45–80 dtk saat populate. Opsi B:
-- bangun crm_customer_mirror_v2 (TANPA mengunci yang lama — pembaca lanjut), lalu TUKAR di §4b
-- (drop lama + rename, ~milidetik). Kanon email diseragamkan ke normalize_email (K-35; = §6 & K-06);
-- tiap subquery email difilter `normalize_email(x) IS NOT NULL` agar IN tak berisi NULL (kalau tidak,
-- flag jadi NULL alih-alih false → nilai bergeser). Sisi master bersih → nilai 5 flag lama + is_fitco
-- WAJIB identik (diverifikasi pra-apply). Join staging `st` di bawah TETAP lower(btrim) — itu jalur
-- fitco/rfm/dob (bukan "flag"), verbatim, di luar cakupan K-35 (diangkat di gate).
create materialized view public.crm_customer_mirror_v2 as
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
    mc.email_normalized IS NOT NULL AND (mc.email_normalized IN ( SELECT normalize_email(cf_hyrox_participants.email)
           FROM cf_hyrox_participants
          WHERE normalize_email(cf_hyrox_participants.email) IS NOT NULL)) AS has_hyrox,
    mc.email_normalized IS NOT NULL AND (mc.email_normalized IN ( SELECT normalize_email(my20fit_profile.email)
           FROM my20fit_profile
          WHERE normalize_email(my20fit_profile.email) IS NOT NULL)) AS has_my20fit,
    mc.email_normalized IS NOT NULL AND (mc.email_normalized IN ( SELECT normalize_email(arena_class_bookings.email)
           FROM arena_class_bookings
          WHERE normalize_email(arena_class_bookings.email) IS NOT NULL
        UNION
         SELECT normalize_email(arena_bookings.email)
           FROM arena_bookings
          WHERE normalize_email(arena_bookings.email) IS NOT NULL
        UNION
         SELECT normalize_email(arena_package_orders.email)
           FROM arena_package_orders
          WHERE normalize_email(arena_package_orders.email) IS NOT NULL
        UNION
         SELECT normalize_email(arena_members.email)
           FROM arena_members
          WHERE normalize_email(arena_members.email) IS NOT NULL)) AS has_arena,
    mc.email_normalized IS NOT NULL AND (mc.email_normalized IN ( SELECT normalize_email(gym_class_bookings.email)
           FROM gym_class_bookings
          WHERE normalize_email(gym_class_bookings.email) IS NOT NULL
        UNION
         SELECT normalize_email(gym_memberships.email)
           FROM gym_memberships
          WHERE normalize_email(gym_memberships.email) IS NOT NULL
        UNION
         SELECT normalize_email(gym_membership_orders.email)
           FROM gym_membership_orders
          WHERE normalize_email(gym_membership_orders.email) IS NOT NULL)) AS has_gym,
    mc.phone_normalized IS NOT NULL AND (mc.phone_normalized IN ( SELECT crm_norm_phone(clinic_patients.phone::text)
           FROM clinic_patients
          WHERE clinic_patients.phone IS NOT NULL)) OR mc.email_normalized IS NOT NULL AND (mc.email_normalized IN ( SELECT normalize_email(clinic_patients.email::text)
           FROM clinic_patients
          WHERE normalize_email(clinic_patients.email::text) IS NOT NULL)) AS has_clinic,
    COALESCE(st.fitco_marker = 'Fitco User'::text, false) AS is_fitco_member_matched,
    -- BARU (Migrasi 23, jalur A+): flag per-sumber identitas yang baru disambungkan. Kanon email =
    -- normalize_email (K-35; = §6), telepon crm_norm_phone (K-06). arena_bookings TAK diberi flag —
    -- sudah tercakup has_arena. Nama jujur: "matched" = anggota pool yg juga di sumber.
    (mc.email_normalized IS NOT NULL AND mc.email_normalized IN ( SELECT normalize_email(event_transaction.email)
           FROM event_transaction WHERE normalize_email(event_transaction.email) IS NOT NULL))
      OR (mc.phone_normalized IS NOT NULL AND mc.phone_normalized IN ( SELECT crm_norm_phone(event_transaction.phone)
           FROM event_transaction WHERE event_transaction.phone IS NOT NULL)) AS has_event_txn,
    (mc.email_normalized IS NOT NULL AND mc.email_normalized IN ( SELECT normalize_email(elem.value ->> 'email')
           FROM rc_ticket_invites ti, LATERAL jsonb_array_elements(ti.form_data -> 'participants') elem
          WHERE ti.form_data ? 'participants' AND normalize_email(elem.value ->> 'email') IS NOT NULL))
      OR (mc.phone_normalized IS NOT NULL AND mc.phone_normalized IN ( SELECT crm_norm_phone(elem.value ->> 'phone_number')
           FROM rc_ticket_invites ti, LATERAL jsonb_array_elements(ti.form_data -> 'participants') elem
          WHERE ti.form_data ? 'participants' AND (elem.value ->> 'phone_number') IS NOT NULL)) AS has_ticket_participant,
    (mc.email_normalized IS NOT NULL AND mc.email_normalized IN ( SELECT normalize_email(my20fit_buyers.primary_email)
           FROM my20fit_buyers WHERE normalize_email(my20fit_buyers.primary_email) IS NOT NULL))
      OR (mc.phone_normalized IS NOT NULL AND mc.phone_normalized IN ( SELECT crm_norm_phone(my20fit_buyers.primary_phone)
           FROM my20fit_buyers WHERE my20fit_buyers.primary_phone IS NOT NULL)) AS has_my20fit_buyer,
    (mc.email_normalized IS NOT NULL AND mc.email_normalized IN ( SELECT normalize_email(uob_users.email)
           FROM uob_users WHERE normalize_email(uob_users.email) IS NOT NULL))
      OR (mc.phone_normalized IS NOT NULL AND mc.phone_normalized IN ( SELECT crm_norm_phone(uob_users.phone::text)
           FROM uob_users WHERE uob_users.phone IS NOT NULL)) AS has_uob,
    mc.email_normalized IS NOT NULL AND (mc.email_normalized IN ( SELECT normalize_email(rc_participants.email)
           FROM rc_participants WHERE normalize_email(rc_participants.email) IS NOT NULL)) AS has_rc_participant,
    (mc.phone_normalized IS NOT NULL AND mc.phone_normalized IN ( SELECT crm_norm_phone(clinic_bookings.phone::text)
           FROM clinic_bookings WHERE clinic_bookings.phone IS NOT NULL))
      OR (mc.email_normalized IS NOT NULL AND mc.email_normalized IN ( SELECT normalize_email(clinic_bookings.email::text)
           FROM clinic_bookings WHERE normalize_email(clinic_bookings.email::text) IS NOT NULL)) AS has_clinic_booking
   FROM master_customer mc
     LEFT JOIN ( SELECT lower(btrim(staging_20fit_data."Email")) AS em,
            max(staging_20fit_data."RFM per paid order") AS rfm,
            max(staging_20fit_data."Tgl / Tahun lahir") AS dob,
            max(staging_20fit_data."Fitco User") AS fitco_marker
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

-- Indeks _v2 — unique DULU (syarat REFRESH … CONCURRENTLY), dinamai _v2; §4b me-rename ke nama kanonik.
create unique index crm_customer_mirror_v2_customer_id_uidx on public.crm_customer_mirror_v2 using btree (customer_id);
create index crm_customer_mirror_v2_first_unit_idx on public.crm_customer_mirror_v2 using btree (first_unit);
create index crm_customer_mirror_v2_segment_idx    on public.crm_customer_mirror_v2 using btree (segment);
create index crm_customer_mirror_v2_city_idx       on public.crm_customer_mirror_v2 using btree (city);

-- Grant _v2 SEBELUM rename (matview tanpa RLS; grant satu-satunya perlindungan; grant ikut saat rename).
revoke all on public.crm_customer_mirror_v2 from public;
revoke all on public.crm_customer_mirror_v2 from anon;
revoke all on public.crm_customer_mirror_v2 from authenticated;
grant select on public.crm_customer_mirror_v2 to service_role;

comment on column public.crm_customer_mirror_v2.has_event_txn is
  'Anggota pool yang email/telepon-nya juga muncul di event_transaction (pembeli tiket event via '
  'Mayar). email normalize_email (K-35) OR telepon crm_norm_phone. "matched" = tercocokkan ke pool; '
  'pembeli yang BELUM di pool tak terwakili di sini (lihat crm_identity_candidate).';
comment on column public.crm_customer_mirror_v2.has_ticket_participant is
  'Anggota pool yang juga peserta di rc_ticket_invites.form_data.participants[] (mis. PLATAROX JHR). '
  'Dicocokkan via email/telepon peserta. Hanya keanggotaan; NIK/kesehatan tak pernah dibaca cermin.';
comment on column public.crm_customer_mirror_v2.has_my20fit_buyer is
  'Anggota pool yang juga di my20fit_buyers (primary_email/primary_phone). BEDA dari has_my20fit '
  '(itu my20fit_profile) — tabel & makna berbeda, jangan digabung.';
comment on column public.crm_customer_mirror_v2.has_uob is
  'Anggota pool yang juga di uob_users (email/telepon). Kolom uob_users.nik/gender TIDAK dibaca cermin.';
comment on column public.crm_customer_mirror_v2.has_rc_participant is
  'Anggota pool yang juga di rc_participants (email; tabel ini tak punya kolom telepon).';
comment on column public.crm_customer_mirror_v2.has_clinic_booking is
  'Anggota pool yang juga di clinic_bookings (telepon crm_norm_phone OR email). BEDA dari has_clinic '
  '(itu clinic_patients) — booking klinik ≠ pasien klinik.';


-- ── §5 · Refresh fn: badan migrasi 18 VERBATIM + 6 hitungan + sources/candidates ──
CREATE OR REPLACE FUNCTION public.crm_refresh_customer_mirror()
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  ts    timestamptz;
  n     bigint;
  stats jsonb;
begin
  -- CONCURRENTLY: terbukti jalan di plpgsql (uji 2026-08-18). Pembacaan matview tak memblok.
  refresh materialized view concurrently public.crm_customer_mirror;
  ts := now();

  -- Stats dari matview yang BARU di-refresh + staging beku + tabel kandidat CRM (statis).
  -- TANPA master_customer/consent/suppression live (K-19). Satu pass mir untuk semua filter.
  with mir as (
    select
      count(*)                                              as total,
      count(*) filter (where has_hyrox)                     as e_hyrox,
      count(*) filter (where has_my20fit)                   as e_my20fit,
      count(*) filter (where has_arena)                     as e_arena,
      count(*) filter (where has_gym)                       as e_gym,
      count(*) filter (where has_clinic)                    as e_clinic,
      count(*) filter (where has_event_txn)                 as e_event_txn,
      count(*) filter (where has_ticket_participant)        as e_ticket,
      count(*) filter (where has_my20fit_buyer)             as e_my20fit_buyer,
      count(*) filter (where has_uob)                       as e_uob,
      count(*) filter (where has_rc_participant)            as e_rc_participant,
      count(*) filter (where has_clinic_booking)            as e_clinic_booking,
      count(*) filter (where engagement_arena      > 0)     as g_arena,
      count(*) filter (where engagement_clinic     > 0)     as g_clinic,
      count(*) filter (where engagement_gym        > 0)     as g_gym,
      count(*) filter (where engagement_event      > 0)     as g_event,
      count(*) filter (where engagement_membership > 0)     as g_membership,
      count(*) filter (where is_fitco_member_matched)       as fitco_matched,
      count(*) filter (where staging_rfm is null or staging_rfm = '-') as rfm_tanpa
    from public.crm_customer_mirror
  ),
  rfmb as (
    -- buckets = label RFM nyata saja; NULL & '-' MASUK ke rfm.tanpa (K-08), tak pernah jadi bucket.
    select coalesce(
      jsonb_agg(jsonb_build_object('label', label, 'count', c) order by c desc, label),
      '[]'::jsonb
    ) as buckets
    from (
      select staging_rfm as label, count(*) as c
      from public.crm_customer_mirror
      where staging_rfm is not null and staging_rfm <> '-'
      group by staging_rfm
    ) g
  ),
  fitco as (
    select
      count(*)                                                                    as staging_rows,
      count(distinct lower(btrim("Email"))) filter
        (where "Email" is not null and btrim("Email") <> '')                      as staging_unique
    from public.staging_20fit_data
    where "Fitco User" = 'Fitco User'
  ),
  cand as (
    -- Kandidat belum-di-pool: total + per-sumber (dedup). Tabel CRM STATIS (di-rebuild
    -- terpisah), BUKAN sinyal eligibility live → boleh dibaca di sini tanpa melanggar K-19.
    select
      coalesce(sum(c), 0)::bigint                             as total,
      coalesce(jsonb_object_agg(source_table, c), '{}'::jsonb) as by_source
    from (
      select source_table, count(*) as c
      from public.crm_identity_candidate
      group by source_table
    ) s
  )
  select
    mir.total,
    jsonb_build_object(
      'ecosystem', jsonb_build_object(
        'hyrox', mir.e_hyrox, 'my20fit', mir.e_my20fit, 'arena', mir.e_arena,
        'gym', mir.e_gym, 'clinic', mir.e_clinic
      ),
      'engagement', jsonb_build_object(
        'arena', mir.g_arena, 'clinic', mir.g_clinic, 'gym', mir.g_gym,
        'event', mir.g_event, 'membership', mir.g_membership
      ),
      'fitco', jsonb_build_object(
        'matched',        mir.fitco_matched,
        'staging_rows',   fitco.staging_rows,
        'staging_unique', fitco.staging_unique,
        'unmatched',      fitco.staging_unique - mir.fitco_matched
      ),
      'rfm', jsonb_build_object(
        'tanpa',   mir.rfm_tanpa,
        'buckets', rfmb.buckets
      ),
      -- BARU (Migrasi 23): jangkauan per-sumber ke pool (matched, dari FLAG cermin — bukan
      -- anti-join master live). "belum di pool" = blok candidates (dedup, dari crm_identity_candidate).
      'sources', jsonb_build_object(
        'event_txn',          jsonb_build_object('matched', mir.e_event_txn),
        'ticket_participant', jsonb_build_object('matched', mir.e_ticket),
        'my20fit_buyer',      jsonb_build_object('matched', mir.e_my20fit_buyer),
        'uob',                jsonb_build_object('matched', mir.e_uob),
        'rc_participant',     jsonb_build_object('matched', mir.e_rc_participant),
        'clinic_booking',     jsonb_build_object('matched', mir.e_clinic_booking)
      ),
      'candidates', jsonb_build_object(
        'total',     cand.total,
        'by_source', cand.by_source
      )
    )
  into n, stats
  from mir, rfmb, fitco, cand;

  update public.crm_mirror_meta
     set refreshed_at    = ts,
         row_count       = n,
         dashboard_stats = stats
   where id;

  return ts;
end;
$function$;


-- ── §6 · A3 · Backfill demografi (peserta tiket yang SUDAH di pool) ─────────
-- Langsung INSERT (bukan crm_upsert_profile_demographic — itu mematok staff_entry + audit per
-- baris). provenance progressive_profiling; gender/DOB dari field eksplisit; DOB dibatasi waras.
insert into public.crm_profile_demographic
  (customer_id, gender, gender_source, date_of_birth, date_of_birth_source,
   birth_year, birth_year_source, updated_at)
with p as (
  select normalize_email(elem->>'email') as ek, crm_norm_phone(elem->>'phone_number') as pk,
         rc_norm_gender(elem->>'gender') as g,
         case when (elem->>'date_of_birth') ~ '^\d{4}-\d{2}-\d{2}$'
                   and (elem->>'date_of_birth')::date
                       between date '1920-01-01' and (current_date - interval '10 years')
              then (elem->>'date_of_birth')::date end as d
  from public.rc_ticket_invites ti,
       lateral jsonb_array_elements(ti.form_data->'participants') elem
  where ti.form_data ? 'participants'
),
-- Cocokkan lewat DUA equi-join terpisah (email, telepon) lalu UNION — bukan OR-join
-- (OR mematikan hash join → seq-scan berulang; SELECT ujinya timeout 60s).
matched as (
  select m.customer_id, p.g, p.d
  from p join public.master_customer m on m.email_normalized = p.ek
  where p.ek is not null
  union all
  select m.customer_id, p.g, p.d
  from p join public.master_customer m on m.phone_normalized = p.pk
  where p.pk is not null
),
agg as (
  select customer_id,
    (array_remove(array_agg(g), null))[1] as g,
    (array_remove(array_agg(d), null))[1] as d
  from matched
  group by customer_id
)
select
  agg.customer_id,
  agg.g, case when agg.g is not null then 'progressive_profiling' end,
  agg.d, case when agg.d is not null then 'progressive_profiling' end,
  case when agg.d is not null then extract(year from agg.d)::int end,
  case when agg.d is not null then 'progressive_profiling' end,
  now()
from agg
where agg.g is not null or agg.d is not null
on conflict (customer_id) do nothing;   -- tabel kosong pra-migrasi; DO NOTHING = idempoten aman


-- ── §4b · SWAP atomik: tukar _v2 → crm_customer_mirror (dalam transaksi migrasi tunggal) ────
-- Blok ACCESS EXCLUSIVE pada cermin LAMA dimulai DI SINI — bukan saat populate §4a. Karena §4a
-- (~40–75 dtk) tak menyentuh yang lama, pembaca cermin memblok hanya di jendela drop+rename ini
-- (~milidetik) + §7 (count ringan), bukan ~45–80 dtk. DROP + RENAME satu transaksi → tak pernah
-- ada saat `crm_customer_mirror` hilang bagi transaksi lain (DDL transaksional).
drop materialized view public.crm_customer_mirror;
alter materialized view public.crm_customer_mirror_v2 rename to crm_customer_mirror;
alter index crm_customer_mirror_v2_customer_id_uidx rename to crm_customer_mirror_customer_id_uidx;
alter index crm_customer_mirror_v2_first_unit_idx  rename to crm_customer_mirror_first_unit_idx;
alter index crm_customer_mirror_v2_segment_idx     rename to crm_customer_mirror_segment_idx;
alter index crm_customer_mirror_v2_city_idx        rename to crm_customer_mirror_city_idx;


-- ── §7 · Stempel ulang meta.row_count (blok stats penuh via refresh post-apply) ──
update public.crm_mirror_meta
   set refreshed_at = now(),
       row_count    = (select count(*) from public.crm_customer_mirror)
 where id;


-- ============================================================================
-- ROLLBACK (batalkan penuh — salin & jalankan bila perlu):
-- ----------------------------------------------------------------------------
--   -- A3: tabel demografi kosong pra-migrasi → hapus yang backfill ini isikan.
--   delete from public.crm_profile_demographic where gender_source = 'progressive_profiling';
--
--   -- Cermin: DROP + recreate versi 21-kolom (definisi migrasi 16/20260814040554) — ini MENGEMBALIKAN
--   -- kanon lower(btrim) pra-K-35 (revert penuh ke keadaan sebelum migrasi ini; disengaja). Lalu
--   -- CREATE OR REPLACE crm_refresh_customer_mirror() ke badan migrasi 18 (20260818041017)
--   -- (tanpa 6 hitungan & blok sources/candidates). Recreate 4 indeks + grant service_role.
--   drop materialized view if exists public.crm_customer_mirror_v2;   -- bila swap gagal di tengah
--   drop materialized view if exists public.crm_customer_mirror;
--   -- …(salin blok CREATE dari 20260814040554_add_is_fitco_member_matched…sql apa adanya)…
--   -- …(salin CREATE OR REPLACE FUNCTION crm_refresh_customer_mirror dari 20260818041017…sql)…
--
--   -- Kandidat:
--   drop function if exists public.crm_rebuild_identity_candidates();
--   drop table    if exists public.crm_identity_candidate;
--
--   -- lalu: select public.crm_refresh_customer_mirror();  -- kembalikan dashboard_stats ke bentuk lama
-- ============================================================================
