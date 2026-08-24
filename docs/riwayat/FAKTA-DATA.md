# Fakta Data — Terverifikasi ke Database

Semua angka di bawah **diukur langsung** ke proyek Supabase `cpvzwqptzcxnwzfzgrmt`,
bukan diperkirakan. Setiap blok bertanggal.

> **Jangan pakai estimasi perencana.** Daftar tabel di dashboard Supabase (dan tool
> `list_tables`) mengembalikan `pg_class.reltuples`, yaitu tebakan perencana yang bergeser
> sendiri. Untuk `staging_20fit_data`, estimasi memberi 87.966 lalu 87.226, sementara
> `count(*)` eksak = 88.536. Selalu `count(*)`.

---

## `master_customer` — 11 Agustus 2026

**Total: 82.253 baris.**

| Kolom | Terisi | % |
|---|---|---|
| `first_unit` | 82.253 | 100% |
| `full_name` | 82.238 | 99,98% |
| `email_normalized` | 81.637 | 99,25% |
| `phone_normalized` | 81.615 | 99,22% |
| `segment` | 81.011 | 98,49% |
| `city` | 5.786 | **7,03%** |
| `gender` | 0 | **0%** |
| `date_of_birth` | 0 | **0%** |
| `address` | 0 | **0%** |
| `notes` | 0 | **0%** |
| `tags` | 0 | **0%** |

Definisi "terisi" = `IS NOT NULL`. Diverifikasi 11 Agu: tidak ada nilai string kosong
di kolom-kolom ini, jadi NULL adalah keseluruhan ceritanya.

**Lifetime value**

| | Baris |
|---|---|
| `> 0` | 1.112 (1,35%) |
| `= 0` | 81.140 |
| `< 0` | **1** (−61.200.000) |
| `NULL` | 0 |

**Identifier & duplikat**

| | Baris |
|---|---|
| Punya telepon **atau** email | 82.253 (100%) |
| Telepon tidak berawalan `62` | 31 |
| Telepon berawalan `+` | **0** — panjang 10–15 |
| Email bukan huruf kecil | 0 |
| `is_potential_duplicate` | 15 |
| `is_merged` | 0 |
| Kohort `segment` NULL | 1.242 — rata-rata LTV **tertinggi** (segmentnya terbalik) |

**Sumber & waktu** — lihat T-08/T-09 di `TEMUAN.md`

| Sumber | Baris | `created_at` | `first_seen_at` |
|---|---|---|---|
| `20fit_data_import` | 81.178 | satu instan 2026-04-20 11:28 | semuanya 2026-04-20 |
| `live_txn_ingest` | 1.075 | satu instan 2026-07-31 12:27 | 5 Feb – 8 Agu, 162 hari |

`updated_at` = `created_at` untuk 99,12%. `last_activity_at` = `first_seen_at` untuk
99,62% (81.944 baris) — keduanya cap muat yang sama, bukan bukti aktivitas.
**14 baris** punya `first_seen_at` > `created_at`, selisih terbesar 7 hari 11 jam.

**Indeks yang ada** (menentukan desain pencarian Sprint 3J)

| Indeks | Bentuk | Konsekuensi |
|---|---|---|
| `idx_master_customer_name_trgm` | GIN trigram atas `full_name` | substring nama terindeks |
| `idx_master_customer_phone_unique` | btree UNIQUE atas `phone_normalized` | **hanya sama-persis** |
| `idx_master_customer_email_unique` | btree UNIQUE atas `email_normalized` | **hanya sama-persis** |
| `idx_master_customer_last_activity` | btree atas kolom terlarang | tak dipakai |

Tidak ada indeks atas `city` — filter kota adalah seq scan.

---

## Tabel terkait — 11 Agustus 2026

| Tabel | Baris | Catatan |
|---|---|---|
| `customer_orphan` | 32 | tak bisa dikaitkan ke satu profil master |
| `customer_excluded` | 6.361 | alasan pengecualian belum ditinjau ulang |
| `staging_20fit_data` | **88.536** | RLS **OFF** — lihat T-02 |
| `customer_engagement` | 90.419 | **dipakai sejak 3N** — lihat blok di bawah |

