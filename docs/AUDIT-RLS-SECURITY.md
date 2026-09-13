# AUDIT RLS & KEAMANAN AKSES DATABASE — 20FIT CRM

> **Tanggal audit:** 13 September 2026
> **Cakupan:** Semua tabel CRM di Supabase PostgreSQL
> **Status:** P0-6 SELESAI (13 Sep 2026) — lihat §C.2

---

## Ringkasan Eksekutif

Sistem CRM memiliki **dua postur keamanan** yang berbeda tajam:

1. **Tabel `crm_*` (20+ tabel)** — **AMAN.** RLS ON, nol policy, nol grant ke anon/authenticated.
   Hanya `service_role` (bypass RLS) yang bisa baca/tulis. Semua akses aplikasi lewat
   `createAdminClient()` (service role) di server-side. Anon dan authenticated tidak bisa
   mengakses tabel-tabel ini sama sekali.

2. **Tabel warisan `master_customer` & `customer_engagement`** — **SELESAI (13 Sep 2026).**
   Policy `authenticated_full_access` telah di-DROP, grant anon/authenticated telah di-REVOKE,
   grant eksplisit ke service_role telah diberikan. Kedua tabel sekarang mengikuti pola
   doctor_bookings: RLS ON, 0 policy, hanya service_role yang bisa akses.
   Lihat `sql/20260913_fix_rls_master_customer_engagement.sql`.

**Kabar baiknya:** kode aplikasi CRM **tidak pernah** mengekspos client-auth Supabase ke
operasi CRM. Semua baca/tulis data CRM melalui `createAdminClient()` (service role) di
server-side. Browser client (`createBrowserClient`) hanya dipakai untuk auth (login/logout/
reset password). **Risiko bukan dari kode CRM, tapi dari akses langsung authenticated user
ke Supabase API (PostgREST/realtime) menggunakan anon key + auth token.**

---

## A. Inventarisasi RLS Policies — Semua Tabel CRM

### A.1 Tabel Warisan (MASALAH KEAMANAN)

| Tabel | RLS | Policy | Operation | USING | WITH CHECK | Risiko |
|---|---|---|---|---|---|---|
| `master_customer` | ON | ~~`authenticated_full_access`~~ DI-DROP 13 Sep | — | — | — | **SELESAI** — policy dihapus, grant dicabut, service_role di-grant eksplisit |
| `customer_engagement` | ON | ~~`authenticated_full_access`~~ DI-DROP 13 Sep | — | — | — | **SELESAI** — policy dihapus, grant dicabut, service_role di-grant eksplisit |

**Status 13 Sep 2026:** Policy telah di-DROP, grant telah di-REVOKE, service_role di-GRANT
eksplisit. Kedua tabel sekarang default-deny untuk anon/authenticated, sama seperti tabel
`crm_*`. Lihat `sql/20260913_fix_rls_master_customer_engagement.sql`.

### A.2 Tabel CRM Baru — Postur "doctor_bookings" (AMAN)

Semua tabel `crm_*` mengikuti pola: **RLS ON, nol policy, nol grant ke anon/authenticated.**
Tanpa policy, RLS default-deny: bahkan jika ada grant, akses ditolak. Service role (`BYPASSRLS`)
adalah satu-satunya yang bisa mengakses.

