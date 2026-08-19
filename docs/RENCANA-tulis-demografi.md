# RENCANA — Jalur Tulis Demografi (GATED, menunggu konfirmasi)

> **Status: keputusan + SQL diajukan, BELUM diterapkan.** Sesuai TUGAS 3: tunjukkan pilihan,
> sajikan SQL kedua migrasi, lalu berhenti. Nol migrasi diterapkan, nol jalur tulis di-commit,
> sampai pemilik mengonfirmasi. Kondisi terverifikasi 2026-08-19: `crm_profile_demographic`
> **0 baris** sejak dibuat (Sprint 2B).

---

## Keputusan retensi — aksi audit `profile.demographic_updated`

**Masalah (kelima kalinya pola ini muncul).** Aksi audit untuk penyuntingan demografi jatuh
**di antara** allowlist operasional migrasi 8 (`profile.viewed`, `list.viewed`, `search.%`,
`login.%`) dan denylist kepatuhan (`consent.%`, `suppression.%`, `role.%`, `profile.deleted`,
`export.%`, `retention.%`). Empat kali sebelumnya (`quality.viewed`, `suppression.*`,
`segment.*`, `export.*`) selesai dengan memakai prefiks yang sudah ada.

**Fakta penting yang mengubah pilihan kali ini.** Pemangkas memakai **allowlist untuk
menghapus** — hanya empat kategori operasional yang dihapus; sisanya (`other`) **dipertahankan**.
Jadi `profile.demographic_updated` hari ini **tidak akan dipangkas** — tetapi dipertahankan
**karena kecelakaan** (jatuh ke `other`), bukan karena jaminan kepatuhan yang sadar. Bahayanya
halus: begitu seseorang kelak menambah `profile.%` ke allowlist ("kan cuma aksi profil"),
suntingan demografi **mendadak jadi bisa dipangkas** — dan denylist kepatuhan tidak akan
melindunginya, karena `profile.demographic_updated` tak ada di sana.

**PILIHAN: Opsi 2 — jadikan retensi eksplisit di denylist kepatuhan.** Penyuntingan data
pelanggan oleh staf adalah **kepatuhan**: orang perlu bisa menjawab "siapa mengubah data ini,
kapan" bertahun kemudian. Retensi tak boleh bergantung pada kebetulan jatuh ke `other`. Menambah
`profile.demographic_updated` (exact) ke denylist menjadikan perlindungannya (a) **disengaja**,
dan (b) **tahan terhadap suntingan allowlist di masa depan** (denylist adalah jaring pengaman
kedua). Ini bukan memakai prefiks lama — memakai `profile.%` salah (akan menyeret `profile.viewed`
yang justru operasional), dan membiarkannya di `other` menyerahkan bukti kepatuhan pada nasib.

**Konsekuensi Opsi 2 (K-09 — semua dalam SATU commit):**
1. Migrasi baru **B** yang `create or replace` `crm_purge_audit_log` dengan entri denylist baru.
2. `lib/crm/retention-policy.ts` — tambah `{ kind: "exact", value: "profile.demographic_updated" }`
   ke `COMPLIANCE_RULES`.
3. `lib/crm/retention-policy.parity.test.ts` — arahkan konstanta `MIGRATION` ke berkas migrasi B
   (migrasi 8 tetap historis, tak disentuh — sesuai komentar test itu sendiri).
4. Migrasi 8 **tidak diedit** (applied + historis). Berkasnya tetap; test paritas pindah ke B.

---

## Keputusan gerbang turunan NIK (TUGAS 2) — supaya tidak diputus diam-diam

**Pilihan: turunan NIK (gender + tanggal lahir + provinsi) IKUT digerbangi `profile.view_health`,
sama seperti NIK mentahnya. Demografi dari sumber lain (staging/master) TIDAK digerbangi.**

**Alasan.** Gerbang mengikuti **SUMBER**, bukan jenis field. Menggerbangi input (NIK) tetapi
membuka output turunannya (gender/DOB/provinsi) kepada peran tanpa view_health adalah **pintasan
lewat derivasi** — data yang tak boleh dilihat mentah bocor dalam bentuk olahan. Maka turunan
NIK mewarisi gerbang NIK. Sebaliknya, tanggal lahir dari `staging_20fit_data` berasal dari impor
marketing non-sensitif dan **tetap terbuka** (sudah begitu di ImportSection hari ini).

**Konsistensi dengan `hasClinicalCriteria`.** Filter segmen menggerbangi **hanya kriteria
klinik** (srcClinicPatient/srcClinicTxn/program klinik) — prinsipnya "gerbangi data dari sumber
sensitif (klinik)". Aturan di sini prinsip yang sama: gerbangi data dari sumber sensitif (NIK).
Gender/DOB **bukan** kriteria segmen, jadi tak ada konflik langsung; keduanya memakai prinsip
gerbang-ikut-sumber yang sama.