## `customer_engagement` — 11 Agustus 2026 (Sprint 3N)

Tabel EKSISTING, dibaca di tempat (nol ingestion, nol salin ke `crm_*`). Dikaitkan ke
profil lewat `customer_id`.

| Fakta | Nilai |
|---|---:|
| Baris | 90.419 |
| Baris `customer_id` NULL | 0 |
| Baris yatim (tak ada di `master_customer`) | 0 |
| Profil master berbeda tercakup | 82.089 / 82.253 (**99,80%**) |
| Unit berbeda | 6 (`arena`, `clinic`, `event`, `gym`, `membership`, `shop`) |
| Produk berbeda | 25 |
| `last_seen_at = first_seen_at` (**cap muat**) | 89.974 (**99,51%**) |
| `last_seen_at > first_seen_at`, ≤ hari ini (**aktivitas nyata**) | 444 (0,49%) |
| `last_seen_at` di masa depan (anomali) | 1 (2026-12-05) |
| Sumber | 2 — `20fit_data_import` (89.051, 0 nyata), `live_txn_sync` (1.368, 444 nyata) |

Aktivitas nyata **hanya** di dua produk `live_txn_sync`: Transaksi Clinic (274) + Transaksi
Arena (170). Sebaran didominasi `membership/Fitco User` = 67.828 baris (75%). Kolom
`raw_value`/`source_row_id`/`period` **tidak** dibaca aplikasi (potensi data sumber sensitif).
→ T-14, K-19. Sumber aktivitas lain yang BELUM masuk sini: `docs/SUMBER-AKTIVITAS.md`.

## Kerapian data & pelengkapan — 11 Agustus 2026 (Sprint 3P)

**Nama** (`master_customer.full_name`): 30.307 campur-aduk, 23.415 huruf kecil semua, 3.525
kapital semua, **281 mengandung angka** (ditandai `/quality`), 34–38 spasi ganda/tepi.
Dirapikan di tampilan (`lib/crm/display-name.ts`), data tak disentuh.

**Email typo** (domain): `gmaol.com` **986** (SEMUA impor 20 Apr satu instan → sistematis,
T-16), `gmail.con` 204, `gmai.com` 82, `gamil.com` 49. Ditandai, tak dikoreksi.

**Pencocokan enrichment** (via `normalizeEmail`, K-06; **DIBANGUN 3R**): Hyrox **152 profil**
(288 baris — satu email s/d 8×), `my20fit_profile` **169**, `my20fit_user_activity` **44**
(recency asli), `rc_team_members` **0** (nama-saja, tak dicocokkan). NIK **bukan** kunci
(master tak punya kolomnya). **131 aktivitas tak-cocok = memang belum ada di master** (bukan
gagal normalisasi — diverifikasi absen di `email_normalized` dan `email`). Cakupan tampil live
di `/quality`. Detail: `docs/SUMBER-AKTIVITAS.md`.

**Consent** (`crm_consent`): **0 baris** — backfill DITAHAN (SIGNOFF 3P). Peta `basis`→`purpose`
di `lib/crm/consent-policy.ts` (`legacy_import_unverified`→marketing **⛔** sampai flag legal dibalik).

## Tabel `crm_*` — 11 Agustus 2026

| Tabel | Baris | RLS | Policy |
|---|---|---|---|
| `crm_user_role` | 2 | ON | 0 |
| `crm_audit_log` | **43** (11 Agu 09:05 UTC), bertambah | ON | 0 |
| `crm_consent` | 0 | ON | 0 |
| `crm_suppression` | 0 | ON | 0 |
| `crm_profile_demographic` | 0 | ON | 0 |
| `crm_profile_behavior` | 0 | ON | 0 |
| `crm_profile_scores` | 0 | ON | 0 |

`crm_consent`: 4 CHECK, UNIQUE `(customer_id, channel, purpose)`, FK ke `master_customer`
dengan `ON DELETE SET NULL` (`confdeltype='n'`, bukan cascade).

## Fungsi `crm_*` — setelah migrasi 10, 11 Agustus 2026