| Tabel | RLS | Policies | Grants anon/auth | Grants service_role | Status |
|---|---|---|---|---|---|
| `crm_user_role` | ON | 0 | REVOKED (migrasi 48) | SELECT, INSERT, UPDATE, DELETE | **Aman** |
| `crm_audit_log` | ON | 0 | REVOKED (migrasi 48) | SELECT, INSERT (+ trigger tolak UPDATE/DELETE/TRUNCATE) | **Aman** |
| `crm_consent` | ON | 0 | REVOKED (migrasi 48) | SELECT, INSERT, UPDATE | **Aman** |
| `crm_suppression` | ON | 0 | REVOKED (migrasi 48) | SELECT, INSERT, UPDATE | **Aman** |
| `crm_profile_demographic` | ON | 0 | REVOKED (migrasi 48) | SELECT, INSERT, UPDATE | **Aman** |
| `crm_profile_behavior` | ON | 0 | REVOKED (migrasi 48) | SELECT, INSERT, UPDATE | **Aman** |
| `crm_profile_scores` | ON | 0 | REVOKED (migrasi 48) | SELECT, INSERT, UPDATE | **Aman** |
| `crm_message_log` | ON | 0 | Tidak pernah diberikan | SELECT, INSERT, UPDATE | **Aman** |
| `crm_message_template` | ON | 0 | Tidak pernah diberikan | SELECT, INSERT, UPDATE | **Aman** |
| `crm_segment` | ON | 0 | Tidak pernah diberikan | SELECT, INSERT, UPDATE | **Aman** |
| `crm_campaign_run` | ON | 0 | Tidak pernah diberikan | SELECT, INSERT, UPDATE | **Aman** |
| `crm_send_config` | ON | 0 | Tidak pernah diberikan | SELECT, UPDATE | **Aman** |
| `crm_workflow` | ON | 0 | Tidak pernah diberikan | SELECT, INSERT, UPDATE | **Aman** |
| `crm_workflow_enrollment` | ON | 0 | Tidak pernah diberikan | SELECT, INSERT, UPDATE | **Aman** |
| `crm_brand_asset` | ON | 0 | Tidak pernah diberikan | SELECT, INSERT, UPDATE | **Aman** |
| `crm_scheduled_send` | ON | 0 | Tidak pernah diberikan | SELECT, INSERT, UPDATE | **Aman** |
| `crm_identity_candidate` | ON | 0 | Tidak pernah diberikan | SELECT, INSERT, DELETE | **Aman** |
| `crm_email_unsubscribe` | ON | 0 | Tidak pernah diberikan | SELECT, INSERT | **Aman** |
| `crm_test_recipient` | ON | 0 | Tidak pernah diberikan | SELECT, INSERT, UPDATE | **Aman** |
| `crm_purge_audit_log` | ON | 0 | Tidak pernah diberikan | (fungsi SECURITY DEFINER) | **Aman** |
| `crm_activity_event` | ON | 0 | Tidak pernah diberikan | SELECT, INSERT, DELETE | **Aman** |
| `crm_customer_activity` | ON | 0 | Tidak pernah diberikan | SELECT, INSERT, DELETE | **Aman** |
| `crm_tag_registry` | ON | 0 | Tidak pernah diberikan | SELECT, INSERT, UPDATE, DELETE | **Aman** |
| `crm_mirror_meta` | ON | 0 | REVOKED | SELECT, UPDATE | **Aman** |

### A.3 Materialized View (Proteksi Khusus)

| View | RLS | Proteksi | Status |
|---|---|---|---|
| `crm_customer_mirror` | N/A (matview, tidak support RLS) | REVOKE ALL dari public/anon/authenticated; GRANT SELECT ke service_role saja | **Aman** — grant adalah satu-satunya perlindungan matview, dan ini sudah benar |

### A.4 Tabel Non-CRM yang Relevan

| Tabel | RLS | Risiko | Catatan |
|---|---|---|---|
| `staging_20fit_data` | **OFF** | **Sedang (T-02)** — 88.536 baris PII (email, nama, RFM, tanggal lahir) bisa dibaca siapa pun dengan anon key. Bypass masking dan audit CRM. | Terdokumentasi di `docs/RISIKO-masking-bypass.md` |

### A.5 Storage Bucket Policy

Satu-satunya `CREATE POLICY` di seluruh codebase:

| Bucket | Policy | Operation | USING | Status |
|---|---|---|---|---|
| `storage.objects` (bucket `brand-assets`) | `brand_assets_public_read` | SELECT | `bucket_id = 'brand-assets'` | **Aman** — read-only, dibutuhkan agar email client bisa load gambar tanpa auth |

### A.6 Fungsi RPC (SECURITY DEFINER)

Semua fungsi CRM menggunakan `SECURITY DEFINER` + `SET search_path = public` dan
EXECUTE di-revoke dari public/anon/authenticated, di-grant hanya ke service_role:

| Fungsi | SECURITY | EXECUTE Grants | Status |
|---|---|---|---|
| `crm_ingest_csv_people` | DEFINER | service_role saja | **Aman** |
| `crm_update_master_fields` | DEFINER | service_role saja | **Aman** |
| `crm_record_suppression` | DEFINER | service_role saja | **Aman** |
| `crm_lift_suppression` | DEFINER | service_role saja | **Aman** |
| `crm_upsert_profile_demographic` | DEFINER | service_role saja | **Aman** |
| `crm_refresh_customer_mirror` | DEFINER | service_role saja | **Aman** |
| `crm_purge_audit_log` | DEFINER | service_role saja | **Aman** |
| `crm_rebuild_activity_events` | DEFINER | service_role saja | **Aman** |
| `crm_tag_event_counts` | DEFINER | service_role saja | **Aman** |
| `crm_norm_phone` | IMMUTABLE | service_role saja | **Aman** |
| `crm_staging_segment_ids` | DEFINER | service_role saja | **Aman** |

### A.7 Migrasi Revoke yang Sudah Diterapkan

**Migrasi 48** (`20260825150000_revoke_anon_authenticated_crm_loose_grants.sql`):
Mencabut SEMUA privilege anon/authenticated dari 7 tabel crm_* era awal yang masih
punya grant lama:
- `crm_audit_log`, `crm_consent`, `crm_profile_behavior`, `crm_profile_demographic`,
  `crm_profile_scores`, `crm_suppression`, `crm_user_role`

Status: **diterapkan.** Semua tabel crm_* sekarang {postgres, service_role} saja.

---

## B. Inventarisasi Supabase Client Usage

### B.1 Tiga Tipe Client

