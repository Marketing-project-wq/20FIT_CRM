# CLAUDE CODE PROMPT — Sprint 3N: Aktivitas Pelanggan di Ekosistem 20FIT

> **Ada dua jenis log, dan selama ini hanya satu yang dibangun.**
>
> | | `crm_audit_log` | Aktivitas pelanggan |
> |---|---|---|
> | Merekam | tindakan **staf** atas data | tindakan **pelanggan** di ekosistem |
> | Menjawab | "siapa melihat data siapa" | "orang ini ikut apa, terakhir kapan" |
> | Status | dibangun 3A–3L, berjalan | **belum tersentuh** |
>
> `crm_audit_log` **tidak boleh** dipakai untuk aktivitas pelanggan. Ia append-only,
> dipangkas 90 hari untuk kategori operasional, dan ada untuk akuntabilitas — mencampurkan
> jejak pelanggan ke dalamnya akan merusak kedua fungsinya sekaligus.
>
> **Kabar baiknya: sebagian besar yang dibutuhkan SUDAH ADA dan belum pernah dipakai.**

---

## TEMUAN YANG MENDASARI SPRINT INI — verifikasi ulang sendiri

Tabel **`customer_engagement`** sudah berisi **90.419 baris** dan tak pernah disentuh sejak
Sprint 2. Kolomnya persis yang dibutuhkan: `customer_id`, `unit`, `product`,
`first_seen_at`, `last_seen_at`, `engagement_count`, `source`, `source_row_id`.

**Integritas kaitannya bersih:**

| | |
|---|---|
| Baris yang menyambung ke `master_customer` | **90.419 dari 90.419** — nol orphan |
| Profil yang punya minimal satu keanggotaan | **82.089 dari 82.253 (99,8%)** |
| Unit | 6 — `membership`, `event`, `arena`, `clinic`, `gym`, `shop` |
| Produk | 25 |

**Tapi kolom waktunya berbohong lagi — untuk keempat kalinya.**

| | Baris |
|---|---|
| `last_seen_at` = **2026-04-20** (cap waktu muat) | **89.054 (98,5%)** |
| `last_seen_at` ≠ `first_seen_at` (aktivitas nyata) | **445 (0,49%)** |
| `last_seen_at` di **masa depan** | **1** — sampai 2026-12-05 |

Hanya keluarga produk `Transaksi *` yang membawa tanggal sungguhan: `Transaksi Clinic`
(160 hari berbeda, Feb–Jul) dan `Transaksi Arena` (77 hari, Mei–Des). Sisanya —
`Fitco User` 67.828 baris, seluruh event, `Padel`, `Clinic Patient` — semuanya bercap
2026-04-20 dengan `last_seen_at` persis sama dengan `first_seen_at`.

**Jadi pertanyaannya terbelah jadi dua, dan jawabannya berbeda:**

- **"Dia termasuk kelompok/segment apa?"** → **bisa dijawab hari ini**, cakupan 99,8%,
  kaitan bersih. Inilah yang dibangun sprint ini.
- **"Kapan terakhir dia login atau beraktivitas?"** → **tidak terekam** untuk 98,5%.
  Sama seperti `created_at`, `first_seen_at`, dan `last_activity_at` (K-19). Sprint ini
  **tidak boleh** menampilkannya seolah terekam.

**Yang belum ada di `customer_engagement` sama sekali:** Hyrox
(`cf_hyrox_participants`, 1.038 baris), my20fit (`my20fit_profile` 886;
`my20fit_user_activity` 175 baris — **satu-satunya sumber "terakhir login" yang nyata**,
dengan `last_active_at` dan `ping_count`), 20FIT Photo (`rc_participant_photos`),
dan `rc_team_members` (1.545). Itu bahan TUGAS 5, bukan bahan sprint ini.

---

## ATURAN PROSES

```bash
git fetch --all --prune
git log --oneline -3 origin/main
git log --oneline origin/main..HEAD
```

Laporkan apa adanya; state bergerak cepat belakangan ini. Berbeda dari harapanmu →
**berhenti dan lapor**.

**Nol perubahan skema. Nol ingestion. Baca saja.**

---

# PROMPT UNTUK CLAUDE CODE — SALIN MULAI DARI SINI

---

## TUGAS 1 — Lapisan baca `customer_engagement`

Server-only, service role, pola yang sama dengan `lib/crm/audience.ts`. Verifikasi ulang
semua angka di atas sebelum menulis kode; laporkan selisih, jangan sesuaikan diam-diam.