| Fungsi | `SECURITY DEFINER` | Return | `EXECUTE` |
|---|---|---|---|
| `crm_record_suppression` | ya | `jsonb` | `postgres`, `service_role` |
| `crm_lift_suppression` | ya | `jsonb` | `postgres`, `service_role` |
| `crm_purge_audit_log` | ya | `record` | `postgres`, `service_role` |
| `crm_audit_log_no_mutate` | tidak | **`trigger`** | terbuka — **inert**: PostgREST tak bisa mengekspos fungsi trigger sebagai RPC, dan ia `SECURITY INVOKER` |

**102** fungsi `SECURITY DEFINER` di luar `crm_*` masih anon-executable — T-03 (diukur ulang
11 Agu, Sprint 3O; naik dari 101).

## Paparan data sensitif — tabel RLS OFF, 11 Agustus 2026 (Sprint 3O)

Sapuan skema `public`: tabel **RLS OFF** yang memuat data pribadi sensitif. **Hitungan saja**
— nol nilai diambil. Milik tim lain; lihat `docs/ESKALASI-paparan-data-sensitif.md` (T-15).

| Tabel | RLS | Baris | Kolom sensitif (terisi) |
|---|---|---:|---|
| `cf_hyrox_participants` | OFF | 1.038 | NIK **1.030** (812 berbeda), tgl_lahir 1.037, gol_darah 1.038, kontak_darurat 1.035, no_kontak_darurat 1.036 |
| `clinic_assessments` | OFF | 149 | `diagnosis` (jsonb) 107 |
| `clinic_screenings` | OFF | 131 | blood_type 41, health_medications 20, health_surgeries 26, health_* (jsonb), last_menstrual_period 0 |
| `cf_user` | OFF | 4 | `password` (bernama polos, bukan `_hash`) 4 |
| `rb_registrations` | OFF | 9 | `password_hash` 9 (ter-hash) |
| `events` | OFF | 17 | `timeline_share_token` 2 |
| `staff_password_resets` | OFF | 0 | kosong |

`staging_20fit_data` (T-02): **88.536**, RLS OFF (tak berubah).

> **KOREKSI 3Q (T-17, K-23):** blok di atas mengukur `relrowsecurity` **saja**. Itu tak
> cukup — RLS ON **tidak** berarti tolak-default: `master_customer`/`customer_engagement` RLS
> ON tapi policy `authenticated_full_access` (`ALL`/`USING true`) → **baca+tulis untuk 887
> akun**. Klasifikasi benar (RLS × policy × grant): **199 anon-open, 43 login-open, 141
> terkunci**; hanya `crm_*` yang benar-benar terkunci. Kueri: `docs/PASCA-MERGE-monitoring-revert.md`.
> Tabel RLS-ON lain di atas (`rb_staff`, `talent_accounts`, dll.) **perlu dicek policy-nya
> satu per satu** sebelum disebut "tidak terbaca anon" — belum dilakukan (lihat "tidak bisa diverifikasi").

## Pemakaian nyata `crm_audit_log`

Pertumbuhan 10–11 Agustus: 20 → 22 → 25 → 27 → 32 → 33 → 35 → **43** (11 Agu 09:05 UTC).
Hampir seluruhnya `list.viewed` dari `tifany@20fit.id`, tiga aktor berbeda total (termasuk
`system:seed` dan `system:retention`). **Diperbarui sprint dokumentasi:** delapan baris
baru sejak berkas ini ditulis, termasuk `id=44–47` — pembukaan pertama layar audit
`/settings` (lihat baris "penting" di bawah).

Baris penting:

| id | Waktu (UTC) | Arti |
|---|---|---|
| 1 | 10 Agu 13:18 | `test.trigger_check` — artefak verifikasi Sprint 2B, sengaja dipertahankan |
| 2–3 | 11 Agu 03:46 | `role.granted` — seed dua `super_admin` |
| 4 | — | dihapus oleh uji purge Sprint 3A (sintetis) |
| 5 | 11 Agu 03:50 | `retention.purge_executed` — artefak verifikasi, sengaja dipertahankan |
| 18 | 11 Agu 05:38 | `filters.city = "tifany"` — bukti nilai filter tersimpan verbatim (T-13) |
| **32** | **11 Agu 07:30** | **`target_table='crm_consent'`, `view='consent_register'` — bukti Sprint 3F berjalan di produksi** |
| **44–47** | **11 Agu 09:04–09:05** | **`list.viewed`/`crm_audit_log` — pembukaan PERTAMA layar audit `/settings`, `tifany@20fit.id`. Bukti Sprint 3C `/settings` berjalan di produksi** |

