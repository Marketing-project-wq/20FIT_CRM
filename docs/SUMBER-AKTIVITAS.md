# Sumber aktivitas yang BELUM terwakili di `customer_engagement`

> **Status: PETA + KEPUTUSAN. Bukan rencana ingestion, bukan kode.** Sprint 3N membaca
> `customer_engagement` (90.419 baris) apa adanya. Dokumen ini memetakan **sumber aktivitas
> lain** yang ada di database tapi **tidak** masuk ke `customer_engagement` — apa isinya,
> lewat apa ia bisa dikaitkan ke seorang profil, apakah ia membawa waktu nyata, dan
> keputusan apa yang harus diambil **sebelum** satu baris pun boleh di-ingest. Tidak ada
> pipeline yang dibangun di sini (LARANGAN sprint).

Semua angka di bawah diverifikasi langsung ke database **11 Agustus 2026**.

## Pembaruan Sprint 3P (11 Agu 2026) — pelengkapan profil: diukur, DITAHAN dari build

TUGAS 2 Sprint 3P meminta melengkapi profil dari sumber ini. Investigasi + pengukuran
selesai; **pembangunannya ditahan** ke follow-up karena butuh penanganan data sensitif yang
tak boleh dikebut di akhir sprint besar (gerbang `profile.view_health` + masking + **aksi
buka teraudit** untuk NIK). Yang diukur ulang (via `normalizeEmail` = trim+lower, K-06):

| Sumber | Cocok (PROFIL berbeda) | Baris cocok | Catatan penting |
|---|---:|---:|---|
| `cf_hyrox_participants` | **152 profil** | 288 baris | **288 = baris, bukan orang.** Satu email mendaftar sampai 8× (relay/multi-event). Angka enrichment jujur per profil = **152**, bukan 288 |
| `my20fit_profile` | **169 profil** | — | cocok email ternormalisasi |
| `my20fit_user_activity` | **44 profil** | — | satu-satunya recency asli (`last_active_at` s/d hari ini) |
| `rc_team_members` | **0 (tak bisa)** | — | hanya berkunci **nama** — TIDAK dicocokkan (salah cocok = riwayat orang lain menempel) |

**NIK bukan kunci pencocokan.** `master_customer` tak punya kolom NIK — NIK hanya data yang
menempel **setelah** profil tercocok lewat email, bukan jembatan. Membangun pencocokan
berbasis NIK adalah kekeliruan mahal yang **tidak** dilakukan.

