# Peta Workflow — apa yang mungkin, apa yang bernilai (pemetaan, 31 Agu 2026)

> **Pemetaan, bukan pembangunan.** Nol tabel dibuat, nol workflow dibuat, nol kirim.
> Semua angka **diukur ulang langsung ke produksi**. Keputusan pemilik produk (31 Agu) tercatat di §0.

---

## 0. Keputusan pemilik produk (31 Agu 2026) — terkunci

1. **Arsitektur pemicu: POLLING.** Sudah setengah terbangun (cron aktivitas 03:30), nol izin, dan
   tak satu pun workflow bernilai butuh reaksi sub-detik. **Trigger Postgres menyusul bila terbukti
   perlu — rancang engine agar sumbernya bisa ditukar** (baca dari fungsi resolver, bukan hard-code).
2. **Jatah harian: 300 workflow / 700 kampanye manual** (dari 1.000).
3. **Reframe penting:** dua item paling bernilai — **perkenalan lintas-unit (67.737)** dan **adopsi
   aplikasi (82.481)** — **BUKAN workflow.** Keduanya menyasar himpunan tetap, sekali kirim selesai:
   cukup **segmen + kampanye**, yang sudah bekerja & terbukti. **Workflow sesungguhnya hanya LIMA:**
   sambutan, event, arena, klinik, reaktivasi.

**Urutan kerja yang mengikuti keputusan itu:** **Jalur A (segmen+kampanye)** dulu — bisa jalan minggu
ini tanpa kode workflow apa pun; **Jalur B (workflow)** menyusul, mulai dari sambutan.

---

## 1. Angka kunci — DIUKUR ULANG 31 Agu

| Hal | Diukur | Catatan |
|---|---|---|
| `master_customer` | **82.830** | 99,3% emailable (**82.214**) → kontaktabilitas hampir tak membatasi |
| `crm_customer_activity` (recency) | **732** = **0,88%** | Batas penentu workflow BERBASIS WAKTU |
| `crm_activity_event` | **1.460** | clinic_txn 364 · clinic_visit 345 · hyrox 321 · arena 233 · app 197 |
| `crm_workflow`/`_enrollment`/`crm_scheduled_send` | **0/0/0** | Skema ada, belum satu baris |
| `crm_suppression` | **1** | Satu orang sudah berhenti berlangganan |
| Profil baru Agustus | **577** | `source='activity_ingest'` |
| Penetrasi unit (orang, `customer_engagement`) | membership **67.828** (81,9%) · event **18.247** (22%) · arena **2.075** (2,5%) · klinik **1.014** (1,2%) · shop 18 · gym 2 | cocok persis |

### Populasi aplikasi — TIGA, bukan satu (koreksi 31 Agu)
349 dan 197 **keduanya benar**, beda arti. Diverifikasi:

| Populasi | Sumber | Orang | Pesan yang tepat |
|---|---|---|---|
| Punya profil **dan pernah pakai** app | `my20fit_user_activity` (`app_activity`) | **197** | sudah aktif → **kecualikan** dari ajakan adopsi |
| Punya profil **tapi tak pernah pakai** | `has_my20fit` − dipakai | **152** | "kamu punya akun — mulai pakai" (aktivasi) |
| **Tak punya profil app sama sekali** | 82.830 − 349 | **82.481** | "pasang aplikasinya" (adopsi) |
| (total punya profil app) | `crm_customer_mirror.has_my20fit` | 349 | — |

**Ini tiga segmen berbeda dengan tiga pesan berbeda.** "Adopsi" = 82.481 (tanpa akun); "aktivasi" =
152 (punya, menganggur). Menggabung keduanya salah sasaran.

### Jangkauan ORANG vs KEJADIAN — bedanya besar

| Sumber | Kejadian | **Orang berbeda** |
|---|---|---|
| hyrox | 321 | **289** |
| clinic (visit ∪ txn) | 709 | **217** |
| app (my20fit) | 197 | 197 |
| **arena** | **233** | **51** ⚠️ jangan tulis 233 |

---