| Client | File | Key | Bypass RLS | Lingkup |
|---|---|---|---|---|
| `createAdminClient()` | `lib/supabase/admin.ts` | `SUPABASE_SERVICE_ROLE_KEY` | **Ya** (BYPASSRLS) | Server-only (`import "server-only"` + runtime guard) |
| `createClient()` (server) | `lib/supabase/server.ts` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` + cookies | **Tidak** — tunduk RLS | Server Components, Route Handlers, Server Actions |
| `createClient()` (browser) | `lib/supabase/client.ts` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Tidak** — tunduk RLS | Client-side (browser) |

### B.2 Pemakaian Browser Client (Client-Side)

Browser client **hanya dipakai untuk auth**:

| File | Operasi | Tabel | Risiko |
|---|---|---|---|
| `components/auth/reset-password-form.tsx` | `supabase.auth.updateUser()` | `auth.users` (bawaan Supabase) | **Aman** — hanya auth, bukan data CRM |

**Nol operasi data CRM dari browser client.** Ini desain yang benar.

### B.3 Pemakaian Server Client (Anon Key + Auth Cookies)

`createClient()` dari `lib/supabase/server.ts` dipakai di server-side **hanya untuk**:

| Pola | File-file | Operasi | Risiko |
|---|---|---|---|
| Get current user | Hampir semua API route & server action | `supabase.auth.getUser()` | **Aman** — hanya baca identitas user, bukan data CRM |
| Login | `app/login/actions.ts` | `supabase.auth.signInWithPassword()` | **Aman** — auth saja |
| Logout | `app/logout/route.ts` | `supabase.auth.signOut()` | **Aman** — auth saja |

**Nol query data CRM menggunakan server client (anon key).** Semua query data CRM
menggunakan `createAdminClient()`.

### B.4 Pemakaian Admin Client (Service Role) — Semua Operasi CRM

Setiap operasi baca/tulis data CRM menggunakan `createAdminClient()`. Berikut inventarisasi
operasi WRITE:

#### Tulis ke `master_customer`

| File | Operasi | Mekanisme | Aman? |
|---|---|---|---|
| `app/api/audience/import/route.ts` | INSERT (batch CSV) | RPC `crm_ingest_csv_people` via admin | **Aman** — SECURITY DEFINER, service_role |
| `app/api/audience/add-contact/route.ts` | INSERT (satu orang) | RPC `crm_ingest_csv_people` via admin | **Aman** — SECURITY DEFINER, service_role |
| `app/api/audience/add-contact/route.ts` | UPDATE (existing contact) | RPC `crm_update_master_fields` v2 via admin | **Aman** — SECURITY DEFINER, gated `canImportAudience` (dimigrasikan 13 Sep 2026) |
| `app/api/audience/[id]/core/route.ts` | UPDATE (core fields) | RPC `crm_update_master_fields` via admin | **Aman** — SECURITY DEFINER, gated `profile.edit_core` |

#### Tulis ke tabel `crm_*`

| Tabel | File | Operasi | Client | Gate RBAC |
|---|---|---|---|---|
| `crm_audit_log` | 12+ file | INSERT | admin | Semua route yang menulis audit |
| `crm_campaign_run` | `lib/crm/campaign-run.ts`, `send-drain.ts` | INSERT, UPDATE | admin | canRunCampaign |
| `crm_message_log` | `lib/crm/send-campaign.ts`, webhook routes | INSERT, UPDATE | admin | campaign flow / webhook |
| `crm_segment` | `lib/crm/segment-store.ts`, `segments/actions.ts` | INSERT, UPDATE | admin | canManageSegments |
| `crm_suppression` | `lib/crm/suppression-write.ts` | Via RPC `crm_record_suppression` / `crm_lift_suppression` | admin | canManageSuppression |
| `crm_consent` | Via RPC `crm_ingest_csv_people`, `crm_backfill_consent` | INSERT | admin | SECURITY DEFINER |
| `crm_user_role` | `settings/roles/actions.ts` | UPSERT, DELETE | admin | canAdminRoles |
| `crm_test_recipient` | `campaigns/test-recipient-actions.ts` | UPSERT, UPDATE | admin | canRunCampaign |
| `crm_message_template` | `app/api/templates/route.ts`, `send-test-harness.ts` | INSERT, UPDATE | admin | canManageTemplates |
| `crm_brand_asset` | `templates/brand-asset-actions.ts` | INSERT, UPDATE | admin | canManageTemplates |
| `crm_workflow` | `lib/crm/workflow-store.ts` | INSERT, UPDATE | admin | canManageWorkflows |
| `crm_workflow_enrollment` | `workflows/actions.ts` | INSERT, UPDATE | admin | canManageWorkflows |
| `crm_send_config` | `lib/crm/send-config.ts` | UPDATE | admin | canConfigureSendLimits |
| `crm_scheduled_send` | `lib/crm/scheduled-send.ts` | INSERT, UPDATE | admin | canRunCampaign |
| `crm_tag_registry` | `app/api/tags/route.ts`, import route | INSERT, UPDATE, DELETE, UPSERT | admin | canManageTags |
| `crm_profile_demographic` | `lib/crm/demographic-write.ts` | Via RPC `crm_upsert_profile_demographic` | admin | profile.edit_demographic |

#### Tulis ke `customer_engagement`

**Nol operasi tulis ke `customer_engagement` dari kode aplikasi CRM.** Tabel ini hanya
dibaca (SELECT) untuk dashboard, engagement history, dan event analytics. Data sepertinya
diisi dari sumber di luar aplikasi CRM ini.

### B.5 Klasifikasi Risiko

#### 1. AMAN — Operasi via Service Role (bypass RLS)

**Semua** operasi baca/tulis CRM menggunakan `createAdminClient()` (service role). Perubahan
RLS policy pada `master_customer` atau `customer_engagement` **tidak akan mempengaruhi**
operasi-operasi ini karena service role bypass RLS.

| Jumlah | Keterangan |
|---|---|
| 40+ route/action | Semua baca/tulis via `createAdminClient()` |
| 11 RPC functions | Semua SECURITY DEFINER, EXECUTE hanya service_role |
| 0 operasi client-side ke data CRM | Benar — semua server-side |

#### 2. SELESAI — Jalur Tulis Langsung Dimigrasikan (13 Sep 2026)

`app/api/audience/add-contact/route.ts` — direct `.update()` dimigrasikan ke RPC
`crm_update_master_fields` v2. Semua jalur tulis ke `master_customer` sekarang lewat
RPC SECURITY DEFINER.

#### 3. BERISIKO — Bukan dari Kode CRM, tapi dari Akses Langsung

| Vektor | Risiko | Dampak |
|---|---|---|
| PostgREST API Supabase | User authenticated bisa query `master_customer` dan `customer_engagement` langsung via REST API (`/rest/v1/master_customer`) | CRUD penuh 82.830 profil |
| Supabase Realtime | Subscription ke perubahan `master_customer` | Bisa memantau semua perubahan profil secara real-time |
| Supabase Studio | User dengan akses dashboard bisa query langsung | Tergantung akses dashboard |

---

## C. Rekomendasi

### C.1 Tabel yang Perlu RLS Policy Diperketat

| # | Tabel | Urgensi | Aksi | Status |
|---|---|---|---|---|
| 1 | `master_customer` | ~~P0 — KRITIS~~ | Drop policy, cabut grant, grant service_role | **SELESAI 13 Sep 2026** |
| 2 | `customer_engagement` | ~~P0 — KRITIS~~ | Drop policy, cabut grant, grant service_role | **SELESAI 13 Sep 2026** |

### C.2 SQL yang Disarankan

```sql
-- ============================================================================
-- Migrasi: Perketat RLS master_customer & customer_engagement
-- GATED — JANGAN JALANKAN TANPA REVIEW DAN PERSETUJUAN PEMILIK
-- ============================================================================