**JANGAN menyalin apa pun ke `crm_*`.** `crm_profile_behavior` tetap kosong — larangan
Fase 0 belum dicabut, dan lagipula menyalin akan membekukan salinan yang langsung basi.
Baca langsung, sama seperti `/audience` membaca `master_customer`.

Sediakan dua bentuk baca:

- **Per profil** — daftar unit/produk yang diikuti satu pelanggan, dengan `engagement_count`
- **Agregat** — jumlah pelanggan per unit dan per produk, untuk kriteria segmen dan `/quality`

Kaitannya lewat `customer_id` — **bukan** lewat telepon atau email. Integritasnya sudah
bersih (nol orphan), jadi jangan bangun pencocokan identitas kedua di sini.

---

## TUGAS 2 — Bagian "Ekosistem 20FIT" di detail profil

Tambahkan ke `/audience/[id]`. Ini yang menjawab pertanyaan aslinya.

**Yang ditampilkan:** setiap unit dan produk yang diikuti pelanggan, dikelompokkan per
unit, dengan `engagement_count` bila lebih dari satu.

**Yang TIDAK boleh ditampilkan sebagai "terakhir aktif":** `last_seen_at`, kecuali baris
itu benar-benar membawanya. Aturannya tegas dan per baris:

| Kondisi baris | Tampilkan |
|---|---|
| `last_seen_at` ≠ `first_seen_at` | tanggalnya, ditandai **aktivitas nyata** |
| `last_seen_at` = `first_seen_at` | **"tidak terekam"** — bukan tanggal, bukan `—` |
| `last_seen_at` > sekarang | tandai **anomali**, jangan tampilkan sebagai tanggal aktivitas |

Ini pola yang sama dengan `first_seen_at` di Sprint 3E: satu kolom yang artinya berbeda
tergantung barisnya wajib dibedakan **di layar**, bukan dibiarkan pembaca menebak. Kalau
seluruh baris seorang pelanggan bercap muat — dan itu berlaku untuk hampir semua orang —
katakan dengan jelas bahwa riwayat aktivitasnya belum terekam, bukan bahwa ia tidak aktif.

Ini pembacaan profil individual → sudah tercakup audit `profile.viewed` yang ada. **Jangan
tambah baris audit kedua** untuk halaman yang sama.

---

## TUGAS 3 — Unit dan produk jadi kriteria segmen

Segment builder Sprint 3M hanya bisa menyaring atribut `master_customer`. Dengan
`customer_engagement`, ia bisa menyaring **apa yang benar-benar dilakukan orang** — dan
inilah yang membuat segmentasi berguna: "peserta event Sportfest", "pemain Padel",
"pasien clinic".

- Tambahkan kriteria **unit** (6 pilihan) dan **produk** (25 pilihan, dikelompokkan per unit)
- Aturan PRD §18.8 tetap berlaku penuh: setiap jumlah tampil berpasangan dengan jumlah
  yang boleh dihubungi, dan angka kedua masih **0** karena `crm_consent` kosong
- **Tetap nol kriteria berbasis waktu.** `last_seen_at` tidak memenuhi syarat: 98,5%
  bercap muat, jadi "aktif dalam 90 hari terakhir" akan mengembalikan 445 orang dan
  menyembunyikan 89.054 lainnya di balik angka yang terlihat presisi. Ini justru contoh
  paling berbahaya dari K-19, karena kolomnya **hampir** berguna

Tetap tanpa menyimpan, tanpa ekspor, tanpa daftar orang — batas Sprint 3M tidak berubah.

---

## TUGAS 4 — Kualitas data ekosistem di `/quality`

Tambahkan bagian baru dengan angka yang dihitung ulang tiap request:

- Cakupan: berapa profil punya minimal satu keanggotaan, berapa yang nol
- Sebaran per unit dan per produk
- **Berapa persen `last_seen_at` yang hanya cap waktu muat** — ini angka terpenting di
  seluruh bagian ini, dan ia harus terbaca sebagai kekurangan data, bukan sebagai statistik
- Baris bertanggal masa depan sebagai anomali, di sebelah LTV negatif dan
  `first_seen_at > created_at` yang sudah ada

Tambahkan juga ke `docs/riwayat/TEMUAN.md`: ini **kali keempat** kolom waktu ternyata cap
muat. Itu bukan kebetulan, itu sifat seluruh impor 20 April 2026, dan pola itu layak
disebut sebagai satu temuan tersendiri.

---

## TUGAS 5 — Petakan yang belum masuk, jangan bangun ingestion-nya

Empat sumber tidak terwakili di `customer_engagement` sama sekali. Tulis
`docs/SUMBER-AKTIVITAS.md`:

| Sumber | Baris | Yang dibawanya |
|---|---|---|
| `cf_hyrox_participants` | 1.038 | peserta Hyrox — event dan kelas |
| `my20fit_profile` | 886 | pengguna aplikasi my20fit |
| **`my20fit_user_activity`** | **175** | **`last_active_at` + `ping_count` — satu-satunya "terakhir login" yang nyata di seluruh ekosistem** |
| `rc_participant_photos`, `rc_team_members` | 1.545 | 20FIT Photo dan peserta race |

Untuk tiap sumber, dokumentasikan: kunci identitasnya (`my20fit_user_activity` berkunci
**email**, bukan `customer_id` — jadi butuh normalisasi lewat `normalize.ts`, K-06),
apakah ia membawa waktu yang nyata, dan apa yang harus diputuskan sebelum ia bisa dipakai.

**Halangan yang harus disebut terang-terangan:** keempat tabel ini RLS OFF dan termasuk
Fase 0 milik tim (T-02, T-03). `my20fit_profile` dan `cf_hyrox_participants` juga memuat
data sensitif — NIK, tanggal lahir, golongan darah, kontak darurat. Menariknya ke CRM
bukan sekadar pekerjaan teknis; ia butuh keputusan dasar pemrosesan, dan `crm_consent`
masih kosong.

**Jangan bangun ingestion-nya. Jangan `INSERT` ke `crm_profile_behavior`.** Dokumen ini
bahan keputusan, bukan pelaksanaannya.

---

## LARANGAN

| Jangan | Alasan |
|---|---|
| Jangan tulis aktivitas pelanggan ke `crm_audit_log` | Log akuntabilitas staf; append-only dan dipangkas 90 hari |
| Jangan `INSERT` ke `crm_profile_behavior` atau `crm_*` mana pun | Fase 0 belum dicabut; salinan akan basi |
| Jangan tampilkan `last_seen_at` sebagai "terakhir aktif" bila ia sama dengan `first_seen_at` | Cap waktu muat, bukan aktivitas — K-19 |
| Jangan sediakan kriteria segmen berbasis waktu | 98,5% cap muat; hasilnya terlihat presisi padahal menyembunyikan 89.054 orang |
| Jangan cocokkan identitas lewat telepon/email di sini | `customer_id` sudah bersih, nol orphan |
| Jangan buat migrasi, tabel, view, atau RPC | Nol perubahan skema |
| Jangan bangun ingestion untuk keempat sumber TUGAS 5 | Butuh keputusan Fase 0 + dasar pemrosesan |
| Jangan tampilkan NIK, tanggal lahir, golongan darah, atau kontak darurat | Data sensitif dari tabel tim lain |
| Jangan tampilkan daftar orang di segment builder | Batas Sprint 3M tidak berubah |
| Jangan sentuh tabel di luar `crm_*`, `master_customer`, `customer_engagement` (baca saja) | Proyek dipakai bersama tim lain |
| Jangan setval atau reset `crm_audit_log_id_seq` | K-21 |
| Jangan merge atau push ke `main` tanpa izin eksplisit | Produksi sedang dipakai orang |
| Jangan hapus prefix `NODE_ENV=production` di `railway.json` | Baca README dulu |

---

## LAPORAN PENUTUP

1. **Status remote + kondisi database** — dan hasil verifikasi ulangmu atas seluruh angka
   `customer_engagement` di atas, termasuk selisih apa pun
2. **Lapisan baca** — bentuknya, dan konfirmasi nol tulis ke `crm_*`
3. **Ekosistem di detail profil** — bagaimana tiga kondisi baris dibedakan di layar, dan
   bagaimana pelanggan yang seluruh barisnya bercap muat dijelaskan
4. **Kriteria segmen** — unit dan produk yang tersedia, dan bagaimana larangan waktu dijelaskan
5. **Kualitas ekosistem di `/quality`** — angka yang kamu ukur, terutama persentase cap muat
6. **Peta sumber** — ringkasan `docs/SUMBER-AKTIVITAS.md`, terutama soal `my20fit_user_activity`
7. **Yang ditemukan tapi tidak disentuh**
8. **Yang TIDAK bisa kamu verifikasi**

Gate akhir: `tsc --noEmit` bersih, `next lint` bersih, seluruh test hijau,
`NODE_ENV=production npm run build` lulus. Sebutkan jumlah test sebelum dan sesudah.

Jangan klaim apa pun yang belum kamu jalankan dan lihat hasilnya.

# SELESAI — AKHIR PROMPT
