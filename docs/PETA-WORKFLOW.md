# Peta Workflow — apa yang mungkin, apa yang bernilai (pemetaan, 31 Agu 2026)

> **Pemetaan, bukan pembangunan.** Nol tabel baru, nol workflow dibuat, nol kirim.
> Semua angka **diukur ulang langsung ke produksi** hari ini (bukan disalin dari prompt) —
> beberapa berbeda dari yang diperkirakan; lihat §1.

---

## 1. Angka kunci — DIUKUR ULANG 31 Agu (dan koreksinya)

| Hal | Diukur | Catatan / koreksi |
|---|---|---|
| `master_customer` | **82.830** | 99,3% punya email (**82.214** emailable) → kontaktabilitas hampir tak membatasi jangkauan |
| `crm_customer_activity` (lapisan recency) | **732** = **0,88%** pool | Batas penentu: workflow berbasis WAKTU hanya menyentuh <1% audiens |
| `crm_activity_event` | **1.460** | clinic_txn 364 · clinic_visit 345 · hyrox_registration 321 · arena_booking 233 · app_activity 197 |
| `crm_workflow` / `_enrollment` / `crm_scheduled_send` | **0 / 0 / 0** | Skema ada, belum ada satu pun baris |
| `crm_suppression` | **1** | Ada 1 orang sudah berhenti berlangganan (uji unsubscribe berhasil) |
| Profil baru Agustus | **577** | `source='activity_ingest'`, `created_at ≥ 1 Agu` — cocok |
| **Pengguna aplikasi** | **197**, BUKAN 349 | ⚠️ **Koreksi.** `my20fit_user_activity` = 197 orang. Angka 349 **tak dapat direproduksi** dari sumber mana pun (customer_engagement tak punya sumber app; app_activity distinct = 197). Pakai 197. |
| Penetrasi unit (distinct orang, `customer_engagement`) | membership **67.828** (81,9%) · event **18.247** (22,0%) · arena **2.075** (2,5%) · klinik **1.014** (1,2%) · shop 18 · gym 2 | Cocok persis dengan prompt |

**Jangkauan ORANG vs KEJADIAN — bedanya besar, dan ini yang harus terlihat di layar:**

| Sumber | Kejadian | **Orang berbeda** |
|---|---|---|
| hyrox | 321 | **289** |
| clinic_txn | 364 | 206 |
| my20fit (app) | 197 | **197** |
| clinic_visit | 345 | 148 |
| **arena** | **233** | **51** ⚠️ |
| clinic (visit ∪ txn) | 709 | **217** |

⚠️ **Arena: 233 kejadian = hanya 51 orang.** Workflow "tindak lanjut booking arena" menjangkau **51 orang**, bukan 233. Menyebut 233 akan menyesatkan penyusunnya.

---

## 2. Skema `crm_workflow` yang SUDAH ADA — apa yang sudah diputuskan

Migrasi 29 (`20260827110000_crm_workflow.sql`) + engine `runWorkflowAction` (`app/(app)/workflows/actions.ts`) sudah menetapkan banyak hal — **jangan rancang ulang tanpa membacanya:**

- **Hanya DUA jenis** (`type CHECK IN ('welcome','reengagement')`). Keduanya **berbasis waktu di lapisan aktivitas 732**:
  `welcome = joined_at ≤ trigger_days`, `reengagement = last_active_at ≥ trigger_days` (`resolveActivityTimeIds`).
- **Frekuensi sudah diputuskan oleh skema:** `unique (workflow_id, customer_id)` → **satu orang tak pernah masuk workflow yang sama dua kali**. Bagus untuk welcome; untuk re-engagement berulang berarti sekali seumur hidup.
- **Suppression diperiksa saat KIRIM**, bukan enrollment — `sendCampaign` menghormati `crm_suppression` + gate pra-luncur + audit `campaign.sent`. ✅ (sesuai syarat prompt)
- **Cara berhenti:** enrollment terminal (`queued→sent`), tak pernah di-enroll ulang → "berhenti" dengan tak masuk lagi. **Bukan drip berlapis** — satu kirim per workflow, bukan urutan langkah.
- **Pemicu saat ini: MANUAL.** `runWorkflowAction` dipicu **tombol** di `/workflows`. **Tak ada pemicu otomatis** (cron/trigger/webhook). Inilah keputusan arsitektur yang terbuka (§4).
- **Batas harian:** workflow kirim lewat `sendCampaign` yang menghitung `crm_message_log` hari ini → **workflow SUDAH memakan jatah harian 1.000 bersama kampanye manual**. Belum ada pembagian (§6).

