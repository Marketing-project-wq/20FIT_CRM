# Ringkasan Sesi CRM — 13–14 September 2026 (v3)

> Dokumen ini merangkum seluruh pekerjaan yang diselesaikan dalam dua sesi pengembangan CRM 20FIT pada tanggal 13–14 September 2026.

---

## Ikhtisar

| Metrik | Nilai |
|---|---|
| Jumlah hari kerja | 2 (13 & 14 Sep 2026) |
| Total task selesai | **32** (16 per hari) |
| Total commit | 37 |
| Migrasi SQL baru | **13** (periode 3–14 Sep) |
| File diubah/dibuat | 60+ |
| Build & deploy | Otomatis via merge ke `main` → Railway |

---

## Hari 1 — Sabtu, 13 September 2026

### 16 Task Selesai

| # | Task | Kategori | Commit |
|---|---|---|---|
| 1 | **P2-1: Dialog tambah kontak tunggal** — form input + download template CSV | Audience | `3db694d` |
| 2 | **P2-2: Kriteria profil di segment builder** — umur, tanggal lahir, gender, kota, golongan darah | Segmentasi | `d964d73` |
| 3 | **P2-5: Import Excel .xlsx** — dukungan file Excel di audience wizard | Import | `8e34d08` |
| 4 | **Hapus golongan darah dari input surfaces** — field yang tidak digunakan dibersihkan | Refactor | `22bd097` |
| 5 | **Event Analysis: PDF export, demografi, perbandingan** — 3 fitur besar ditambahkan sekaligus | Analytics | `a3e700a` |
| 6 | **Event Analysis: Filter bar** — multi-select event + date range picker | Analytics | `a26bfbf` |
| 7 | **Loading animation: Animasi olahraga** — SVG runner → Lottie bouncing red ball | UX | `de7b32a` `90386ed` `4d609a5` |
| 8 | **Shared loader: Ekstrak komponen loading** — diterapkan ke semua halaman | UX | `140461b` |
| 9 | **P0-4: Auto-suppress hard bounce** — webhook otomatis nonaktifkan email bounced | Email | `1cc0c2a` |
| 10 | **Reorganisasi sidebar** — urutan navigasi baru, account/sign-out ke bawah | Navigation | `9a30b1a` |
| 11 | **EVENT_ALIASES: Merge grup duplikat** — event dengan nama berbeda digabungkan | Analytics | `61d159e` |
| 12 | **Dark mode fixes (4 commit)** — perbaikan kontras di Event Analysis, dropdown, view toggle, dialog | UI/UX | `f17f177` `12a2078` `a66ad24` `bdad55a` |
| 13 | **Loading states navigasi halaman** — skeleton/spinner saat pindah halaman | UX | `a3b7ec2` |
| 14 | **Add-contact: Sanitasi telepon + migrasi RPC** — phone field cleanup, error logging, migrasi ke `crm_update_master_fields` RPC | Data | `16944dd` `e622d1c` `ca203c2` |
| 15 | **Dokumen audit keamanan RLS** — audit menyeluruh semua tabel CRM | Security | `0428ed8` |
| 16 | **i18n: Hapus kode L/P mentah** — label gender dropdown dibersihkan | i18n | `e61e095` |

---

## Hari 2 — Minggu, 14 September 2026

### 16 Task Selesai