**Rencana build (follow-up):** lapisan baca enrichment (server-only, cocok via `normalizeEmail`,
**nol tulis** ke `master_customer`/`crm_*` — gabung saat tampil seperti `customer_engagement`).
Field non-sensitif (partisipasi event Hyrox + `registered_at`, status my20fit, `last_active_at`
nyata) boleh tampil. Field sensitif (NIK/tgl lahir/gol darah/kontak darurat) **digerbangi
`profile.view_health`** (super_admin, crm_manager), **disamarkan default**, dibuka lewat aksi
eksplisit yang **setiap pembukaannya diaudit**. Tingkat kecocokan tampil **di layar** ("tidak
ada data Hyrox untuk profil ini" bukan seolah tak pernah ikut). Aksi-audit-buka-NIK perlu
keputusan kelas retensi (denylist, K-09) — itu yang membuatnya keputusan tersendiri, bukan
tempelan layar.

## Kenapa keempat sumber ini tidak ada di `customer_engagement`

`customer_engagement` dikaitkan ke profil lewat **`customer_id` (uuid)** — 0 baris yatim,
setiap barisnya cocok ke `master_customer`. Keempat sumber di bawah **tidak punya
`customer_id`**. Mereka dikunci lewat **email** (tiga sumber) atau **nama saja** (satu
sumber). Itulah halangan utamanya: memasukkan mereka bukan sekadar `INSERT`, melainkan
**menyelesaikan identitas** (email/nama → `customer_id`) yang alur resolusinya belum ada —
dan sebagian membawa **data sensitif Fase 0** (NIK, golongan darah, siklus haid) yang punya
konsekuensi hukum tersendiri.

## Ringkasan

| Sumber | Baris | Dikunci lewat | Cocok ke master | Waktu nyata? | RLS | Catatan |
|---|---:|---|---:|---|---|---|
| `cf_hyrox_participants` | 1.038 | **email** (+nama) | 152 dari 506 email | **Ya** — `registered_at` (4 Jan–5 Des 2026) | **OFF** | NIK, gol. darah, tgl lahir, kontak darurat |
| `my20fit_profile` | 886 | **email** / `fitco_user_id` | 168 email | Sebagian (`created_at`, `fitco_linked_at`) | ON | Kondisi kesehatan, siklus haid, TB/BB |
| `my20fit_user_activity` | 175 | **email** | 44 email | **Ya, betulan** — `last_active_at` (15 Jul–**hari ini**), `ping_count`≤201 | ON | Satu-satunya sumber recency asli |
| `rc_team_members` | 1.545 | **nama saja** | — (tak bisa andal) | **Ya** — `finish_time`, `start_time` (16–19 Jul 2026) | ON | Data timing lomba; identitas cuma nama+chip |
| `rc_participant_photos` | **0** | `participant_id`/`team_member_id` | — | `taken_at` (kosong) | ON | **Tabel kosong** — disebut di prompt tapi 0 baris |

> **Koreksi angka prompt:** prompt menyebut "rc_participant_photos/rc_team_members 1545".
> Yang berisi 1.545 baris adalah **`rc_team_members`**; **`rc_participant_photos` kosong
> (0 baris)**. Keduanya tabel berbeda; hanya satu yang punya data.

## Per sumber

### 1. `cf_hyrox_participants` — 1.038 baris · pendaftaran HYROX

- **Identitas:** `email` + `full_name`. Tidak ada `customer_id`. 506 email berbeda; hanya
  **152** cocok ke `master_customer.email_normalized` — jadi **mayoritas peserta HYROX
  bukan** profil master. Ingest tanpa resolusi identitas akan membuat 350-an "orang baru"
  yang mungkin duplikat orang yang sudah ada dengan email berbeda.
- **Waktu nyata:** `registered_at` **asli** (4 Jan – 5 Des 2026). Ini kejadian betulan,
  bukan cap muat — berbeda dari `customer_engagement.last_seen_at`. Catatan: nilai maksimum
  `registered_at` = **5 Desember 2026 (masa depan)**, cacat tanggal yang sama polanya dengan
  baris masa-depan di `customer_engagement` (T-14).
- **Data sensitif (Fase 0):** `nik`, `tgl_lahir`, `gol_darah`, `kontak_darurat`,
  `no_kontak_darurat`. Ini persis kategori yang **dilarang ditampilkan** di CRM. Tabel ini
  juga **RLS OFF** → dapat dibaca siapa pun dengan anon key, termasuk NIK dan kontak
  darurat 1.038 orang. Itu paparan kelas **T-02/T-03** (bukan lingkup sprint ini untuk
  remediasi, tapi harus diangkat ke pemilik data — lihat `docs/RISIKO-masking-bypass.md`).

### 2. `my20fit_profile` — 886 baris · profil aplikasi my20fit

- **Identitas:** `email`, `phone`, `fitco_user_id` (text). 168 email cocok ke master.
  `fitco_user_id` menarik: ia bisa menjembatani ke kohort **membership/Fitco User**
  (67.828 baris) di `customer_engagement` — kalau resolusinya dibangun.
- **Waktu:** banyak stempel (`created_at`, `updated_at`, `email_verified_at`,
  `fitco_linked_at`, `onboarding_skipped_at`) — kejadian profil, **bukan aktivitas
  berulang**. Bukan recency yang bisa dipakai segmentasi.
- **Data sensitif (Fase 0):** `health_conditions` (jsonb), `cycle_last_period` /
  `last_period_date` / `period_length` (**data siklus haid**), `height_cm`, `weight_kg`,
  `main_goal`. Data kesehatan — kelas paling sensitif. Tidak boleh ditampilkan; ingestion
  memerlukan dasar hukum tersendiri, bukan sekadar keputusan teknis.

### 3. `my20fit_user_activity` — 175 baris · aktivitas nyata aplikasi

- **Ini satu-satunya sumber dengan recency ASLI.** `last_active_at` membentang 15 Juli –
  **11 Agustus 2026 (hari ini)**, `first_seen_at` terpisah, dan `ping_count` (≤201)
  benar-benar menghitung kunjungan. Berbeda tegas dari SEMUA kolom waktu yang selama ini
  ternyata cap muat (T-08, T-09, T-14): di sini `last_active_at` ≠ cap muat.
- **Identitas:** `email` (+`auth_user_id`, `full_name`). Hanya **44** email cocok ke master.
  Jadi sumber recency terbaik yang kita punya juga yang **paling kecil cakupannya** — 44
  profil. Menjadikannya sinyal segmentasi berarti membangun resolusi email→`customer_id`
  untuk 44 orang, lalu jujur bahwa 82.209 sisanya tidak punya sinyal ini sama sekali.
- **Keputusan yang muncul:** kalau kelak ada kriteria waktu, ia harus datang dari sumber
  seperti **ini**, bukan dari `last_seen_at`/`first_seen_at` (K-19). Tapi cakupan 44/82.253
  membuatnya belum layak jadi filter — ia akan menyaring "44 orang yang kebetulan pakai
  app", bukan "yang aktif".

### 4. `rc_team_members` — 1.545 baris · timing lomba (relay)

- **Identitas: hanya `name` + `chip_code`.** Tidak ada email, telepon, maupun
  `customer_id`. Mencocokkan ke `master_customer` **hanya lewat nama** — tidak andal
  (homonim, ejaan, tanpa pembeda). Inilah alasan ia tak bisa masuk `customer_engagement`
  yang berbasis `customer_id`: tidak ada jembatan identitas yang bisa dipercaya.
- **Waktu nyata:** `start_time`, `finish_time` (16–19 Juli 2026 — satu akhir pekan lomba),
  `duration_ms`, `lap_count`, `last_tap_time`. Data timing betulan dan kaya — tapi terkunci
  di balik identitas yang tak bisa di-resolve.

### 5. `rc_participant_photos` — 0 baris

Kosong. Kolomnya (`participant_id`, `team_member_id`, `taken_at`, `storage_path`) mengaitkan
foto ke id internal `rc`, bukan ke orang. Tidak ada yang bisa dipetakan; disebut demi
kelengkapan karena ada di prompt.

## Keputusan yang harus diambil SEBELUM ingestion (tak satu pun diambil di sprint ini)

1. **Resolusi identitas dulu, ingestion belakangan.** Tiga sumber dikunci email, satu
   dikunci nama. Tidak ada alur email/nama → `customer_id`. Membangunnya adalah keputusan
   tersendiri (dan untuk email, harus memutuskan: buat profil baru untuk yang tak cocok,
   atau buang?). Pencocokan nama (`rc_team_members`) kemungkinan besar **tidak layak** tanpa
   pembeda tambahan.
2. **Dasar hukum untuk data sensitif.** NIK, golongan darah, kontak darurat
   (`cf_hyrox_participants`) dan data kesehatan/siklus haid (`my20fit_profile`) adalah
   Fase 0. Menyentuhnya di CRM butuh sign-off legal (seperti `docs/SIGNOFF-legal-consent.md`
   untuk consent), bukan keputusan engineering.
3. **`cf_hyrox_participants` RLS OFF adalah paparan aktif.** 1.038 NIK + kontak darurat
   dapat dibaca anon key hari ini. Angkat ke pemilik data (kelas T-02/T-03). Ini benar
   walau ingestion tak pernah terjadi.
4. **Recency yang jujur hanya bisa dari `my20fit_user_activity`** (`last_active_at` nyata),
   bukan dari kolom cap-muat. Tapi cakupannya **44/82.253** — belum layak jadi filter.
   Kriteria waktu tetap absen (K-19) sampai sumber recency asli mencakup porsi pool yang
   berarti. **Apa yang dibutuhkan agar 44 naik** (diukur ulang 11 Agu, Sprint 3O):
   - Kuncinya **email**. Pencocokan **wajib** lewat `normalize.ts` (**K-06** — normalisasi
     hanya di satu tempat), **bukan** perbandingan string mentah: 44 itu hasil `lower()` naif
     di SQL; email nyata perlu trim/normalisasi kanonik yang sama seperti telepon (K-05/K-06),
     dan angkanya bisa berubah setelah dinormalisasi benar. Selama pencocokan tak lewat jalur
     itu, "44" adalah batas bawah kasar, bukan angka final.
   - Naiknya cakupan **bukan** soal ingestion melainkan soal **resolusi identitas**: berapa
     banyak dari 175 pengguna aktif yang emailnya (setelah dinormalisasi) memetakan ke
     `master_customer`. Sisanya butuh keputusan Fase 0 yang sama (buat profil baru / buang).
5. **Konsumsi selektif, bukan borongan.** Kalau satu sumber di-ingest kelak, ingest hanya
   kolom yang berguna dan **aman** (mis. `registered_at` HYROX sebagai satu titik engagement
   event), **bukan** seluruh tabel dengan NIK-nya.

---

> **Konteks lintas-dokumen:** K-19 (kolom waktu bukan sinyal — diperluas 3N), T-14
> (`last_seen_at` cap muat 99,51%), T-02/T-03 (paparan RLS OFF), `docs/KOLOM-WAKTU.md`
> (cap muat vs waktu nyata), `docs/SIGNOFF-legal-consent.md` (pola sign-off untuk data
> berdasar-hukum). Batas sprint 3N: baca `customer_engagement` saja; nol ingestion; nol
> tabel/skema/RPC baru.