**Diperbarui 11 Agu 09:05 UTC (sprint dokumentasi):**
- `profile.viewed` = **0** — masih benar; detail profil `/audience/[id]` belum pernah dibuka.
- `target_table='crm_audit_log'` = **4** (dulu 0) — `/settings` **kini terbukti jalan di
  produksi** (id 44–47). Berkas ini sebelumnya menulis 0; itu sudah bergerak.
- `search.performed` = **0** — Sprint 3J belum di-deploy (masih di branch).

---

## `crm_consent` — 12 Agustus 2026 (sesudah Migrasi 11 + 12)

**Total: 408.119 baris.** Ditulis oleh backfill legacy (Migrasi 11, `source='20fit_data_import'`,
`basis='legacy_import_unverified'`, semua `status='active'`). Diverifikasi `count(*)` eksak.

| purpose | channel | baris |
|---|---|---|
| `marketing` | `email` | 81.637 |
| `marketing` | `whatsapp` | 81.615 |
| `transactional` | `email` | 81.637 |
| `transactional` | `whatsapp` | 81.615 |
| `transactional` | `phone_call` | 81.615 |
| **Total** | | **408.119** |

**Profil contactable (distinct `customer_id`, `status='active'`):**

| purpose | distinct customer |
|---|---|
| `marketing` | **82.253** |
| `transactional` (layanan) | **82.253** |

= seluruh pool ber-identitas (email ∨ phone = 82.253). Suppression aktif = **0**, jadi
contactable = distinct consenting. `sms` & `marketing`+`phone_call` sengaja tak diisi.
`count(distinct customer_id)` langsung = 82.253, cocok jalur baca aplikasi (inner-embed parent
count); interpretasi flat (hitung baris) = 163.252 marketing, sengaja dihindari.

Indeks `crm_consent_purpose_status_customer_idx (purpose, status) include (customer_id)`
(Migrasi 12): hitung contactable tak-terbatas ~17 dtk → ~2,9 dtk (index-only scan).

**Kinerja terukur (12 Agu 2026), dua query berbeda dua kemacetan berbeda:**
- Jalur aplikasi (inner-embed semi-join ke master_customer, yang benar-benar dijalankan app):
  **~2,9 dtk** — sisa biaya **hash join** tumpah ke disk (Batches 4; work_mem instance 2184 kB),
  bukan lagi scan `crm_consent`.
- `count(distinct customer_id) from crm_consent` mentah: **~1,3 dtk** — kemacetannya **sort**
  tumpah ke disk (external merge 3200 kB), memakai indeks (Index Only Scan). **Aplikasi tak bisa
  menjalankan ini**: supabase-js hanya PostgREST (tak ada `count(distinct)`, tak ada `SET
  work_mem` per sesi), dan RPC dilarang siklus ini. Jadi ~2,9 dtk = lantai aplikasi sekarang.
- Perbaikan sub-detik sesungguhnya = **RPC `SECURITY DEFINER`** yang menjalankan `count(distinct)`
  dengan `set local work_mem` per panggilan — tindak lanjut terjadwal, **belum dibuat**.

---

## staging_20fit_data — sumber impor asli (Sprint 3Y, diukur 12 Agu 2026)

Tabel yang sama dengan impor `master_customer`, **RLS OFF** (T-02). Nol tulis, nol salin —
dibaca & digabung saat tampil.

**Volume & kecocokan:**

| | Terukur |
|---|---|
| Baris | **88.536** |
| Punya email | **88.445** (88.409 distinct ternormalisasi) |
| Cocok ke `master_customer` lewat email | **81.079** dari 82.253 profil = **98,62%** |
| Punya tanggal lahir | **5.467** (`master_customer.date_of_birth` = **0**) |
| Punya kota | 5.834 · Punya Umur | 5.467 |

