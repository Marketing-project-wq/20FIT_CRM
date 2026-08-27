# Workflow Marketing — Progres Pembangunan

> Catatan lintas-sesi untuk pekerjaan workflow marketing 20FIT CRM. Update tiap fase selesai.

## Konteks & kendala awal

Permintaan: bangun workflow marketing (welcome series, re-engagement) ala Mailchimp/Klaviyo.

Kendala fundamental yang ditemukan:
- `master_customer` = **snapshot beku** (impor 20 Apr & 31 Jul 2026), tidak ada pipeline live.
- Semua kolom waktu di master = **load stamp** (K-19), bukan aktivitas nyata.
- Workflow trigger-waktu (welcome/re-engagement) butuh "kapan bergabung" + "kapan terakhir aktif" yang jujur.

Solusi (disetujui owner 2026-08-27): lapisan aktivitas dari tabel sumber yang HIDUP di Supabase yang sama.

## Sumber aktivitas (verified live 2026-08-27, timestamp ASLI)

| Tabel | Kolom waktu | Penghubung | Volume |
|---|---|---|---|
| arena_bookings | booking_date, paid_at | email, phone | 270 |
| clinic_bookings | check_in_at, paid_at | email, phone, patient_id | 350 (update hari ini) |
| clinic_transactions | created_at | patient_id → clinic_patients | 2.629 |
| cf_hyrox_participants | registered_at | email | 1.038 |
| my20fit_user_activity | last_active_at | email, auth_user_id | 197 (update hari ini) |

Cacat T-14: arena/hyrox/clinic_tx punya tanggal masa depan s/d Des 2026 → di-clamp `<= now()`.

## FASE 1 — Lapisan aktivitas ✅ SELESAI & DI-APPLY

**Commits:** d79893a, a9933c3 (perf fix), 5c02fb2 + 16e7ec7 (ingest)

**Migrasi (SUDAH di-apply di Supabase):**
- `20260827090000_crm_activity_layer.sql` — tabel `crm_activity_event` (event mentah) + `crm_customer_activity` (ringkasan: joined_at, last_active_at, event_count, sources) + fungsi `crm_rebuild_activity_events()` + `crm_refresh_customer_activity()` + pg_cron harian 03:30 WIB
- `20260827100000_ingest_activity_people.sql` — `crm_ingest_activity_people()`: buat profil master untuk orang aktif yang belum di pool (source='activity_ingest', reversible). Telepon bentrok dikosongkan (unique constraint).

**Catatan teknis penting:**
- OR-join email/phone TIMEOUT di SQL editor → dipecah jadi UNION cabang email + cabang phone (masing-masing terindeks). Selalu pakai pola ini untuk join master.
- master_customer punya UNIQUE index pada phone_normalized → ingest harus kosongkan telepon bentrok.
- normalize_email (K-35) + crm_norm_phone (K-06) — normalisasi wajib satu tempat.

**Kode:**
- `lib/crm/activity.ts` — `loadActivityCoverage()` + `resolveActivityTimeIds()`
- `components/quality/activity-coverage-panel.tsx` — panel cakupan di tab Audience>Quality

**HASIL CAKUPAN: 308 → 725 profil** dari ~82.670 (ingest menambah ~417 orang aktif). Ini populasi kecil tapi berkualitas (terbukti aktif). Rentang aktivitas: 4 Jan 2026 – hari ini.

## FASE 2 — Kriteria waktu di segmen ✅ SELESAI (kode; belum di-commit saat menulis)

**Yang dibangun:**
- `lib/crm/segment.ts` — tambah field `joinedWithinDays` + `inactiveForDays` ke SegmentCriteria + EMPTY_CRITERIA + activeCriteriaCount + parseCriteria (via `clampDays`: integer 1–3650)
- `lib/crm/activity.ts` — `resolveActivityTimeIds()`: query crm_customer_activity, joined_at >= now()-Nd (welcome) / last_active_at <= now()-Nd (re-engagement)
- `lib/crm/segment-read.ts` — `resolveRestrictIds` intersect timeIds AND-only
- `app/api/segments/route.ts` — audit metadata + parseCriteria menerima field waktu
- `components/segments/segment-builder.tsx` — ganti `TimeBanned` (banner "tidak ada kriteria waktu") jadi `TimeCriteria` (dua input hari) + buildBody kirim field waktu
- i18n `segments.timeCriteria.*` (id + en) dengan caveat cakupan jujur (725 profil)

**Prinsip jujur:** kriteria waktu HANYA berlaku untuk profil yang ada di crm_customer_activity (725). Profil tanpa jejak aktivitas tak akan cocok — disclosure eksplisit di UI (K-19 spirit).

## FASE 3 — Workflow UI + engine ⏳ BELUM

Rencana:
- Migrasi `crm_workflow` (id, name, type welcome|reengagement, trigger_config jsonb, template_key, is_active) + `crm_workflow_enrollment` (workflow_id, customer_id, enrolled_at, step, status, last_sent_at)
- UI `/workflows` (ganti ComingSoon): daftar workflow, buat baru (tipe + template + ambang hari), enrollment count, uji kirim ke admin dulu
- Engine: pg_cron harian evaluasi trigger → enroll profil yang match + belum enrolled → kirim lewat sendCampaign yang ADA (hormati suppression + gate + audit, idempoten per customer+workflow)
- Welcome: trigger joined_at ≤ N hari. Re-engagement: trigger last_active_at ≥ N hari.

## Prinsip yang dipegang sepanjang

- Nol tulis ke master_customer KECUALI ingest (yang ditandai source='activity_ingest', reversible)
- Nol kolom sensitif Fase 0 (NIK/kesehatan/DOB/gender/alamat)
- Migrasi di-apply MANUAL oleh owner (tulisan produksi) — kode selalu commit dulu, apply belakangan
- Gate hijau tiap fase: tsc + vitest + next build
- Send selalu lewat jalur yang ada (sendCampaign) — tak ada jalur kirim kedua