## JALUR A — SEGMEN + KAMPANYE (bukan workflow; bisa minggu ini)

Himpunan tetap, sekali kirim. Tak butuh pemicu/enrollment/mesin workflow — hanya segmen (builder sudah
ada) + template + kampanye (sudah terbukti). Suppression tetap diperiksa saat kirim (jalur kampanye).

| # | Segmen | Jangkauan (diverifikasi) | Template | Kriteria (yang sudah ada) |
|---|---|---|---|---|
| A1 | Anggota **belum pernah ke arena** | **67.737** | ❌ perlu baru (ajakan arena, non-klinis) | unit=membership AND NOT arena |
| A2 | Anggota **belum pernah ke klinik** | **67.600** | ❌ perlu baru (**netral**, non-klinis) | unit=membership AND NOT clinic |
| A3 | **Belum punya akun app** (adopsi) | **82.481** | ❌ perlu baru ("pasang app") | NOT has_my20fit |
| A4 | Punya akun **tapi menganggur** (aktivasi) | **152** | ❌ perlu baru ("mulai pakai") | has_my20fit AND NOT app_activity |

### Membagi 67 ribu dengan jatah 700/hari — usulan (keputusan pemilik)
67.737 ÷ 700/hari ≈ **97 hari** kalau satu segmen memakan SELURUH jatah manual — dan itu berarti tak
ada ruang untuk kampanye manual lain selama tiga bulan. Pilihan, dari yang paling saya sarankan:

1. **Persempit dulu berdasarkan kedekatan fisik.** Arena & klinik adalah tempat FISIK — mengajak
   anggota di kota tanpa arena tak berguna. Segmen "anggota di kota ber-arena, belum pernah arena"
   jauh lebih kecil, lebih tinggi niat, dan bisa tuntas dalam hari, bukan bulan. *(Perlu cek cakupan
   kolom kota dulu — lihat §10.)* Sisa kota lain menyusul bila terbukti.
2. **Batch bertahap ber-pace.** Alokasikan mis. **300/hari** untuk kampanye lintas-unit (sisakan 400
   untuk kampanye manual lain) → ~226 hari untuk 67 ribu; atau 500/hari → ~135 hari. Kirim "700
   berikut yang belum dikontak" tiap hari lewat scheduled-send yang sudah ada.
3. **Prioritas nilai.** Anggota bernilai tinggi / baru bergabung / paling aktif lebih dulu — tuai
   konversi termudah sebelum menyapu ekor panjang.

Rekomendasi: **#1 (persempit fisik) lalu #3 (prioritas nilai)**, dengan #2 (pace) untuk sisanya. Angka
harian & irisan adalah keputusan pemilik; di sini saya sajikan matematikanya.

---

## JALUR B — LIMA WORKFLOW SESUNGGUHNYA

Perlu pemicu + enrollment + mesin (yang sebagian sudah ada, §4). Diurut nilai ÷ kelayakan.

### B1. Sambutan pengguna baru — mulai dari sini
- **Pemicu:** profil baru di `master_customer` (`created_at ≤ N hari`). **Sumber = pool, BUKAN lapisan
  aktivitas** → butuh perluasan skema kecil (§9). Batas 0,88% **tak berlaku**.
- **Jangkauan:** **577** (Agustus) dan tumbuh; ~**19/hari** rata-rata (jauh di bawah sub-jatah 300).
- **Template:** ✅ **ADA** — "Welcome to 20FIT / Everything 20FIT" (`email_1787897773605`), terbukti kirim.
- **Frekuensi:** sekali per orang (unique constraint). **Berhenti:** enrollment terminal.

### B2. Siklus event (hyrox) — audiens paling terlibat
- **Pemicu:** `hyrox_registration`, lalu hitung mundur relatif tanggal lomba.
- **Jangkauan:** **289 orang** (321 kejadian). Menyambung Ticket 20FIT + 20FIT Photo.
- **Template:** ❌ beberapa (per tahap). **Frekuensi:** per pendaftaran. **Berhenti:** setelah foto/tindak-lanjut.