**Konsekuensi penting:** skema saat ini **hanya** melayani #7 (reaktivasi = reengagement) dan bentuk sempit #1 (welcome bila di-key ke lapisan aktivitas). Workflow paling bernilai — **#1 welcome POOL baru (577), #2 lintas-unit (puluhan ribu), #3 adopsi app** — **tidak muat** di model `type`+`trigger_days` sekarang: pemicunya bukan waktu di lapisan 732, melainkan keanggotaan himpunan di `master_customer`/`customer_engagement`. Membangunnya berarti **memperluas skema** (jenis pemicu baru), bukan mengisi yang ada.

---

## 3. `crm_activity_event` diisi apa — mekanismenya sudah ada

`crm_rebuild_activity_events()` + `crm_refresh_customer_activity()` (migrasi 27, `crm_activity_layer.sql`):
membangun ulang event dari **tabel sumber hidup** (arena/klinik/hyrox/my20fit) lalu agregasi ke `crm_customer_activity`. Dijadwalkan **pg_cron harian 03:30 WIB (20:30 UTC)**, setelah refresh mirror 20:00 UTC. **Rebuild penuh harian, bukan real-time, bukan inkremental.**

Artinya: **"scheduled polling harian" sudah menjadi mekanisme de-facto** lapisan aktivitas. Workflow yang bereaksi "baru saja booking" paling cepat **tertinggal ~1 hari** dengan mekanisme sekarang.

---

## 4. Arsitektur pemicu — TIGA pilihan, konsekuensinya, TANPA memutuskan

Pertanyaan: bagaimana workflow tahu sebuah kejadian baru terjadi? (Snapshot harian tak bisa jawab "orang ini baru saja booking".)

| Pilihan | Latensi | Izin | Beban org | Catatan |
|---|---|---|---|---|
| **Polling terjadwal** (cron periksa `crm_activity_event`/sumber tiap N menit) | Tertinggal sebesar interval | **Tak butuh izin** — semua di kendali CRM | Nol | **Sudah setengah terbangun**: aktivitas di-rebuild harian. Tinggal perpendek interval + panggil engine workflow. Termurah untuk mulai. |
| **Trigger Postgres** di tabel sumber → antrean CRM | Hampir seketika | **Butuh izin pemilik data** (trigger di tabel tim lain) | Rendah (satu DB, tim lain tak ubah app) | Cepat, tapi menaruh kode CRM di tabel milik orang lain — keputusan lintas-tim |
| **Webhook** dari sistem sumber | Seketika | Butuh tiap tim menulis kode | **Tertinggi** | Paling bersih arsitektural, paling mahal organisasi |

