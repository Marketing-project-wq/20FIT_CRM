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
| `staging_20fit_data` | **OFF** | **Sedang (T-02)** — 88.536 baris PII (email, nama, RFM, tanggal lahir) bisa dibaca siapa pun dengan anon key. Bypass masking dan audit CRM. | Audit detail di §E. Memo risiko di `docs/RISIKO-masking-bypass.md` |

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
⏱ DIPERBARUI: 14 September 2026 — T-02 audit detail `staging_20fit_data`

---

## E. Audit Detail T-02 — `staging_20fit_data`

> **Tanggal audit:** 14 September 2026
> **Auditor:** Codebase static analysis (grep seluruh repo)
> **Status:** AUDIT SAJA — tidak ada perubahan kode, RLS, atau grant

### E.1 Status RLS dan Grants Saat Ini

| Aspek | Status |
|---|---|
| **RLS** | **OFF** — `staging_20fit_data` tidak pernah menjalankan `ALTER TABLE … ENABLE ROW LEVEL SECURITY` di migrasi mana pun. Tidak ada `CREATE TABLE` untuk tabel ini di codebase CRM — tabel dibuat di luar repo ini (impor eksternal). |
| **Policies** | **0** — tidak ada policy sama sekali (konsekuensi dari RLS OFF) |
| **Grant anon** | **Diasumsikan SELECT** — RLS OFF + tabel di schema `public` = PostgREST mengekspos tabel ke role `anon` secara default. Terdokumentasi di `docs/RISIKO-masking-bypass.md` dan diverifikasi via PoC `GET /rest/v1/staging_20fit_data` (11 Agu 2026) |
| **Grant authenticated** | **Diasumsikan SELECT** — sama seperti anon, authenticated juga bisa baca |
| **Grant service_role** | **BYPASSRLS** — service_role selalu bisa akses (bawaan Supabase) |

**Catatan:** Karena tabel ini dibuat di luar migrasi CRM, grant eksak harus diverifikasi langsung di database produksi:
```sql
SELECT grantee, privilege_type
FROM information_schema.table_privileges
WHERE table_name = 'staging_20fit_data'
  AND grantee IN ('anon', 'authenticated', 'service_role');

SELECT relname, relrowsecurity
FROM pg_class
WHERE relname = 'staging_20fit_data';
```

### E.2 Semua Penggunaan `staging_20fit_data` di Codebase

#### E.2.1 Kode Aplikasi (Runtime)

| # | File | Operasi | Client | Fungsi |
|---|---|---|---|---|
| 1 | `lib/crm/staging.ts` | **SELECT** (count, select kolom, paged read) | `createAdminClient()` (service role) | Layer baca utama: `fetchProfileImport()`, `fetchStagingImportCoverage()`, `fetchStagingDashboard()`, `fetchStagingImportDob()`, `fetchStagingRfm()` |
| 2 | `lib/crm/staging.ts` | **SELECT** via RPC `crm_staging_segment_ids` | `createAdminClient()` (service role) | Segment resolver: `resolveStagingRfmCustomerIds()`, `resolveStagingProgramCustomerIds()` |
| 3 | `app/api/audience/[id]/route.ts:134–143` | **SELECT** (indirect, via `fetchProfileImport`) | `createAdminClient()` (service role) | Profile detail: tanggal lahir, kota, RFM, program participation |
| 4 | `lib/crm/staging-constants.ts` | Tidak ada query — hanya konstanta | N/A | Definisi kolom, program list, RFM values, date parser |
| 5 | `components/audience/profile-detail.tsx:1260–1315` | Tidak ada query — hanya render | N/A | UI rendering data impor (program participation) |

**Semua query runtime menggunakan `createAdminClient()` (service role).** Tidak ada satu pun query ke `staging_20fit_data` yang menggunakan anon key atau authenticated client dari kode CRM.

#### E.2.2 SQL Migrations / Functions (Database-side)