`count(distinct join)` tak bisa live via PostgREST → 98,6% diangkat sebagai artefak bertanggal
(`VERIFIED_ARTIFACTS.staging_email_match`), bukan angka live.

**Tanggal lahir (semua ISO `yyyy-mm-dd`):**
- 0 baris dengan field bulan > 12 → **tidak ada yang terbukti tertukar** (beda dari
  `cf_hyrox_participants`: 321 tertukar, T-16).
- **2.232 punya bulan DAN hari ≤ 12** → urutan tak bisa dipastikan dari nilai → **ditandai
  ambigu**, tak ditebak. 3.235 tak ambigu (hari > 12 mengunci urutan).
- Umur silang (as-of snapshot 20 Apr 2026, memvalidasi TAHUN — menukar hari-bulan tak mengubah
  umur): 4.525 sama persis, 941 beda 1 tahun (drift snapshot, wajar), **0 beda ≥ 2 tahun**
  (nol konflik tahun nyata). 1 baris Umur non-numerik.
- Umur tak masuk akal: 13 > 100 th (thn < 1920), 1 di masa depan, 89 < 10 th → **ditandai
  `implausible`**, bukan dibuang. 5.365 wajar.
- **Umur dihitung dari tanggal, bukan dari kolom `Umur`** (snapshot basi 20 Apr 2026).

**RFM (`RFM per paid order`), 5 nilai tersimpan — ejaan dipertahankan apa adanya:**

| nilai | jumlah |
|---|---|
| New User | 81.213 |
| Potensial user | 7.057 |
| `-` (tanpa bucket) | 200 |
| Loyal user | 65 |
| `Campion user` (salah eja, **tidak** diperbaiki) | 1 |

`RFM per revenue` = **0% terisi** (semua NULL).

**Keikutsertaan program (`-` = tidak, NULL = kosong — dibedakan). Diukur ulang:**

| kolom | ikut | | kolom | ikut |
|---|---|---|---|---|
| Fitco User | 74.914 | | Iwhm 2025 5k/10k/21k | 1.251 / 1.179 / 414 |
| Mandiri RUNFEST 5K/2.7K/10K | 6.762 / 416 / 686 | | Raya run 2025 5k/10k | 1.014 / 998 |
| Jhm 2025 5k/10K/HM | 2.555 / 2.082 / 1.431 | | Sportfest Half/Relay/Double/Single | 73 / 24 / 80 / 70 |
| Jhm 2024 5k/10K/HM | 124 / 160 / 75 | | Training / Physio / Protection | 65 / 7 / 17 |
| Padel rabel (`Padel rebel`) | 1.358 | | Pasien Clinic 24-25 / 25-26 (klinis) | 100 / 365 |
| **Arena / GYM / Paid Shop** | **0 / 0 / 0** (nol terukur, K-08 — barisnya tetap ditampilkan) | | | |

---

## Sumber ekosistem bertumbuh — diukur ulang 19 Agu 2026 (audit keadaan)

Tabel sumber tim lain **terus bertambah** sejak angka bertanggal di atas. Diukur langsung:

| tabel sumber | dulu (bertanggal) | 18 Agu | **19 Agu** |
|---|---|---|---|
| `my20fit_profile` | 886 | 916 | **918** |
| `clinic_patients` | 143 | 169 | **176** |
| `cf_hyrox_participants` | 1.038 | — | **1.038** |
| `staging_20fit_data` | 88.536 | — | **88.536** |
| `master_customer` | 82.253 | — | **82.253** |

**Konsekuensi:** `crm_customer_mirror` adalah snapshot yang disegarkan **cron harian** (K-30).

**Cron terbukti — eksekusi pertama (diverifikasi 20 Agu 2026):** job pg_cron `crm-refresh-customer-mirror`
(jobid 9, `0 20 * * *`) menembak **19 Agu 2026 20:00:00 UTC** (= 03:00 WIB 20 Agu) tepat waktu,
`status = succeeded`, **durasi 9,02 detik**, dan `crm_mirror_meta.refreshed_at` benar-benar **bergerak**
dari `2026-08-18 04:11:45 UTC` ke `2026-08-19 20:00:00 UTC`. Konversi zona (UTC→WIB) terbukti di dunia
nyata, bukan hanya di atas kertas; cermin cocok dengan sumber langsung setelahnya (`has_my20fit` 175 =
175). Catatan: **9,02 dtk adalah satu sampel pada cermin yang sudah hangat** — bukan angka worst-case;
durasi bisa berbeda saat sumber tumbuh atau saat cold cache.