| # | Task | Kategori | Commit |
|---|---|---|---|
| 1 | **Audit T-02: staging_20fit_data** — detail audit RLS & akses tabel staging | Security | `bf2f9a0` |
| 2 | **Fix T-02: Migrasi + tandai SELESAI** — simpan migrasi keamanan staging | Security | `66bc737` |
| 3 | **Event Analysis: Key Insights section** — ganti InsightBox dengan section rich insights | Analytics | `29c9397` `a29c571` |
| 4 | **Event Analysis: Lifecycle Funnel** — visualisasi funnel First Visit → Regular → Loyal | Analytics | `db2a1fb` |
| 5 | **Event Analysis: Category Growth** — tren pertumbuhan peserta per kategori event | Analytics | `db2a1fb` |
| 6 | **Event Analysis: Overlap Matrix** — matriks cross-participation antar event | Analytics | `db2a1fb` |
| 7 | **Event Analysis: Revenue Analysis** — analisis pendapatan per event (kemudian dihapus) | Analytics | `db2a1fb` |
| 8 | **Event Analysis: Geographic Expansion** — peta penyebaran kota peserta event | Analytics | `db2a1fb` |
| 9 | **Event Analysis: Layout 4 tab** — Ringkasan, Retensi, Demografi, Tren dengan URL sync | Analytics | `993e206` |
| 10 | **Event Analysis: Hapus Revenue** — bersihkan dari backend, frontend, dan i18n | Analytics | `993e206` |
| 11 | **Email auto-correct** — koreksi otomatis typo domain (gmial→gmail, yaho→yahoo, dll.) di semua entry point | Email | `9385397` |
| 12 | **Template management: Card UI** — redesign dari tabel ke card-based layout dengan filter | Template | `b6903f5` |
| 13 | **Template management: Metadata** — kolom kategori, bahasa, updated_at | Template | `b6903f5` |
| 14 | **Mail merge: Custom placeholder** — placeholder per penerima di campaign system | Campaign | `ee2de63` |
| 15 | **PLN 5K doorprize** — script kirim hadiah + cleanup setelah berhasil | Operasional | `c8f21e7` `52874d3` |
| 16 | **Build fix: Exclude scripts/** — pisahkan scripts/ dari Next.js build (TS target mismatch) | DevOps | `0175adb` |

---

## Migrasi SQL (13 Migrasi, Periode 3–14 Sep 2026)

| # | File Migrasi | Tanggal | Deskripsi |
|---|---|---|---|
| 1 | `crm_message_log_add_provider_throttled` | 3 Sep | Tambah status `provider_throttled` di message log |
| 2 | `crm_campaign_run_add_partial_failed` | 3 Sep | Tambah status `partial_failed` di campaign run |
| 3 | `crm_mirror_bod_daily_stats` | 7 Sep | Precompute statistik harian dashboard dari mirror |
| 4 | `crm_update_master_fields` | 8 Sep | RPC untuk update field master_customer secara aman |
| 5 | `crm_master_customer_phone_lookup_index` | 8 Sep | Index lookup telepon di master_customer |
| 6 | `crm_message_template_add_sender_name` | 9 Sep | Tambah kolom nama pengirim di template |
| 7 | `crm_campaign_run_add_drain` | 9 Sep | Tambah mekanisme drain untuk campaign run |
| 8 | `crm_unlimited_send` | 11 Sep | Hapus batas kirim dan jam tunggu kampanye |
| 9 | `crm_tag_event_counts` | 11 Sep | Materialized view jumlah peserta per event tag |
| 10 | `crm_tag_registry` | 11 Sep | Registry tag dengan label dan metadata |
| 11 | `crm_master_customer_profile_columns` | 12 Sep | Kolom profil tambahan (gender, DOB, city, blood_type) |
| 12 | `crm_update_master_fields_v2` | 13 Sep | Versi 2 RPC update field dengan validasi baru |
| 13 | `crm_campaign_merge_data` | 14 Sep | Kolom merge data untuk mail merge per penerima |

---

## Fitur Utama yang Dibangun

### 1. Event Analysis — Halaman Analitik Event Lengkap

Halaman baru untuk menganalisis data partisipasi event berdasarkan tag `event:*` di `master_customer`. Dibangun dari nol dalam 2 hari.

**Arsitektur:**
- Backend: `lib/crm/event-analytics.ts` (~950 baris, `"server-only"`)
- Frontend: `components/analytics/event-analysis.tsx` (~1780 baris, `"use client"`)
- Data source: `master_customer.tags[]`, `customer_engagement`, `crm_tag_registry`

**Fitur yang disertakan:**
- Grouping otomatis event berdasarkan slug prefix (`eventGroupKey()`)
- Cohort retention matrix dengan gradient warna
- Churn analysis dan lifecycle funnel
- Demographic breakdown (gender, usia, kota)
- Cross-event comparison (pilih 2 event untuk dibandingkan)
- Category growth trends per periode
- Overlap matrix antar event
- Geographic expansion visualization
- Key Insights section dengan insight otomatis
- Filter bar: multi-select event + date range
- PDF export
- **Layout 4 Tab**: Ringkasan, Retensi, Demografi, Tren (URL-synced via `?tab=`)

### 2. Mail Merge — Custom Placeholder per Penerima

Sistem campaign email diperluas dengan kemampuan mail merge:
- Setiap penerima dapat memiliki placeholder unik (`{{nama}}`, `{{kode}}`, dll.)
- Data merge disimpan di kolom `merge_data` (JSONB) pada `crm_campaign_run`
- Template engine melakukan substitusi saat pengiriman

### 3. Template Management — Card-based UI

Redesign halaman manajemen template email:
- Layout kartu dengan preview konten
- Filter berdasarkan kategori dan bahasa
- Metadata: kategori, bahasa, tanggal update
- Migrasi SQL menambah kolom metadata baru

### 4. Email Auto-correct — Koreksi Domain Typo

Sistem koreksi otomatis untuk typo domain email yang umum:
- `gmial.com` → `gmail.com`, `yaho.com` → `yahoo.com`, dll.
- Diterapkan di semua titik masuk data (import, add contact, update)
- Mencegah email bounced karena salah ketik domain

### 5. Import ISS Johor 2026

Registrasi 16 tag ISS Johor 2026 di shipped vocabulary (`crm_tag_registry`).
Tag ini digunakan untuk melacak peserta event ISS Johor 2026 di seluruh sistem CRM.

### 6. PLN 5K Doorprize

Script one-off untuk mengirimkan hadiah doorprize PLN 5K ke pemenang. Script dibuat, dijalankan, dan dihapus setelah pengiriman berhasil.

### 7. RLS Security Audit & Fixes

- **Dokumen audit RLS** (`docs/`) untuk seluruh tabel CRM
- **Audit T-02**: Detail audit staging_20fit_data — analisis akses dan risiko
- **Migrasi keamanan**: Perbaikan policy RLS untuk tabel staging
- Semua tabel CRM diverifikasi memiliki RLS yang tepat

---

## Perbaikan Bug & Polish

| Area | Perbaikan |
|---|---|
| Dark mode | 4 fix: kontras Event Analysis, view toggle, dropdown dialog, filter |
| Loading | Animasi sports-themed → Lottie red ball → shared loader component |
| Navigation | Sidebar reorganisasi, loading states antar halaman |
| Add-contact | Phone sanitization, migrasi ke RPC, error logging |
| i18n | Hapus kode L/P mentah dari gender labels |
| EVENT_ALIASES | Merge grup event duplikat |
| Build | Exclude scripts/ dari Next.js build (TS target mismatch) |
| Bounce | Auto-suppress hard bounce emails via webhook |

---

## Stack Teknologi

| Layer | Teknologi |
|---|---|
| Framework | Next.js 14 (App Router) |
| Frontend | React 18, TypeScript 5, Tailwind CSS |
| Database | Supabase PostgreSQL + RLS |
| Email | Resend API + Mailtrap (webhook tracking) |
| Deploy | Railway (auto-deploy on merge to `main`) |
| i18n | Custom dual-language (ID/EN), cookie `20fit_lang` |

---

## Catatan Keamanan

- Semua query CRM menggunakan `service_role` Supabase (bypass RLS) dengan validasi server-side
- Field sensitif `raw_value`, `source_row_id`, `period` dari `customer_engagement` **TIDAK PERNAH dibaca**
- Setiap migrasi SQL ditampilkan untuk review sebelum diaplikasikan — TIDAK otomatis dijalankan
- Audit RLS komprehensif dilakukan untuk memastikan tidak ada kebocoran data

---

*Dokumen ini dibuat pada 14 September 2026 sebagai catatan resmi pekerjaan sesi CRM v3.*