### B3. Tindak lanjut booking arena
- **Pemicu:** `arena_booking`. **Jangkauan: 51 orang** (233 kejadian). **Template:** ❌.
  **Frekuensi:** per booking, beri jeda. **Berhenti:** setelah 1–2 ajakan.

### B4. Tindak lanjut klinik — HATI-HATI (data kesehatan)
- **Pemicu:** `clinic_visit`/`clinic_txn`. **Jangkauan: 217 orang.**
- **LARANGAN:** isi email **tak boleh** menyebut kunjungan/keluhan/layanan klinik. Isi **netral**
  (pengingat umum). Penyusunan **digerbangi `profile.view_health`**. **Template:** ❌ (netral).
  **Berhenti:** per kunjungan, sekali.

### B5. Reaktivasi — hanya 732 orang
- **Pemicu:** `last_active_at ≥ N hari` (`crm_customer_activity`). **Cocok skema `reengagement` yang ADA.**
- **Jangkauan:** **≤ 732** (0,88%). **Layar wajib menyebut ini jujur.** **Template:** ❌.
  **Frekuensi:** skema = sekali seumur hidup (unique) — reaktivasi berulang butuh keputusan (longgarkan
  unique atau siklus). **Berhenti:** begitu aktif lagi.

### Tak bisa dibangun
Fitpoint (tak ada tabel) · pop-up app (ditunda) · WhatsApp (kredensial kosong → semua **email saja**).

---

## 4. Skema `crm_workflow` yang ADA — yang sudah diputuskan
Migrasi 29 + `runWorkflowAction`:
- **Dua jenis** `type CHECK IN ('welcome','reengagement')`, keduanya berbasis waktu di lapisan 732.
- **Frekuensi:** `unique (workflow_id, customer_id)` → sekali per orang.
- **Suppression saat KIRIM** (via `sendCampaign`), bukan enrollment. ✅
- **Pemicu saat ini MANUAL** (tombol). **Berhenti:** enrollment terminal (bukan drip berlapis).
- **Jatah:** workflow kirim lewat `sendCampaign` yang menghitung `crm_message_log` hari ini → sudah ikut
  memakan jatah harian (perlu sub-jatah, §7).

---

## 5. `crm_activity_event` diisi apa + INTERVAL POLL (usulan)
`crm_rebuild_activity_events()` + `crm_refresh_customer_activity()` — **pg_cron harian 03:30 WIB**,
rebuild penuh dari tabel sumber (arena/klinik/hyrox/my20fit). **Bukan real-time.**

**Interval poll workflow (usulan, keputusan pemilik):**
- **Sambutan (B1)** membaca `master_customer.created_at` **langsung** → **poll tiap jam** menangkap
  pendaftar baru dalam ≤1 jam. Sesuai keinginan pemilik ("sejam masih wajar"). **Usul: hourly.**
- **Workflow berbasis aktivitas (B2–B5)** membaca `crm_customer_activity`, yang **hanya segar sekali
  sehari (03:30)**. Poll mereka tiap jam **mubazir** — data tak berubah antar-rebuild. **Usul: sekali
  sehari, tepat setelah rebuild (mis. 04:00 WIB).**

**Cara paling sederhana:** satu cron poll **per jam** yang memanggil engine; workflow aktivitas secara
alami hanya menemukan match baru sekali sehari (setelah 03:30), jadi hourly aman & satu mekanisme. Bila
kelak butuh reaksi aktivitas lebih cepat, naikkan cadence rebuild **atau** pasang trigger Postgres
(jalur yang bisa ditukar — §0). **Rekomendasi: hourly, satu mekanisme.**

---

## 6. Arsitektur pemicu — POLLING (dipilih), rancang agar bisa ditukar
Engine membaca kandidat dari **fungsi resolver** (mis. `resolvePoolNewIds`, `resolveActivityTimeIds`),
dipanggil oleh cron. Kalau kelak sebuah workflow butuh seketika, ganti pemanggilnya dengan trigger
Postgres yang menulis antrean → engine yang sama mengonsumsi. Tak ada logika terikat ke cron.
(Trigger/webhook = keputusan lintas-tim bila & saat terbukti perlu.)