**Ini juga perilaku SAAT INI** (turunan NIK kini hanya tampil di blok view_health) — jadi
pilihan ini **mempertahankan** gerbang yang ada secara eksplisit, bukan melonggarkannya diam-diam.

**Saat NIK-DOB (digerbangi) dan staging-DOB (terbuka) berbeda:** tampilkan **keduanya beserta
asalnya** (aturan Sprint 3S) — tetapi baris NIK hanya dirender untuk peran view_health.

---

## Dua kategori (TUGAS 2 — desain IA)

- **Demografi** — identitas + kontak: gender, tanggal lahir (asal: NIK bila ada [gated] / staging
  / isian admin), kota·provinsi·alamat (master / staging / isian admin), kontak (master). Tiap
  field menyebut asalnya; isian admin ditandai dan **digabung** di atas sumber (master tetap
  read-only, tak pernah ditimpa).
- **Perilaku** — seluruh keikutsertaan: Ekosistem 20FIT, Sumber lain (Hyrox/my20fit/arena/gym/
  klinik + nama kelas TUGAS 4), Data impor, kelas.

Affordance isian admin (tombol "Lengkapi demografi") **menunggu jalur tulis di bawah**; sampai
migrasi A diterapkan, Demografi hanya menampilkan sumber baca yang sudah ada, tersusun ulang.

---

## Migrasi A — `crm_upsert_profile_demographic` (atomik + audit, K-14)

```sql
-- ============================================================================
-- Migrasi (baru) : crm_upsert_profile_demographic
-- Tujuan  : Jalur TULIS demografi pertama. Upsert crm_profile_demographic + audit
--           'profile.demographic_updated' ATOMIK dalam SATU transaksi (K-14).
-- KENAPA fungsi Postgres: PostgREST tak bisa membungkus dua INSERT/UPDATE ke tabel
--           berbeda dalam satu transaksi. Audit best-effort = bukti hilang diam-diam.
-- Sumber  : *_source WAJIB. Isian admin = 'manual_admin' pada TIAP field yang diisi,
--           agar bisa dibedakan dari 'nik_derived' / 'staging_import' selamanya.
--           (Skema hanya punya kolom _source untuk gender/DOB/birth_year — memang
--           ketiga field itu yang provenansinya ambigu; address/city/province/postal
--           tak punya _source di skema 2B.)
-- master_customer TETAP read-only: isian admin masuk crm_profile_demographic saja.
-- Audit metadata NON-PII: hanya NAMA field yang berubah, tanpa nilainya.
-- KEAMANAN: SECURITY DEFINER (menulis crm_audit_log RLS-ON append-only). EXECUTE
--           dicabut dari public/anon/authenticated; hanya service_role.
-- Aktor diteruskan pemanggil (server) — bukan current_user database.
-- ============================================================================

create or replace function public.crm_upsert_profile_demographic(
  p_customer_id   uuid,
  p_gender        text default null,
  p_date_of_birth date default null,
  p_birth_year    int  default null,
  p_address       text default null,
  p_city          text default null,
  p_province      text default null,
  p_postal_code   text default null,
  p_actor_id      uuid default null,
  p_actor_email   text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_changed text[] := '{}';
  v_audit_id bigint;
begin
  if p_customer_id is null then
    raise exception 'customer_id is required';
  end if;
  if not exists (select 1 from public.master_customer where customer_id = p_customer_id) then
    raise exception 'no such customer_id: %', p_customer_id;
  end if;
  if p_gender is not null and p_gender not in ('male','female') then
    raise exception 'gender must be male or female, got %', p_gender;
  end if;

  -- Upsert. COALESCE(existing) → hanya field yang diisi (non-null) yang berubah; sisanya
  -- dipertahankan. Field yang diisi menandai *_source='manual_admin'. Kumpulkan nama field
  -- yang benar-benar di-set (untuk metadata audit non-PII).
  if p_gender        is not null then v_changed := v_changed || 'gender'; end if;
  if p_date_of_birth is not null then v_changed := v_changed || 'date_of_birth'; end if;
  if p_birth_year    is not null then v_changed := v_changed || 'birth_year'; end if;
  if p_address       is not null then v_changed := v_changed || 'address'; end if;
  if p_city          is not null then v_changed := v_changed || 'city'; end if;
  if p_province      is not null then v_changed := v_changed || 'province'; end if;
  if p_postal_code   is not null then v_changed := v_changed || 'postal_code'; end if;

  if array_length(v_changed, 1) is null then
    raise exception 'no demographic field supplied to update';
  end if;

  insert into public.crm_profile_demographic as d (
    customer_id, gender, date_of_birth, birth_year, address, city, province, postal_code,
    gender_source, date_of_birth_source, birth_year_source, updated_at
  ) values (
    p_customer_id, p_gender, p_date_of_birth, p_birth_year, p_address, p_city, p_province, p_postal_code,
    case when p_gender        is not null then 'manual_admin' end,
    case when p_date_of_birth is not null then 'manual_admin' end,
    case when p_birth_year    is not null then 'manual_admin' end,
    now()
  )
  on conflict (customer_id) do update set
    gender        = coalesce(excluded.gender,        d.gender),
    date_of_birth = coalesce(excluded.date_of_birth, d.date_of_birth),
    birth_year    = coalesce(excluded.birth_year,    d.birth_year),
    address       = coalesce(excluded.address,       d.address),
    city          = coalesce(excluded.city,          d.city),
    province      = coalesce(excluded.province,      d.province),
    postal_code   = coalesce(excluded.postal_code,   d.postal_code),
    gender_source        = case when excluded.gender        is not null then 'manual_admin' else d.gender_source end,
    date_of_birth_source = case when excluded.date_of_birth is not null then 'manual_admin' else d.date_of_birth_source end,
    birth_year_source    = case when excluded.birth_year    is not null then 'manual_admin' else d.birth_year_source end,
    updated_at = now();

  -- Audit atomik (transaksi sama). metadata NON-PII: hanya NAMA field, tanpa nilai.
  insert into public.crm_audit_log
    (actor_id, actor_email, action, target_table, target_id, summary, metadata)
  values (
    p_actor_id, p_actor_email, 'profile.demographic_updated', 'crm_profile_demographic',
    p_customer_id::text,
    'Demografi profil dilengkapi manual oleh admin (' || array_length(v_changed,1) || ' field).',
    jsonb_build_object('fields', to_jsonb(v_changed), 'source', 'manual_admin')
  )
  returning id into v_audit_id;

  return jsonb_build_object('customer_id', p_customer_id, 'fields', to_jsonb(v_changed), 'audit_id', v_audit_id);
end;
$$;

comment on function public.crm_upsert_profile_demographic(uuid,text,date,int,text,text,text,text,uuid,text) is
  'Jalur tulis demografi ATOMIK (K-14): upsert crm_profile_demographic + audit profile.demographic_updated dalam satu transaksi. *_source=manual_admin pada field yang diisi. master_customer TIDAK ditimpa. Metadata audit non-PII (nama field saja). service_role only.';

revoke all on function public.crm_upsert_profile_demographic(uuid,text,date,int,text,text,text,text,uuid,text) from public, anon, authenticated;
grant execute on function public.crm_upsert_profile_demographic(uuid,text,date,int,text,text,text,text,uuid,text) to service_role;

-- ROLLBACK: drop function if exists public.crm_upsert_profile_demographic(uuid,text,date,int,text,text,text,text,uuid,text);
```