-- LANGKAH 1: Audit sebelum perubahan (jalankan, catat hasilnya)
-- Verifikasi policy yang ada:
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename IN ('master_customer', 'customer_engagement');

-- Verifikasi grants yang ada:
SELECT grantee, table_name, privilege_type
FROM information_schema.table_privileges
WHERE table_name IN ('master_customer', 'customer_engagement')
  AND grantee IN ('anon', 'authenticated');

-- LANGKAH 2: Drop policy permissive
DROP POLICY IF EXISTS authenticated_full_access ON public.master_customer;
DROP POLICY IF EXISTS authenticated_full_access ON public.customer_engagement;
-- (Nama policy mungkin beda — verifikasi dengan query di Langkah 1)

-- LANGKAH 3: Cabut grant berlebih
REVOKE ALL PRIVILEGES ON TABLE public.master_customer FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.customer_engagement FROM anon, authenticated;

-- LANGKAH 4: Pastikan service_role tetap punya akses
-- (service_role memiliki BYPASSRLS, jadi secara teknis tidak butuh grant,
--  tapi grant eksplisit lebih jelas dan mengikuti pola crm_*)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.master_customer TO service_role;
GRANT SELECT ON TABLE public.customer_engagement TO service_role;

-- LANGKAH 5: Verifikasi setelah perubahan
-- Harus 0 baris:
SELECT grantee, table_name, privilege_type
FROM information_schema.table_privileges
WHERE table_name IN ('master_customer', 'customer_engagement')
  AND grantee IN ('anon', 'authenticated');

-- Harus 0 baris:
SELECT * FROM pg_policies
WHERE tablename IN ('master_customer', 'customer_engagement');
```

### C.3 Operasi yang Perlu Dimigrasikan

| # | File | Operasi Saat Ini | Rekomendasi |
|---|---|---|---|
| 1 | `app/api/audience/add-contact/route.ts` | ~~`admin.from("master_customer").update(updates)`~~ | **SELESAI 13 Sep 2026** — dimigrasikan ke RPC `crm_update_master_fields` (v2, dengan p_gender/p_date_of_birth/p_blood_type). Semua tulis ke master_customer sekarang lewat RPC SECURITY DEFINER. |

### C.4 Urutan Eksekusi yang Aman

```
Fase 0: Persiapan (SEBELUM perubahan RLS)
├── 0.1  Audit: jalankan query verifikasi (Langkah 1 di C.2)
├── 0.2  Catat output sebagai baseline
├── 0.3  Identifikasi SEMUA aplikasi/layanan lain yang menggunakan
│        project Supabase ini (di luar CRM) — pastikan mereka tidak
│        bergantung pada policy authenticated_full_access
└── 0.4  Cek apakah ada Supabase Realtime subscription aktif
         ke master_customer / customer_engagement

Fase 1: Perubahan RLS (GATED — perlu persetujuan pemilik)
├── 1.1  DROP POLICY authenticated_full_access pada master_customer
├── 1.2  DROP POLICY authenticated_full_access pada customer_engagement
├── 1.3  REVOKE ALL dari anon & authenticated pada kedua tabel
├── 1.4  GRANT eksplisit ke service_role (best practice)
└── 1.5  Jalankan query verifikasi (Langkah 5 di C.2)

