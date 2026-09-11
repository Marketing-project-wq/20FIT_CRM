# RINGKASAN SISTEM — 20FIT CRM

> **Tujuan dokumen ini:** referensi lengkap agar seseorang (atau AI assistant) bisa memahami
> arsitektur, status, konvensi, dan prioritas proyek CRM 20FIT tanpa membaca seluruh codebase.
>
> **Diukur:** 10 September 2026. Angka bersumber dari `docs/ACUAN-UTAMA.md` (potret 7 Sep 2026)
> dan commit log. Lihat ACUAN-UTAMA untuk angka terukur terkini.

---

## 1. Apa Ini

Sistem CRM internal untuk **20FIT** — ekosistem fitness/wellness Indonesia (gym, arena, klinik, event).
Tujuan: mengenali seluruh audiens dari berbagai unit bisnis, mengelola datanya, dan menghubungi mereka
lewat email. WhatsApp belum tersedia.

**Tech stack:**
- **Frontend/Backend:** Next.js 14 (App Router), React 18, TypeScript 5, Tailwind CSS
- **Database:** Supabase (PostgreSQL), 52 migrasi SQL
- **Email:** Mailtrap & Resend (sakelar runtime `EMAIL_PROVIDER`, default `mailtrap`)
- **Deployment:** Railway (auto-deploy dari `main`; merge ke `main` = deploy ke produksi)
- **Bilingual:** Indonesia (default) + English, cookie-based (`20fit_lang`)

**Ukuran codebase:** ~370 file TypeScript, 126 modul library (non-test), 57 komponen React,
51 route/page, 104 file test (1.711 tes), 52 migrasi SQL.

---

## 2. Arsitektur Tingkat Tinggi

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (Next.js App Router)                               │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────┐  │
│  │ Dashboard │ │ Audience │ │Campaigns │ │ Segments/Tags │  │
│  │  /bod     │ │  /import │ │/templates│ │ /settings     │  │
│  └──────────┘ └──────────┘ └──────────┘ └───────────────┘  │
└───────────────────┬─────────────────────────────────────────┘
                    │ Server Components + API Routes