| # | Migrasi | Operasi | Konteks |
|---|---|---|---|
| 1 | `20260813000000_create_crm_staging_segment_ids.sql` | **SELECT** (semi-join) | RPC `crm_staging_segment_ids` — SECURITY DEFINER, EXECUTE hanya service_role. Join `staging_20fit_data.Email` ke `master_customer.email_normalized` untuk resolve segment criteria (RFM/program) |
| 2 | `20260813091255_create_crm_customer_mirror.sql:131` | **SELECT** | Matview `crm_customer_mirror` definition — LEFT JOIN ke staging untuk DOB, RFM, Fitco marker |
| 3 | `20260814040554_add_is_fitco_member_matched_to_crm_customer_mirror.sql:87–93` | **SELECT** | Matview refresh — same LEFT JOIN pattern |
| 4 | `20260818041017_precompute_dashboard_stats_at_refresh.sql:128,194` | **SELECT** | Dashboard stats precompute — count DOB rows, staging coverage |
| 5 | `20260821060000_unify_identity_sources_aplus.sql:323–329,429` | **SELECT** | Matview definition — LEFT JOIN untuk RFM, DOB, Fitco marker |
| 6 | `20260907060000_crm_mirror_bod_daily_stats.sql:132` | **SELECT** | BOD daily stats — staging DOB count |

**Semua akses database-side adalah SELECT.** Tidak ada INSERT, UPDATE, atau DELETE ke `staging_20fit_data` dari migrasi CRM mana pun. Semua fungsi yang membaca staging berjalan sebagai SECURITY DEFINER (service_role).

#### E.2.3 RPC yang Reference Tabel Ini

| RPC | Migrasi | Akses | EXECUTE Grant |
|---|---|---|---|
| `crm_staging_segment_ids` | Migrasi 14 | SELECT (semi-join staging↔master) | service_role saja |
| `crm_refresh_customer_mirror` (implicit) | Matview refresh | SELECT (LEFT JOIN) | service_role saja |

#### E.2.4 Dokumentasi & Test

| File | Konteks |
|---|---|
| `docs/RISIKO-masking-bypass.md` | Memo risiko T-02 lengkap |
| `docs/ESKALASI-paparan-data-sensitif.md` | Eskalasi paparan PII |
| `docs/MENUNGGU-TINDAKAN-MANUSIA.md` (B8) | Opsional: indeks email di staging |
| `docs/riwayat/TEMUAN.md` (T-02) | Temuan asli Sprint 3B |
| `docs/riwayat/FAKTA-DATA.md` | Fakta data: 88.536 baris |
| `docs/RINGKASAN-SISTEM-CRM.md` | Arsitektur: staging sebagai sumber ekosistem |
| `lib/crm/quality-types.ts` | Type definitions untuk coverage stats |
| `lib/crm/dashboard-blocks.test.ts:79` | Test: memastikan staging tabel termasuk |
| `lib/crm/segment.test.ts:33` | Test: staging segment criteria |
| `lib/i18n/messages/id.ts`, `en.ts` | Label UI dan penjelasan staging |

#### E.2.5 Apakah Ada Aplikasi/Service Lain?

**Ya, kemungkinan besar.** Berdasarkan `docs/RISIKO-masking-bypass.md`:

- Tabel dibuat di luar CRM (tidak ada `CREATE TABLE` di repo ini)
- Project Supabase `cpvzwqptzcxnwzfzgrmt` dibagi oleh banyak aplikasi: arena, clinic, my20fit, shop, rb, dll.
- Anon key yang sama dipakai semua aplikasi tersebut
- **Tidak bisa dipastikan dari codebase CRM saja** apakah ada pipeline ETL, dashboard BI, atau service lain yang membaca `staging_20fit_data` menggunakan anon/authenticated key
- **Ini harus diinvestigasi di luar repo CRM sebelum mengubah RLS/grants**

### E.3 Tabel `staging_*` Lain

Dari pencarian menyeluruh di seluruh codebase:

| Tabel | Ditemukan di codebase? | RLS | Catatan |
|---|---|---|---|
| `staging_20fit_data` | Ya (lihat E.2) | **OFF** | Satu-satunya tabel `staging_*` yang direferensi di codebase CRM |
| Tabel `staging_*` lain | **Tidak ditemukan** | — | Tidak ada `CREATE TABLE staging_*` di migrasi CRM. Tidak ada referensi ke tabel staging lain di kode aplikasi. |