---

## 7. Jatah harian — 300 workflow / 700 manual (diputuskan)
Terapkan sebagai **sub-jatah workflow**: engine memeriksa "terkirim-oleh-workflow hari ini" (audit
`campaign.sent` bermetadata workflow / label run `Workflow:`) sebelum enroll+kirim; berhenti di **300**.
Kampanye manual memakai sisa hingga **700**. Sambutan ~19/hari → 300 sangat longgar; ruang untuk
event/arena/klinik/reaktivasi tetap ada.

---

## 8. Urutan pembangunan (mengikuti §0)
**A dulu (tanpa kode workflow):** A1 lintas-unit arena (67.737, persempit fisik dulu) · A2 klinik
(67.600, netral) · A3 adopsi app (82.481) · A4 aktivasi app (152). Semua = segmen + template + kampanye.
**B sesudahnya:** B1 sambutan (template ada, ~19/hari) → B2 event → B3 arena → B5 reaktivasi → B4 klinik
(terakhir; sensitif, butuh gerbang `profile.view_health` + tinjauan legal).

---

## 9. Perluasan skema `crm_workflow` untuk sambutan — SQL (ditunjukkan, TIDAK diterapkan)

Jenis `welcome` yang ada di-key ke `crm_customer_activity.joined_at` (lapisan 0,88%). Sambutan pool baru
harus memicu dari `master_customer.created_at` (cakupan penuh, 577/bln). **Perluasan minimal & backward-
compatible: kolom `trigger_source`.** Baris lama otomatis `'activity'` → perilaku lama tak berubah.

```sql
-- USULAN — BELUM diterapkan. Perluas crm_workflow: pemicu waktu boleh dari pool, bukan hanya aktivitas.
alter table public.crm_workflow
  add column if not exists trigger_source text not null default 'activity'
    check (trigger_source in ('activity', 'pool'));

comment on column public.crm_workflow.trigger_source is
  'Sumber pemicu waktu: activity = crm_customer_activity (joined_at/last_active_at, cakupan 0,88%); '
  'pool = master_customer.created_at (profil baru di pool, cakupan penuh). welcome+pool = sambutan '
  'pendaftar baru (~577/bln). Default activity menjaga perilaku baris lama.';
```

**Kenapa kolom, bukan jenis baru:** `type` tetap `welcome`/`reengagement` (arti pesan); `trigger_source`
memisahkan DARI MANA waktunya dibaca. Satu welcome bisa pool (sambutan pendaftar) atau activity (sambutan
aktivitas-pertama) tanpa menambah nilai enum atau menyentuh baris lama.

**Sisi kode (BUKAN bagian SQL ini, disebut untuk kelengkapan, belum ditulis):** engine perlu
`resolvePoolNewIds(admin, days)` (`master_customer.created_at ≥ now()-days`, `email_normalized not null`)
dan bercabang `trigger_source==='pool'` di `runWorkflowAction`. **Berhenti di sini** — SQL ditunjukkan,
tidak dijalankan; migrasi & kode menunggu persetujuan.

---

## 10. Yang TIDAK bisa diverifikasi
- **Cakupan kolom kota** di `master_customer`/mirror untuk penyempitan fisik (§Jalur A) — belum diukur;
  perlu dicek sebelum mengandalkan segmen "kota ber-arena".
- **Kelayakan trigger/webhook** — keputusan izin lintas-tim, bukan terukur dari DB (dan tak dibutuhkan
  selama polling, per §0).
- **Rupa email tiap segmen/workflow di klien nyata** — perlu Send test (`CEKLIS-email-lintas-klien.md`).
- Semua angka = foto 31 Agu pada tabel hidup; ukur ulang saat membangun.

*Disusun 31 Agu 2026 dari `origin/main` (`587f8f4`) + ukur ulang produksi. Pemetaan saja; SQL §9
ditunjukkan, tidak diterapkan.*