┌───────────────────▼─────────────────────────────────────────┐
│  lib/crm/*  (94 modul, murni + server-only)                 │
│  ┌────────────┐ ┌───────────┐ ┌──────────┐ ┌────────────┐  │
│  │ send-run   │ │ segment   │ │ import   │ │ dashboard  │  │
│  │ send-drain │ │ mirror    │ │ consent  │ │ quality    │  │
│  │ send-gate  │ │ tags      │ │ suppress │ │ audit-log  │  │
│  └────────────┘ └───────────┘ └──────────┘ └────────────┘  │
│  lib/email/* (provider abstraction: mailtrap + resend)      │
│  lib/auth/*  (RBAC: 3 peran aktif)                          │
│  lib/i18n/*  (id/en, coverage guard)                        │
└───────────────────┬─────────────────────────────────────────┘
                    │ service_role client (BUKAN anon/authenticated)
┌───────────────────▼─────────────────────────────────────────┐
│  Supabase PostgreSQL                                        │
│  ┌──────────────────┐ ┌─────────────────────────────────┐   │
│  │ master_customer   │ │ crm_* tables (RLS + nol grant) │   │
│  │ customer_engagmnt │ │ crm_customer_mirror (mat.view) │   │
│  │ (warisan, RLS     │ │ crm_message_log                │   │
│  │  terlalu longgar) │ │ crm_suppression                │   │
│  └──────────────────┘ │ crm_consent, crm_audit_log      │   │
│                       │ crm_segment, crm_campaign_run    │   │
│                       │ crm_message_template             │   │
│                       │ crm_workflow, crm_send_config    │   │
│                       └─────────────────────────────────┘   │
│  Sumber eksternal (read-only):                              │
│  staging_20fit_data, my20fit_profile, arena_*, clinic_*,    │
│  talent_accounts, uob_users, cf_hyrox_*, profiles           │
└─────────────────────────────────────────────────────────────┘
```

### Aliran Data Utama

1. **Pool audiens:** 82.830 profil di `master_customer` (pool tunggal, identitas terpadu email+telepon).
   Sumber: import massal (April, Juli, Agustus 2026). Pool BEKU sejak 27 Agustus — pipeline harian
   belum dibangun.

2. **Cermin harian:** `crm_customer_mirror` — materialized view disegarkan cron 20:00 UTC (03:00 WIB).
   Mempercepat segmentasi dari ~2,2 detik ke ~49 milidetik. Menyimpan flag kehadiran per sumber
   (has_hyrox, has_my20fit, has_arena, has_gym, has_clinic).

3. **Segmentasi:** Kriteria AND-composed di `SegmentCriteria`. 10 segmen tersimpan. Builder mendukung:
   unit bisnis, sumber, kontaktabilitas, kebaruan, LTV, tag, program, dan eksklusif.
   **Belum ada:** kriteria usia/tanggal lahir (data sudah di cermin, criteria belum di builder).

4. **Pengiriman email:** Mesin kirim port-driven (`send-run.ts`). 9 binding rules (suppression at send
   time, idempotency, daily limit, unsubscribe wajib, bounce auto-stop 5%, consecutive failure stop,
   backoff+retry, pacing 500ms). Jalur kirim massal via background batch drainer (`send-drain.ts`,
   200/batch, cron-driven).

5. **Webhook:** Dua rute paralel (`/api/mailtrap/webhook`, `/api/resend/webhook`). Mengisi kolom siklus
   `crm_message_log` (delivered_at, bounced_at, complained_at, opened_at, clicked_at). Signature
   verification wajib (HMAC). Fail-closed.

---

## 3. Tabel Database Kunci

### Tabel milik CRM (aman: RLS aktif, nol policy, nol grant ke anon/authenticated)

| Tabel | Fungsi |
|---|---|
| `crm_message_log` | Log setiap percobaan kirim email. Kolom siklus: sent_at, delivered_at, bounced_at, complained_at, opened_at, clicked_at. Idempotency key, identity_hash, provider_message_id |
| `crm_suppression` | Daftar suppressed (unsubscribe, bounce). Resolusi lewat identity_hash (email), bukan customer_id. Tak pernah dihapus, hanya "lifted" |
| `crm_consent` | Catatan consent per orang per channel. Basis: legacy_import_unverified / explicit_opt_in |
| `crm_audit_log` | Jejak audit setiap aksi individu. Compliance family: campaign.%, export.%, profile.% |
| `crm_segment` | Segmen tersimpan. Kriteria JSON + metadata |
| `crm_campaign_run` | Setiap run kampanye. Status: pending/sending/completed/partial/failed/stopped. Drain support |
| `crm_message_template` | Template email. Append-only (K-14). Kolom sender_name (baru, migrasi 51) |
| `crm_send_config` | Singleton: daily_limit (1000), workflow_daily_cap (300) |
| `crm_workflow` | Definisi workflow (1 baris, nol pernah jalan) |
| `crm_workflow_enrollment` | Enrollment workflow |
| `crm_profile_demographic` | Demografi kurasi manual (250 baris, 246 punya tgl lahir) |
| `crm_customer_mirror` | Materialized view: flag sumber + staging_dob. Refresh cron malam |
| `crm_mirror_meta` | Metadata cermin: dashboard_stats precompute, refreshed_at |
| `crm_user_role` | Peran per user CRM |
| `crm_brand_asset` | Aset merek |
| `crm_scheduled_send` | Kiriman terjadwal |
| `crm_identity_candidate` | Kandidat belum di pool (beku sejak 21 Agu, 2.799 baris) |
| `crm_purge_audit_log` | Audit log untuk operasi hapus |
| `crm_test_recipient` | Penerima uji internal |

### Tabel warisan (MASALAH KEAMANAN — T-17, P0-6)

| Tabel | Masalah |
|---|---|
| `master_customer` | RLS aktif TAPI policy `authenticated_full_access` (ALL/USING true/WITH CHECK true). 1.358 akun bisa tulis langsung. Grant TRUNCATE ke anon (pertahanan: RLS saja) |
| `customer_engagement` | Sama: policy full_access untuk authenticated |

**Satu jalur tulis CRM ke `master_customer`:** RPC `crm_ingest_csv_people` (SECURITY DEFINER),
dipanggil hanya dari `app/api/audience/import/route.ts`. Nol `.insert/.update/.upsert/.delete` langsung
di kode aplikasi.

---

## 4. Modul Kunci dan Fungsinya

### Mesin Kirim (`lib/crm/send-*.ts`)

| Modul | Fungsi |
|---|---|
| `send-run.ts` | Mesin kirim murni (port-driven). 9 binding rules. Sequential loop. Backoff+retry |
| `send-campaign.ts` | Orchestrator: resolve recipients → render template → call send-run |
| `send-drain.ts` | Background batch drainer. Cron-driven, 200/batch, optimistic concurrency claim |
| `send-drain-plan.ts` | Pure next-state decision (continue/paused/stopped/done) |
| `send-gate.ts` | Master switch `CAMPAIGN_SEND_ENABLED`. Internal-only fallback |
| `send-env.ts` | Pre-flight env check. Reports ALL missing vars at once |
| `send-config.ts` | Read `crm_send_config` singleton |
| `send-limits.ts` | Plafon kirim + peringatan reputasi |
| `send-constants.ts` | Audit action constant `campaign.sent` |
| `send-plan.ts` | Rencana kirim sebelum eksekusi |
| `bounce-monitor.ts` | Evaluasi bounce ratio. Auto-stop 5% (min 20 sample). Dibangun, aktif |

### Webhook (`lib/crm/mailtrap-webhook.ts`, `resend-webhook.ts`)

Keduanya pure (signature verify + event→column mapping). Shared type `WebhookEffect`:
- `delivered` → `delivered_at`, status `delivered`
- `hard_bounce` → `bounced_at`, status `bounced`
- `complaint` → `complained_at`, status `complained`
- `open/click` → timestamp column saja, status tak berubah
- `soft_bounce` → **diabaikan** (transient, never auto-suppress)

**Penting:** webhook TIDAK auto-suppress bounce. Hanya mengisi kolom `crm_message_log`. Auto-suppress
bounce keras (P0-4) belum dibangun.

### Segmentasi (`lib/crm/segment.ts`)

`SegmentCriteria` — semua AND-composed:
- `unit`, `segment`, `city` — filter demografis
- `revenue` — lifetime_value bucket (all/has/none/negative)
- `hasPhone`, `hasEmail` — keberadaan kontak
- `ecoUnit`, `ecoProduct` — engagement ekosistem
- `srcHyrox`, `srcMy20fit`, `srcRecency`, `srcArena`, `srcGym` — keberadaan di sumber
- `srcClinicPatient`, `srcClinicTxn` — sumber klinis (**gated on `profile.view_health`**)
- `srcRfm[]`, `srcProgram[]` — multi-select (OR within, AND across)
- `joinedWithinDays`, `inactiveForDays` — waktu (dari `crm_customer_activity`)
- `tagsAny[]`, `tagsAll[]` — operator tag (GIN-indexed)
- `exclude` — negasi dimensi non-klinis

**BELUM ADA:** kriteria usia/tanggal lahir. Data 5.442 tgl lahir sudah di `crm_customer_mirror.staging_dob`
tapi nol referensi usia di `segment.ts`. Ini P2-2.

### Import (`lib/crm/import-audience.ts`)

Pipeline CSV empat fase: unggah → petakan → ringkasan → laporan.
- Dedup email-primary skip-only (K-57)
- Tag per baris, validasi bentuk, namespace tertutup
- Consent per baris wajib (sumber pengumpulan)
- Max 15.000 baris (diukur, T-68)
- Reconciliation post-write (T-69)
- **Belum ada:** entri satu orang (P2-1), dukungan Excel .xlsx (P2-5)

### Suppression (`lib/crm/suppression-write.ts`)

Satu-satunya jalur tulis ke `crm_suppression`:
- `recordSuppression()` → RPC `crm_record_suppression` (suppression + audit dalam 1 transaksi)
- `liftSuppression()` → RPC `crm_lift_suppression` (soft-delete)
- Resolusi lewat identity_hash (email ternormalisasi), BUKAN customer_id
- Suppression tak pernah dihapus (D-4), hanya "lifted"

### Tag (`lib/crm/tags.ts`)

8 namespace tertutup: `event`, `format`, `kategori`, `nilai`, `peran`, `produk`, `sumber`, `tipe`.
- Operator tag: `namespace:value` (dari CSV import)
- System tag: `batch:<uuid>`, `tagged:<uuid>`, `csv_import`, `activity_ingest`
- `batch:` tag DITOLAK dari input CSV (mencegah rollback injection)
- Dijaga parity test (`tags.parity.test.ts`) yang mengunci TS ↔ SQL

### RBAC (`lib/auth/roles.ts`)

3 peran aktif: `super_admin` (semua), `crm_manager` (hampir semua, tanpa role admin/merge/delete/import),
`viewer` (masked view only, tanpa write). 4 peran retired (fail-closed ke null).
15 PRD actions + 4 extensions. Grant types: allow, deny, masked, own_unit (needs scope).

### Dashboard (`lib/crm/dashboard.ts`)

5 blok progresif:
1. **Immediate** (~250ms): pool size, contact coverage, import count, workflow count
2. **Reach** (live, never cached): emailable/whatsappable/everContacted
3. **Mirror** (snapshot): unit spread, RFM, candidates, fitco, freshness
4. **Events** (live): per-product event registrations
5. **Sources** (live): per-source gap vs frozen pool

Mirror block reads precompute dari `crm_mirror_meta.dashboard_stats` (~0.14ms). Fails hard kalau
precompute absent (never substitutes zeros).

### Email Provider (`lib/email/send.ts`)

Runtime switch `EMAIL_PROVIDER` (mailtrap|resend, default mailtrap). Read fresh setiap kirim (no
module-level capture — env change tanpa restart). Shared contract: `OutboundEmail → SendReceipt`.
Rollback = sakelar env, nol perubahan kode.

- Mailtrap: `crm@20fit.id`, API `send.api.mailtrap.io`
- Resend: `info@20fit.id`, API `api.resend.com`, Svix signature
- Runbook peralihan lengkap: `docs/RUNBOOK-pindah-resend.md`

### i18n (`lib/i18n/`)

Indonesia (default) + English. Cookie-based (`20fit_lang`). Semua angka/tanggal lewat `Intl` formatter
dengan timezone `Asia/Jakarta`. Coverage guard: setiap layar terdaftar sebagai BILINGUAL atau PENDING.
Scan otomatis untuk string Indonesia terlewat.

---

## 5. Status Saat Ini (10 Sep 2026)

### Yang Sudah Bisa ✅

- Pool tunggal 82.830 profil, identitas terpadu (email + telepon ternormalisasi)
- Cermin harian dengan precompute dashboard (~49ms segmentasi)
- Segmentasi 10+ kriteria, 10 segmen tersimpan, tag-based segmentation
- Komposer kampanye: pratinjau, uji-kering, gerbang konfirmasi
- Jalur kirim massal background (batch drainer, 200/batch)
- Suppression gerbang tunggal, dihormati lewat identity_hash
- Tautan berhenti berlangganan (berfungsi, terekam, bisa diaudit)
- Bounce auto-stop 5% (min 20 sample)
- Import CSV massal (max 15.000 baris, tag per baris, consent wajib)
- Sender name per template (migrasi sender_name ada)
- Dual email provider (Mailtrap + Resend) dengan sakelar runtime
- RBAC 3 peran, audit trail, data masking
- Bilingual id/en dengan coverage guard
- 1.711 tes, 6 parity test (TS ↔ SQL)

### Yang Belum ❌

| # | Pekerjaan | Prioritas | Catatan |
|---|---|---|---|
| 1 | Auto-suppress bounce keras | P0-4 | Webhook merekam bounce, tapi tidak auto-suppress |
| 2 | Pool beku — pipeline harian | P1-3 | 1.872 orang di sumber hidup belum masuk. Rancangan selesai, 4 keputusan pemilik pending |
| 3 | 127 email_normalized NULL | P1-2 | Prasyarat pipeline; 28 bisa jadi duplikat |
| 4 | Entri satu orang CS | P2-1 | UI + validasi di atas RPC yang sudah ada |
| 5 | Kriteria usia segment builder | P2-2 | Data di cermin, criteria nol. 2.232 tanggal ambigu hari-bulan |
| 6 | Dukungan Excel (.xlsx) import | P2-5 | Nol referensi xlsx di codebase |
| 7 | Pindahkan tgl lahir ke master_customer | P2-6 | Untuk halaman profil + pembaca non-cermin |
| 8 | Workflow engine aktif | P3-5 | 1 workflow didefinisikan, 0 pernah jalan |
| 9 | Paparan tulis master_customer (T-17) | P0-6 | Eskalasi ke Jeff, bukan teknis |
| 10 | Webhook belum aktif | — | delivered_at = 0 untuk semua kiriman. Config webhook perlu dilakukan di dashboard provider |

### Angka Kunci (potret 7 Sep 2026 — lihat ACUAN-UTAMA untuk terkini)

```
Profil di pool                    82.830
Bisa dikirimi email               82.213
Pernah benar-benar sampai            126   (0,2%)
Bounce                                 5   (nol di-suppress)
Kegagalan tak terkirim            18.119   (3 Sep, penyebab tercatat)
Gender terisi                          0%
Tanggal lahir (pool)                   0%   (tapi 5.442 di staging/cermin)
Kota terisi                          7,0%
Segmen tersimpan                      10
crm_suppression                    1 baris
```

---

## 6. Konvensi dan Pola yang WAJIB Diikuti

### Pagar (Guards)

Proyek ini memiliki **8 instans kegagalan senyap** yang terdokumentasi. Pola pencegahan:

1. **Parity test:** Saat aturan hidup di dua tempat (TS + SQL), test membaca kedua sisi dan assert
   mereka cocok value-for-value. 6 parity test aktif.

2. **Doc freshness guard** (`lib/docs/doc-freshness.ts`): Dokumen dengan angka besar WAJIB punya baris
   `⏱ DIUKUR: <tanggal>`. Lebih tua dari 30 hari → gagal. 31 dokumen legacy belum punya marker
   (daftar hanya boleh menyusut).

3. **Angka dihitung, bukan ditulis tangan** (K-10): Nol angka hardcode di komponen.

4. **Satu angka satu tempat:** Angka yang sama TIDAK boleh muncul di dua tempat (mencegah dua
   angka berselisih di satu halaman).

5. **Nol pengurangan populasi** — setiap "berapa orang" ditulis sebagai SATU kueri dengan
   `NOT IN (...)` eksplisit, bukan selisih dua kueri.

### Konvensi Kode

- **Modul murni (pure)** vs **server-only**: Modul tanpa I/O bisa diuji tanpa mock. Modul dengan
  Supabase client diberi `import "server-only"`.
- **Port pattern:** Mesin kirim (`send-run.ts`) menerima `SendPorts` — semua side-effect disuntik.
- **Normalisasi di SATU tempat saja** (K-06): `lib/crm/normalize.ts`. SQL hanya boleh menolak, tidak
  normalisasi.
- **Fail-closed default:** Role tidak dikenal → deny. Secret kosong → reject. Data hilang → throw,
  bukan return nol.
- **Error tanpa PII:** Pesan error tidak boleh mengandung alamat email, konten, atau data penerima.
  Hanya kode status HTTP.
- **Append-only untuk audit dan template** (K-14): `crm_message_template` dan `crm_audit_log` tidak
  boleh dihapus.
- **Suppression resolusi identity_hash, bukan customer_id** — profil yang dibuat ulang tetap tersaring.
- **Numbered color classes dilarang** (K-11): Token-based saja.

### Konvensi Git/Deploy

- **Merge ke `main` = deploy ke produksi** (Railway auto-deploy)
- **Gate hijau wajib sebelum merge:** `tsc --noEmit` + `next lint` + `vitest run` + `next build`
- **Agen tidak merge sendiri** — pemilik memberi izin merge eksplisit per-PR
- **Migrasi bergerbang:** SQL ditampilkan, TIDAK diterapkan ke produksi sampai pemilik menyetujui
- `supabase db push` tidak aman sampai sapuan `migration repair` selesai (P3-7)

### Konvensi i18n

- Kunci pesan di `lib/i18n/messages/{id,en}.ts`. Bahasa Indonesia kanonis (type `Messages` dari `id.ts`).
- Setiap layar di `ALL_SCREENS` harus terdaftar sebagai `BILINGUAL` atau `PENDING`.
- Scan otomatis (`untranslated-scan.ts`) mendeteksi string Indonesia di layar bilingual.
- Angka/tanggal via `formatCount`, `formatDate`, dst. — timezone selalu `Asia/Jakarta`.

---

## 7. Sistem Pelacakan

### Temuan (TEMUAN.md)

Register `T-xx`. Status: TERTUTUP / TERBUKA / MILIK TIM LAIN / DATA.
Temuan kunci yang masih terbuka:
- **T-02:** Masking bypass via `staging_20fit_data` (RLS OFF)
- **T-17:** `master_customer` + `customer_engagement` open write ke 1.358 akun
- **T-57:** Suppression per-orang atau per-saluran belum diputuskan
- **T-61:** Kegagalan cron tak diawasi siapa pun

### Keputusan (KEPUTUSAN.md)

Register `K-xx`. Setiap keputusan mencatat: kapan, apa, dan **apa yang bisa membalikkannya**.
Keputusan kunci:
- **K-05:** Format telepon kanonis `62...` tanpa `+` (mengikuti `master_customer`)
- **K-06:** Normalisasi di TS saja, SQL hanya menolak
- **K-08:** `0` = diukur-nol; `--` = tanpa sumber (jangan bingungkan)
- **K-10:** Nol angka hardcode di komponen
- **K-14:** Template dan audit append-only
- **K-57:** Dedup email-primary (telepon bukan kunci dedup)
- **K-64:** Tag kanon = atribut berulang; yang sekali-pakai = segmen manual
- **K-65:** Nama pengirim = parameter dengan default "20FIT CRM"

---

## 8. Environment Variables Penting

| Variable | Fungsi | Catatan |
|---|---|---|
| `EMAIL_PROVIDER` | `mailtrap` (default) atau `resend` | Sakelar runtime, tanpa restart |
| `MAILTRAP_API_TOKEN` | Token API Mailtrap | Wajib kalau provider = mailtrap |
| `MAILTRAP_FROM` | Alamat pengirim Mailtrap | `crm@20fit.id` |
| `MAILTRAP_WEBHOOK_SECRET` | Secret webhook Mailtrap (HMAC-SHA256) | Tanpa ini → semua webhook 401 |
| `RESEND_API_KEY` | API key Resend | Wajib kalau provider = resend |
| `RESEND_FROM` | Alamat pengirim Resend | `info@20fit.id` |
| `RESEND_WEBHOOK_SECRET` | Secret webhook Resend (Svix, `whsec_...`) | Tanpa ini → semua webhook 401 |
| `UNSUBSCRIBE_TOKEN_SECRET` | HMAC untuk identity_hash + tautan unsubscribe | Wajib, ≥16 karakter |
| `CAMPAIGN_SEND_ENABLED` | Master switch kirim (`true`/kosong) | Kosong = hanya ke @20fit.id |
| `NEXT_PUBLIC_APP_URL` | Base URL aplikasi | Fallback: `https://crm.20fit.id` |
| `NEXT_PUBLIC_SUPABASE_URL` | URL Supabase | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key Supabase | |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key | Dipakai semua operasi CRM |

---

## 9. Struktur Direktori

```
app/
├── (app)/           ← Halaman terautentikasi
│   ├── audience/    ← Daftar audiens, detail profil, import
│   ├── bod/         ← Dashboard direksi (Board of Directors)
│   ├── campaigns/   ← Komposer + riwayat kampanye
│   ├── consent/     ← Manajemen consent
│   ├── exports/     ← Ekspor data
│   ├── messages/    ← Log pesan
│   ├── quality/     ← Dashboard kualitas data
│   ├── segments/    ← Pembangun + daftar segmen
│   ├── settings/    ← Pengaturan (roles, batas kirim, diagnostik)
│   ├── templates/   ← Editor template email
│   └── workflows/   ← Workflow (belum aktif)
├── api/             ← API routes
│   ├── audience/    ← CRUD audiens + import
│   ├── campaigns/   ← Run kampanye + scheduled
│   ├── dashboard/   ← Data dashboard
│   ├── mailtrap/webhook/  ← Webhook Mailtrap
│   ├── resend/webhook/    ← Webhook Resend
│   ├── segments/    ← CRUD segmen + assist AI
│   ├── suppression/ ← Record + lift suppression
│   ├── templates/   ← CRUD template + preview
│   └── unsubscribe/ ← Proses berhenti berlangganan
├── login/, logout/, forgot-password/, reset-password/
├── health/          ← Health check
└── dev/             ← Preview komponen (dev only)

lib/
├── crm/             ← 94 modul bisnis (+ 85 test)
├── email/           ← Abstraksi provider email
├── auth/            ← RBAC roles + permissions
├── i18n/            ← Internasionalisasi
├── docs/            ← Doc freshness guard
└── supabase/        ← Supabase client helpers

components/
├── audience/        ← Pool, profil, import wizard
├── dashboard/       ← Stat card, bar list, BOD content
├── segments/        ← Builder, filter tree, tag picker
├── templates/       ← Block editor, template list
├── settings/        ← Audit, roles, send limits
├── consent/         ← Suppression form, lift dialog
├── shell/           ← App shell, sidebar, nav
├── ui/              ← Primitif (button, card, dialog, dll.)
└── i18n/            ← Lang switcher, coverage notice

docs/
├── ACUAN-UTAMA.md   ← Dokumen acuan tunggal (angka terukur)
├── KEBUTUHAN-SISTEM.md  ← Persyaratan dari pemilik
├── PETA-WORKFLOW.md ← Peta jalan workflow
├── RUNBOOK-*.md     ← Runbook operasional
├── RENCANA-*.md     ← Rencana fitur
├── KEPUTUSAN-*.md   ← Keputusan arsitektur
├── riwayat/         ← Arsip beku
│   ├── TEMUAN.md    ← Register temuan (T-xx)
│   ├── KEPUTUSAN.md ← Register keputusan (K-xx)
│   └── LINIMASA.md  ← Timeline proyek
└── gambar/          ← Screenshot

supabase/
└── migrations/      ← 52 file SQL migrasi
```

---

## 10. Prioritas Kerja (dari ACUAN-UTAMA)

Urutan mengikuti satu aturan: **kerjakan lebih dulu yang membuka pekerjaan lain.**

### P0 — Menghambat seluruh nilai sistem

| # | Pekerjaan | Milik | Status |
|---|---|---|---|
| P0-1 | Cek dashboard Mailtrap 3 Sep | Pemilik | Menunggu |
| P0-2 | Putuskan plafon kirim | Pemilik → Teknis | Menunggu |
| P0-3 | Jalur kirim massal | Teknis | ✅ Selesai |
| P0-4 | Auto-suppress bounce keras | Teknis | ❌ Belum |
| P0-5 | Jadwal ramp bertahap | Pemilik | Menunggu |
| P0-6 | Eskalasi paparan tulis T-17 | Jeff | Menunggu |

### P1 — Menghambat tujuan "hub seluruh ekosistem"

| # | Pekerjaan | Milik | Status |
|---|---|---|---|
| P1-1 | Impor 6 CSV | Pemilik | Menunggu |
| P1-2 | 127 email_normalized NULL | Teknis | ❌ Belum |
| P1-3 | Pipeline harian fase 1 | Pemilik → Teknis | Rancangan selesai, 4 keputusan pending |
| P1-4 | Impor sumber beku (1.549) | Teknis | ❌ Belum |
| P1-5 | Tinjau talent_accounts | Pemilik | Menunggu |

### P2 — Menghambat "data bisa dikelola dan digunakan"

| # | Pekerjaan | Milik | Status |
|---|---|---|---|
| P2-1 | Entri satu orang CS | Teknis | ❌ Belum |
| P2-2 | Kriteria usia segment builder | Teknis | ❌ Belum (data sudah di cermin) |
| P2-3 | Segmentasi tag | Teknis | ✅ Selesai |
| P2-4 | RBAC import untuk CS | Jeff | Menunggu |
| P2-5 | Dukungan Excel import | Teknis | ❌ Belum |
| P2-6 | Pindahkan tgl lahir ke master_customer | Teknis | ❌ Belum |

### P3 — Utang yang tidak menghambat tapi menua

P3-1 sampai P3-8 — lihat ACUAN-UTAMA untuk detail.

---

## 11. Risiko dan Perhatian Khusus

1. **Reputasi domain:** `20fit.id` belum pernah mengirim volume besar. Kiriman besar pertama dari domain
   tanpa riwayat = risiko folder spam permanen. Harus ramp bertahap.

2. **Kuota email dibagi:** Akun Resend `20fit.id` dipakai bersama 8 sistem 20FIT lain (tiket, POS,
   reset password). Kampanye CRM yang lepas kendali bisa menghabiskan kuota konfirmasi tiket pelanggan.

3. **RLS terlalu longgar (T-17):** 1.358 akun bisa menulis ke `master_customer` langsung. Bukan lubang
   publik (anon diblokir), tapi setiap klaim "pool terkendali" bergantung pada perbaikan ini.

4. **Migrasi repair** (P3-7): 30 berkas migration repair menggantung. `supabase db push` tidak aman
   sampai diselesaikan.

5. **Webhook belum aktif:** `delivered_at` = 0 untuk SEMUA kiriman. Webhook perlu dikonfigurasi di
   dashboard provider (bukan masalah kode).

---

## 12. Cara Menjalankan

```bash
# Install
npm install

# Dev server
npm run dev          # http://localhost:3000

# Typecheck
npx tsc --noEmit

# Lint
npm run lint         # next lint

# Test
npm run test         # vitest run (1.711 tes)

# Production build
NODE_ENV=production npm run build
```

**Prasyarat env:** Salin `.env.example` ke `.env.local`, isi minimal:
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`UNSUBSCRIBE_TOKEN_SECRET` (≥16 karakter).

---

## 13. Referensi Dokumen

| Dokumen | Isi |
|---|---|
| `docs/ACUAN-UTAMA.md` | **Sumber kebenaran tunggal.** Angka terukur + prioritas + risiko |
| `docs/KEBUTUHAN-SISTEM.md` | Persyaratan dari pemilik (24 Agu 2026) |
| `docs/PETA-WORKFLOW.md` | Peta jalan workflow (mapping, belum building) |
| `docs/RUNBOOK-pindah-resend.md` | Runbook peralihan Mailtrap → Resend |
| `docs/RUNBOOK-kirim-internal-pertama.md` | Runbook uji kirim internal pertama |
| `docs/RANCANGAN-pipeline-harian.md` | Rancangan pipeline harian (selesai, belum dibangun) |
| `docs/KEPUTUSAN-pipeline-harian.md` | 4 keputusan pemilik yang pending |
| `docs/MENUNGGU-TINDAKAN-MANUSIA.md` | Daftar menunggu keputusan non-teknis |
| `docs/riwayat/TEMUAN.md` | Register temuan (T-01 s/d T-77) |
| `docs/riwayat/KEPUTUSAN.md` | Register keputusan (K-01 s/d K-65) |
| `docs/riwayat/LINIMASA.md` | Timeline proyek |

---

*Dokumen ini dibuat untuk dipelajari oleh AI assistant. Untuk angka terkini yang terukur, selalu
rujuk `docs/ACUAN-UTAMA.md` — dokumen ini adalah ringkasan, bukan pengganti.*