**Kesimpulan:** `staging_20fit_data` adalah satu-satunya tabel staging yang digunakan oleh CRM. Namun, karena tabel dibuat di luar CRM, mungkin ada tabel staging lain di database yang tidak direferensi repo ini. Verifikasi:
```sql
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename LIKE 'staging_%';
```

### E.4 Rekomendasi

#### E.4.1 Apakah Aman untuk ENABLE RLS + REVOKE Grants?

**Ya, AMAN untuk kode CRM.** Berdasarkan temuan E.2:

1. **Semua** query ke `staging_20fit_data` dari kode CRM menggunakan `createAdminClient()` (service role yang bypass RLS)
2. **Semua** fungsi SQL yang membaca staging adalah SECURITY DEFINER (berjalan sebagai owner/service_role)
3. **Nol** query menggunakan anon atau authenticated client
4. **Nol** operasi tulis — tabel hanya dibaca

**Risiko** bukan dari CRM, tapi dari **aplikasi/pipeline lain** di project Supabase yang sama:
- Pipeline ETL/ingestion yang mengisi tabel ini
- Dashboard BI atau tool lain yang membaca tabel ini
- Aplikasi lain (arena, clinic, my20fit, shop, rb) yang mungkin query tabel ini

**Rekomendasi: investigasi di luar CRM WAJIB sebelum eksekusi.**

#### E.4.2 SQL yang Direkomendasikan

```sql
-- ============================================================================
-- T-02: Perketat akses staging_20fit_data
-- GATED — JANGAN JALANKAN TANPA INVESTIGASI APLIKASI LAIN (E.4.1)
-- ============================================================================

-- LANGKAH 0: Audit sebelum perubahan
-- Verifikasi grants saat ini:
SELECT grantee, privilege_type
FROM information_schema.table_privileges
WHERE table_name = 'staging_20fit_data'
  AND grantee IN ('anon', 'authenticated', 'service_role', 'postgres');

-- Verifikasi RLS status:
SELECT relname, relrowsecurity
FROM pg_class WHERE relname = 'staging_20fit_data';

-- Verifikasi apakah ada tabel staging lain:
SELECT tablename FROM pg_tables
WHERE schemaname = 'public' AND tablename LIKE 'staging_%';

-- LANGKAH 1: Enable RLS
ALTER TABLE public.staging_20fit_data ENABLE ROW LEVEL SECURITY;

-- LANGKAH 2: Cabut grant dari anon & authenticated
REVOKE ALL PRIVILEGES ON TABLE public.staging_20fit_data FROM anon, authenticated;

-- LANGKAH 3: Grant eksplisit ke service_role (best practice, meskipun BYPASSRLS)
GRANT SELECT ON TABLE public.staging_20fit_data TO service_role;
-- HANYA SELECT — CRM tidak menulis ke tabel ini. Jika pipeline ETL perlu menulis,
-- tambahkan INSERT/UPDATE sesuai kebutuhan pipeline.

-- LANGKAH 4: Verifikasi setelah perubahan
-- Harus 0 baris untuk anon/authenticated:
SELECT grantee, privilege_type
FROM information_schema.table_privileges
WHERE table_name = 'staging_20fit_data'
  AND grantee IN ('anon', 'authenticated');

-- RLS harus ON:
SELECT relname, relrowsecurity
FROM pg_class WHERE relname = 'staging_20fit_data';
-- relrowsecurity harus = true
```

#### E.4.3 Rollback Plan

```sql
-- ROLLBACK T-02 — Kembalikan jika ada pipeline/aplikasi lain yang rusak
-- HANYA jalankan sebagai langkah darurat

-- Kembalikan grant
GRANT SELECT ON TABLE public.staging_20fit_data TO anon, authenticated;

-- Matikan RLS kembali
ALTER TABLE public.staging_20fit_data DISABLE ROW LEVEL SECURITY;

-- CATATAN: rollback ini mengembalikan paparan PII 88.536 baris.
-- Hanya jalankan jika pipeline kritis rusak, dan segera investigasi
-- pipeline mana yang bergantung pada akses anon/authenticated.
```

#### E.4.4 Apakah Tabel Ini Masih Dibutuhkan?