Sebelum eksekusi ini penanda cermin tertinggal saat sumber tumbuh (persis alasan cap `refreshed_at`
ditampilkan, Sprint 5A/5B); kini cron memperkecil peluang basi itu ke ≤24 jam. Refresh manual tetap
ada; ambang basi 24 jam tetap; cron **memperkecil peluang** basi, tak menjaminnya (job yang gagal diam
justru muncul sebagai peringatan basi + `cron.job_run_details` status='failed').

---

## Ekspor per kategori — kegagalan nyata pertama & perbaikannya (20 Agu 2026)

Ekspor CSV sungguhan **pertama** (oleh `tifany@20fit.id`, 20 Agu 2026 04:13 UTC) **gagal
diam-diam**: berkas `segmen-2026-08-20.csv` berisi blok provenans + baris judul kolom lalu
**berhenti** — nol baris data, tanpa baris penutup `# EOF total_baris=`. `export.performed` di
audit = **0** (jalur audit sehat — akun yang sama mencatat `list.viewed`/`profile.viewed`
03:52–03:53). Karena audit ditulis **setelah** streaming selesai, ketiadaannya membuktikan
streaming tak pernah selesai.

**Sebab (ditemukan sebelum perbaikan, TUGAS 1):** jalur **hitung** (`computeSegment`) memilih
kolom `customer_id` saja; jalur **ambil-baris** (`streamSegmentCsv`) memilih **semua**
`EXPORT_COLUMNS`. Daftar itu menyebut `phone` — kolom yang **tidak ada** di `master_customer`
(kolom aslinya `phone_normalized`; `phone` absen — dikonfirmasi ke `information_schema`,
20 Agu 2026). Jadi hitung sukses, ambil-baris melempar `column master_customer.phone does not
exist` **setelah** HTTP 200 + judul terkirim → berkas terpotong tanpa status galat. Hanya jalur
hitung yang pernah diuji (pola "satu aturan, dua implementasi" yang sudah tiga kali menggigit
proyek ini: kanon telepon, daftar retensi, paritas `crm_norm_phone`).

**Perbaikan + celah ditutup:**
- Kolom diarahkan ke `phone_normalized` (`export-constants.ts`) + kunci header i18n disesuaikan.
- Test baru `export-row-path.test.ts` menjalankan **kedua** jalur untuk keempat kategori atas
  satu dataset; fake DB-nya memvalidasi kolom terpilih ke kolom `master_customer` **sungguhan**
  dan melempar "column does not exist" seperti Postgres. **Terbukti menggigit:** dikembalikan ke
  `phone` → 5 test gagal.
- Kegagalan streaming kini **kelihatan**: throw di tengah menulis baris
  `# GAGAL: ekspor terputus, jangan pakai berkas ini`, melewati audit + EOF sukses, dan mencatat
  `stream_row_fetch_failed` (tanpa PII).
- Berkas kini diawali **UTF-8 BOM** (Excel tak lagi merusak `—` → `â€"`), dan baris `# kriteria:`
  menuliskan **kategori sebenarnya** (mis. "punya email DAN tanpa telepon"), bukan "filter
  lanjutan (AND/OR)" generik.

**Belum terbukti (jujur):** jalur unduh di balik login — sandbox tak punya sesi. Instruksi uji
untuk pemilik produk (email-only, harap `# EOF total_baris=638`, + SQL cek satu `export.performed`)
di `docs/VERIFIKASI-ekspor-per-kategori.md`. Ekspor sintetis **tidak** ditulis (audit append-only,
non-atribusi).

---

## Cron cermin — lima malam berturut, precompute utuh (diverifikasi 24 Agu 2026)

Job pg_cron `crm-refresh-customer-mirror` (jobid 9, `0 20 * * *` = 03:00 WIB) telah berjalan
**lima malam berturut-turut**, semuanya `status=succeeded`, semuanya tepat 20:00:00 UTC:

| start_time (UTC) | status |
|---|---|
| 2026-08-19 20:00 | succeeded |
| 2026-08-20 20:00 | succeeded |
| 2026-08-21 20:00 | succeeded |
| 2026-08-22 20:00 | succeeded |
| **2026-08-23 20:00** | **succeeded** (refresh terakhir) |

`crm_mirror_meta.refreshed_at` = **2026-08-23 20:00:00 UTC**, dan **keenam blok
`dashboard_stats` utuh**: `candidates, ecosystem, engagement, fitco, rfm, sources`. Ini yang
dipakai dashboard C (pembaca precompute fail-hard) — sekarang selalu punya blob lengkap untuk
dibaca; bila suatu malam gagal atau sebuah blok hilang, pembaca melempar dan blok snapshot di
dashboard menampilkan keadaan gagalnya sendiri (bukan halaman kosong, bukan nol palsu).

_(Catatan: sempat disebut "empat malam" — pengukuran langsung menunjukkan **lima** malam, 19–23
Agu; angka terverifikasi yang dicatat.)_

---

## Mailtrap — domain 20fit.id terverifikasi, prasyarat DNS kampanye terpenuhi (dilaporkan 24 Agu 2026)

Kabar baik dari dasbor Mailtrap (dilaporkan pemilik produk 24 Agu 2026), relevan untuk separuh
"menghubungi" yang akan dibangun:

- **Domain `20fit.id` berstatus _Verified_** di Mailtrap — SPF/DKIM/DMARC yang dibutuhkan sudah
  terpasang. Ini **prasyarat DNS untuk kampanye** yang selama ini dicatat sebagai belum tuntas;
  kini terpenuhi.
- **14.041 email terkirim dalam 30 hari terakhir** lewat domain ini — pipeline kirim nyata sudah
  jalan di produksi (bukan hanya sandbox).
- **Email reset kata sandi kini mendarat di _Inbox_** dari pengirim yang benar
  (`20FIT CRM <crm@20fit.id>`), bukan spam — jalur `sendRecoveryCode → Mailtrap` (lib/auth/recovery)
  bekerja end-to-end.

**Yang masih tersisa sebelum kampanye boleh dikirim:** hanya **rotasi token Mailtrap** (token lama
pernah terekspos; lihat MENUNGGU). DNS **bukan lagi** penghambat. Aturan tetap berlaku: **jangan
kirim satu email kampanye pun** sampai token dirotasi.

_(Sumber angka: dasbor Mailtrap, dilaporkan pemilik produk; dicatat sebagai fakta yang dilaporkan,
bukan hasil kueri DB kami.)_

## Reset kata sandi — TERBUKTI ujung ke ujung di produksi (24 Agu 2026)

Jalur reset terbukti bekerja end-to-end di produksi (bukti `auth.users`, `tifany@20fit.id`,
dilaporkan pemilik produk 24 Agu 2026):

- `recovery_sent_at = null` — token dibersihkan **setelah** dipakai (verifyOtp mengonsumsinya).
- `last_sign_in_at = 2026-08-24 16:21:21.448` → `updated_at = 2026-08-24 16:21:21.840` — **392 ms**
  setelahnya. Urutannya benar: **verifyOtp sukses → updateUser sukses**.
- Email dari `crm@20fit.id` mendarat di **Inbox**, kode terverifikasi, kata sandi berubah.

**Perbaikan empat-keadaan terbukti.** Kegagalan sehari sebelumnya memang **"kata sandi baru sama
dengan yang lama"** (updateUser 422) — persis diagnosis kami. Pesan lama menyembunyikannya sebagai
"kode salah"; kini penolakan kata sandi punya pesan sendiri (K-38, `lib/auth/reset-verify.ts`).

**Konsekuensi untuk kampanye:** ini juga membuktikan **Mailtrap + DNS bekerja untuk pengiriman
NYATA** (bukan hanya reset). Satu-satunya penghalang kampanye yang tersisa = **rotasi token**.
Butir "reset belum terbukti" **diturunkan** dari daftar yang menggantung.