**Rekomendasi untuk DISKUSI (bukan keputusan):** karena polling harian sudah ada dan sebagian besar workflow bernilai (#1/#2/#3) **tidak butuh reaksi seketika** (welcome/lintas-unit/adopsi bukan soal detik), **polling terjadwal cukup untuk memulai** tanpa izin siapa pun. Trigger/webhook baru relevan bila muncul workflow yang benar-benar butuh reaksi seketika (mis. konfirmasi transaksi). **Keputusan ini milik pemilik produk + pemilik data** — ia menentukan bentuk seluruh bagian ini.

---

## 5. Peta tujuh workflow — pemicu · jangkauan · template · frekuensi · berhenti

Jangkauan = **orang berbeda yang benar-benar bisa dijangkau** (≈ emailable 99,3%, dikurangi suppression). Angka diverifikasi §1.

### 1. Sambutan pengguna baru — jarak terpendek ke "bekerja"
- **Pemicu:** profil baru di `master_customer` (`created_at`/`source`). *(Catatan skema: jenis "welcome" saat ini di-key ke `crm_customer_activity.joined_at`, BUKAN pool baru — butuh jenis pemicu "pool baru" yang belum ada.)*
- **Jangkauan:** **577** (Agustus) dan tumbuh tiap hari via ingestion.
- **Template:** ✅ **ADA** — "Welcome to 20FIT / Everything 20FIT" (`email_1787897773605`), sudah terbukti terkirim. (Catatan: latar gelap — lihat T-37 untuk keputusan terang/gelap.)
- **Frekuensi:** sekali per orang (unique constraint). **Berhenti:** enrollment terminal.

### 2. Perkenalan silang antar-unit — peluang bisnis TERBESAR
- **Pemicu:** anggota satu unit yang belum pernah menyentuh unit lain (himpunan di `customer_engagement`). **Tak butuh lapisan aktivitas — batas 0,88% TAK berlaku.**
- **Jangkauan (diverifikasi):** anggota **belum pernah ke arena = 67.737** · **belum pernah ke klinik = 67.600** · **belum pernah ke event = 61.155**.
- **Template:** ❌ belum ada — perlu template ajakan lintas-unit (netral, non-klinis).
- **Frekuensi:** sekali per (orang, pasangan-unit); beri jeda agar tak beruntun. **Berhenti:** begitu ia menyentuh unit tujuan, keluar.

### 3. Adopsi aplikasi my20fit — celah paling lebar, pengungkit seluruh sistem
- **Pemicu:** punya profil, belum jadi pengguna app.
- **Jangkauan:** **82.633** (82.830 − 197 pengguna app). Menaikkan app = memperbesar SEMUA pemicu berbasis aktivitas ke depan.
- **Template:** ❌ belum ada.
- **Frekuensi:** sekali, mungkin diulang tiap kuartal. **Berhenti:** begitu jadi pengguna app (muncul di `app_activity`), keluar.

### 4. Siklus event (hyrox) — audiens paling terlibat
- **Pemicu:** `hyrox_registration`, lalu hitung mundur relatif tanggal lomba (daftar→siap→hari-H→foto→event berikut).
- **Jangkauan:** **289 orang** (321 kejadian). Menyambung Ticket 20FIT + 20FIT Photo.
- **Template:** ❌ belum ada (butuh beberapa, per tahap).
- **Frekuensi:** per pendaftaran (boleh berulang tiap event). **Berhenti:** setelah hari-H + tindak lanjut foto, urutan selesai.

### 5. Tindak lanjut booking arena — kecil tapi rawan
- **Pemicu:** `arena_booking`. **Jangkauan: 51 orang** (233 kejadian — ⚠️ jangan tulis 233).
- **Template:** ❌ belum ada. **Frekuensi:** per booking, beri jeda. **Berhenti:** setelah 1–2 ajakan.

### 6. Tindak lanjut klinik — HATI-HATI (data kesehatan)
- **Pemicu:** `clinic_visit`/`clinic_txn`. **Jangkauan: 217 orang.**
- **LARANGAN:** isi email **tak boleh** menyebut kunjungan/keluhan/layanan klinik — itu menuliskan status kesehatan ke inbox yang mungkin dibaca orang lain. Isi harus **netral** (pengingat jadwal umum). Penyusunan **digerbangi `profile.view_health`** seperti seluruh jalur klinis.
- **Template:** ❌ belum ada (harus netral). **Frekuensi/berhenti:** per kunjungan, sekali.

### 7. Reaktivasi — hanya untuk 732 orang
- **Pemicu:** `last_active_at ≥ N hari` (`crm_customer_activity`). **Ini yang paling cocok dengan skema `reengagement` yang ADA.**
- **Jangkauan:** **≤ 732** (0,88% pool). **Layar wajib menyebut ini jujur** — jangan tampil seolah menyasar seluruh audiens.
- **Template:** ❌ belum ada. **Frekuensi:** skema = sekali seumur hidup (unique) — untuk reaktivasi berulang perlu keputusan (longgarkan unique atau siklus ulang). **Berhenti:** begitu aktif lagi, keluar.

### Yang BELUM bisa dibangun
- **Fitpoint mendekati kedaluwarsa** — tak ada tabelnya di mana pun. Tak dipetakan.
- **Notifikasi pop-up app** — ditunda pemilik produk. Tak dipetakan.
- **WhatsApp** — kredensial belum diisi → semua workflow **email saja** untuk sekarang.

---

## 6. Pembagian jatah harian 1.000 — usulan (bukan keputusan)

Masalah: `sendCampaign` menghitung `crm_message_log` hari ini lintas SEMUA sumber. Kalau workflow otomatis menghabiskan 1.000, **kampanye yang disusun orang gagal tanpa sebab jelas** (dan sebaliknya).

Usulan, dari paling sederhana:
1. **Sub-jatah tetap untuk workflow** (mis. workflow ≤ 300/hari, sisakan ≥ 700 untuk kampanye manual). Engine workflow memeriksa "terkirim-oleh-workflow hari ini" (audit `campaign.sent` bermetadata workflow, atau label run `Workflow:`) sebelum enroll/kirim; berhenti di sub-jatah. Kampanye manual tetap pakai batas total.
2. **Jendela waktu terpisah:** workflow jalan pagi (mis. cron 06:00 WIB) dengan sisa jatah SETELAH menyisihkan cadangan kampanye; kampanye manual jalan siang.
3. **Konfig `WORKFLOW_DAILY_CAP`** (env), default konservatif, dinaikkan pemilik saat percaya.

Rekomendasi mulai: **#1 (sub-jatah tetap)** — paling mudah dipahami, mencegah kelaparan dua arah, dan bisa dibaca dari data yang sudah dicatat. **Keputusan angkanya milik pemilik produk.**

---

## 7. Urutan pembangunan yang diusulkan — dan alasannya

Prasyarat mutlak: **keputusan arsitektur pemicu (§4) lebih dulu** — membangun sebelum itu berarti membangun ulang.

1. **#1 Sambutan pengguna baru.** Template sudah ada + terbukti; jangkauan tumbuh tiap hari; jarak terpendek "belum ada → bekerja". (Perlu jenis pemicu "pool baru" — perluasan skema kecil.)
2. **#2 Lintas-unit.** Nilai bisnis tertinggi (puluhan ribu), tak bergantung lapisan 0,88%, tak sensitif. Butuh template baru + jenis pemicu himpunan.
3. **#3 Adopsi app.** Pengungkit seluruh sistem (memperbesar semua pemicu aktivitas ke depan).
4. **#4 Siklus event** (audiens terlibat, tapi butuh banyak template + logika hitung-mundur).
5. **#5 Arena** (kecil — 51 — kerjakan bila kapasitas ada).
6. **#7 Reaktivasi** (cocok skema yang ada, tapi jangkauan 0,88% — nilai terbatas sampai lapisan aktivitas tumbuh).
7. **#6 Klinik** (paling akhir; sensitif, butuh template netral + gerbang `profile.view_health` + tinjauan legal).

Alasan urutan: nilai-bisnis ÷ kelayakan, dengan yang **template-nya sudah ada** dan **tak bergantung batas 0,88%** didahulukan, dan yang **sensitif** ditaruh terakhir agar dibangun dengan hati-hati, bukan buru-buru.

---

## 8. Yang TIDAK bisa saya verifikasi
- **Angka "349 pengguna app"** — tak dapat direproduksi; sumber terukur memberi **197**. Kalau ada definisi lain (mis. tabel my20fit mentah di luar CRM), itu di luar jangkauan sesi ini.
- **Apakah trigger/webhook layak** — bergantung izin pemilik data & kesediaan tim sumber; keputusan organisasi, bukan terukur dari DB.
- **Rupa email tiap workflow di klien nyata** — perlu Send test (lihat CEKLIS-email-lintas-klien.md).
- Semua angka jangkauan adalah **foto 31 Agu**; tabel hidup — ukur ulang saat membangun.

*Disusun 31 Agu 2026 dari `origin/main` (`587f8f4`) + ukur ulang produksi (`count(*)`/`count(distinct)`). Pemetaan saja: nol tabel, nol workflow, nol kirim.*