**Ya, masih aktif digunakan.** Tabel ini dibaca untuk:

1. **Profile detail** — tanggal lahir (5.467 baris, master_customer punya 0), kota, RFM, program participation
2. **Segment resolver** — RPC `crm_staging_segment_ids` melakukan semi-join staging↔master untuk filter RFM dan program
3. **Dashboard** — statistik DOB coverage dan RFM spread
4. **Materialized view** `crm_customer_mirror` — LEFT JOIN ke staging untuk DOB, RFM, Fitco marker (di-refresh tiap malam)
5. **Quality page** — coverage stats, DOB parse quality metrics

**Archive belum bisa dilakukan** selama data staging belum sepenuhnya dimigrasikan ke tabel `crm_*`. Secara khusus:
- Tanggal lahir sudah ada jalur tulis ke `crm_profile_demographic` (via `crm_upsert_profile_demographic`), tapi belum di-backfill dari staging
- RFM dan program participation belum ada tabel `crm_*` yang menyimpannya
- Selama backfill belum selesai, staging tetap menjadi satu-satunya sumber data ini

**Rekomendasi jangka panjang:**
1. **Jangka pendek:** Enable RLS + REVOKE grants (setelah investigasi pipeline lain)
2. **Jangka menengah:** Backfill DOB, RFM, program ke tabel `crm_*`
3. **Jangka panjang:** Setelah backfill selesai dan terverifikasi, archive atau drop `staging_20fit_data`

#### E.4.5 Urutan Eksekusi yang Aman

```
Fase 0: Investigasi (WAJIB sebelum perubahan)
├── 0.1  Jalankan query audit (Langkah 0 di E.4.2)
├── 0.2  Cari SEMUA aplikasi/pipeline di project Supabase yang query
│        staging_20fit_data — terutama:
│        ├── Pipeline ETL/ingestion yang mengisi tabel
│        ├── Dashboard BI (Metabase, Retool, dll)
│        ├── Aplikasi arena, clinic, my20fit, shop, rb
│        └── Cron job atau edge function di luar CRM
├── 0.3  Untuk setiap consumer yang ditemukan: apakah pakai service_role
│        atau anon/authenticated? Jika anon/authenticated → akan putus
└── 0.4  Cek Supabase Realtime subscription aktif ke staging_20fit_data

Fase 1: Eksekusi (GATED — perlu persetujuan pemilik data)
├── 1.1  ALTER TABLE … ENABLE ROW LEVEL SECURITY
├── 1.2  REVOKE ALL dari anon & authenticated
├── 1.3  GRANT SELECT ke service_role
└── 1.4  Verifikasi (Langkah 4 di E.4.2)

Fase 2: Verifikasi CRM (segera setelah Fase 1)
├── 2.1  Buka /audience/[id] — cek section "Data Impor 20FIT"
├── 2.2  Buka /quality — cek staging coverage stats
├── 2.3  Buka /bod — cek dashboard cards (DOB, RFM)
├── 2.4  Buat segment dengan kriteria RFM — cek jumlah match
└── 2.5  Buat segment dengan kriteria program — cek jumlah match

Fase 3: Verifikasi pipeline lain (jika ditemukan di Fase 0)
└── 3.x  Per-pipeline: pastikan masih berfungsi setelah perubahan
```

### E.5 Ringkasan Risiko

| Aspek | Status | Detail |
|---|---|---|
| **PII terpapar** | 88.536 baris | Nama, email, nomor telepon, tanggal lahir, kota, RFM, program |
| **Siapa yang bisa akses** | Siapa pun dengan anon key | Anon key bersifat publik, ditanam di bundel klien semua aplikasi 20FIT |
| **Bypass kontrol CRM** | Ya | Masking server-side, audit `list.viewed`, dan RBAC semua dilewati |
| **Dampak ke kode CRM jika RLS ON** | **Nol** | Semua akses CRM via service_role (bypass RLS) |
| **Dampak ke pipeline lain** | **Tidak diketahui** | Harus diinvestigasi (Fase 0.2) |
| **Urgensi** | **Tinggi** | Setara dengan peluncuran fitur kontak (lihat `docs/RISIKO-masking-bypass.md`) |