Fase 2: Verifikasi Aplikasi (SEGERA setelah Fase 1)
├── 2.1  Akses CRM via browser — pastikan semua halaman berfungsi:
│        ├── /audience (pool list)
│        ├── /audience/[id] (detail profil)
│        ├── /audience/import (import CSV)
│        ├── /campaigns (komposer kampanye)
│        ├── /segments (segment builder)
│        ├── /bod (dashboard)
│        ├── /quality (kualitas data)
│        └── /settings (pengaturan)
├── 2.2  Test import CSV (jalur tulis utama)
├── 2.3  Test add single contact
├── 2.4  Test edit core fields (nama/telepon/kota)
├── 2.5  Test edit demographic (gender/tanggal lahir)
└── 2.6  Test search profil

Fase 3: Migrasi Kode (Opsional, bisa ditunda)
├── 3.1  Migrasikan add-contact direct update ke RPC
└── 3.2  Update test yang relevan
```

### C.5 Rollback Plan

```sql
-- ROLLBACK — Kembalikan policy permissive jika ada yang rusak
-- HANYA jalankan jika Fase 2 (verifikasi) gagal

-- Kembalikan policy
CREATE POLICY authenticated_full_access ON public.master_customer
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY authenticated_full_access ON public.customer_engagement
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Kembalikan grant (jika diperlukan oleh aplikasi lain)
GRANT ALL PRIVILEGES ON TABLE public.master_customer TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.customer_engagement TO authenticated;

-- CATATAN: rollback ini mengembalikan kerentanan T-17. Hanya jalankan
-- sebagai langkah darurat, dan segera investigasi apa yang rusak.
```

---

## D. Catatan Tambahan

### D.1 Hal-Hal yang TIDAK Terpengaruh oleh Perubahan RLS

Karena **semua** kode aplikasi CRM menggunakan `createAdminClient()` (service role yang
bypass RLS), perubahan RLS pada `master_customer` dan `customer_engagement`:

- **TIDAK** akan mempengaruhi kode CRM yang sudah ada
- **TIDAK** akan mempengaruhi import, search, dashboard, segmentasi, kampanye, webhook
- **TIDAK** akan mempengaruhi fungsi RPC (sudah SECURITY DEFINER)
- **TIDAK** perlu perubahan kode apapun (kecuali C.3 yang opsional)

### D.2 Yang MUNGKIN Terpengaruh

- **Aplikasi lain** yang berbagi project Supabase dan query `master_customer` /
  `customer_engagement` sebagai authenticated user (bukan service role)
- **Supabase Dashboard queries** yang dijalankan sebagai user biasa (bukan postgres)
- **Realtime subscriptions** ke kedua tabel

**Ini harus diinvestigasi di Fase 0.3 sebelum menjalankan perubahan.**

### D.3 Kekuatan Arsitektur Saat Ini

Perlu diapresiasi bahwa arsitektur CRM sudah sangat baik dalam hal keamanan:

1. **Pemisahan client yang ketat**: `import "server-only"` pada admin client mencegah
   kebocoran service role key ke browser
2. **Runtime guard tambahan**: `typeof window !== "undefined"` check di admin.ts
3. **Nol data CRM di browser client**: semua data CRM melewati server-side
4. **RBAC berlapis**: setiap route memeriksa peran sebelum operasi
5. **RPC SECURITY DEFINER**: jalur tulis kritis lewat fungsi database, bukan query langsung
6. **Audit trail**: hampir semua operasi menulis ke crm_audit_log
7. **Pola "doctor_bookings" yang konsisten**: 20+ tabel crm_* semua mengikuti RLS ON / 0 policy

Satu-satunya celah adalah warisan `master_customer` dan `customer_engagement` yang
belum diperbaiki — dan perbaikannya tidak memerlukan perubahan kode.

### D.4 Kolom TERLARANG — Pengingat

Kolom `customer_engagement` yang TERLARANG dibaca (perjanjian keamanan):
- `raw_value`
- `source_row_id`
- `period`

Read guard (`lib/crm/supabase-read-guard.test.ts`) memverifikasi ini secara otomatis.

---

*Dokumen ini adalah hasil audit statis terhadap codebase dan file migrasi SQL. Verifikasi
terhadap state aktual database produksi (dengan menjalankan query di C.2 Langkah 1) harus
dilakukan sebelum eksekusi perubahan.*

⏱ DIUKUR: 13 September 2026
⏱ DIPERBARUI: 13 September 2026 — P0-6 SELESAI, add-contact dimigrasikan ke RPC