**Gerbang peran (RBAC).** Rute yang memanggil fungsi ini digerbangi aksi RBAC baru
**`profile.edit_demographic`** (bukan `profile.view_list`/`view_health` — menyunting ≠ membaca).
Ditambahkan ke matriks RBAC untuk peran yang boleh menyunting (mis. admin/super_admin), dan rute
**menolak** peran tanpa aksi itu (bukan diam-diam mengabaikan). Aksi ini perlu ditentukan bersama
matriks 17.2 — dicatat sebagai butir keputusan manusia.

---

## Migrasi B — `crm_purge_audit_log` (tambah denylist, Opsi 2)

`create or replace` fungsi migrasi 8 dengan **satu** tambahan di KEDUA blok `and not (…)`
(query hitung + query delete): `or action = 'profile.demographic_updated'`. Sisanya identik
verbatim dengan migrasi 8 (allowlist, dry_run default, disable/enable trigger, retention row).

```sql
-- Blok denylist (muncul dua kali — di SELECT count dan di DELETE) menjadi:
    and not (
      action like 'consent.%'
      or action like 'suppression.%'
      or action like 'role.%'
      or action = 'profile.deleted'
      or action = 'profile.demographic_updated'   -- BARU (Opsi 2): retensi kepatuhan eksplisit
      or action like 'export.%'
      or action like 'retention.%'
    );
```

Comment fungsi diperbarui menyebut `profile.demographic_updated` di daftar kepatuhan. Karena
aksi ini toh tak ada di allowlist, penambahan denylist **tidak mengubah perilaku hari ini** —
ia mengunci perlindungan agar tetap benar bila allowlist kelak disunting.

---

## Yang menunggu konfirmasi sebelum diterapkan

1. Setujui **Opsi 2** (retensi kepatuhan eksplisit) — atau minta Opsi 1 (prefiks lama) dengan
   konsekuensinya.
2. Setujui aksi RBAC **`profile.edit_demographic`** + peran mana yang memilikinya (matriks 17.2).
3. Setelah konfirmasi: terapkan migrasi A lalu B via `apply_migration` (BUKAN db push), perbarui
   `retention-policy.ts` + test paritas (K-09, satu commit), bangun rute tulis + affordance UI,
   catat K-decision, perbarui README ledger. Verifikasi: fungsi ada, grant terkunci, satu
   penyuntingan uji menulis satu baris demografi + satu baris audit yang bertahan pangkas.
