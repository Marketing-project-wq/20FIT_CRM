# CLAUDE CODE PROMPT — Sprint 3Y: Isi Dashboard dari `staging_20fit_data`

> **Dashboard kosong bukan karena bug — sumber yang dipakai memang hampir tidak cocok.**
> Gabungan seluruh sumber ekosistem yang dibangun empat sprint terakhir (Hyrox, my20fit,
> arena, gym, klinik) hanya menyentuh **922 dari 82.253 profil — 1,12%**.
>
> **Datanya ada, di tabel yang belum pernah dipakai.** `staging_20fit_data` adalah sumber
> impor yang sama dengan `master_customer`, dan kecocokannya bukan 1% melainkan hampir
> sempurna:
>
> | | Terukur 12 Agustus 2026 |
> |---|---|
> | Baris | 88.536 · **88.445 punya email** |
> | Cocok ke `master_customer` lewat email | **81.079 profil — 98,6%** |
> | Punya tanggal lahir | **5.467** — sedangkan `master_customer.date_of_birth` = **0** |
> | Punya umur | 5.467 |
> | Punya kota | 5.834 (master 5.786 — kota ini terbawa, tanggal lahir tidak) |
>
> **Impor awal menjatuhkan kolom tanggal lahir sepenuhnya.** 5.439 profil yang cocok
> sebenarnya punya tanggal lahir yang tinggal dibaca — **36× lebih banyak** daripada yang
> bisa diperoleh dari NIK Hyrox.
>
> Satu sumber ini akan mengisi lebih banyak dashboard daripada seluruh pekerjaan
> multi-sumber empat sprint terakhir digabung.

---

## KEPUTUSAN ALUR KERJA — catat, jangan ubah

Pemilik produk memutuskan: **produksi tetap men-deploy dari branch kerja.** Belum ada
pengguna aktif, dan kecepatan lebih berharga daripada gate saat ini.

Ini sah, **asal tercatat sebagai keputusan sadar**, bukan kondisi yang tidak disadari selama
dua belas sprint. Tulis di `docs/riwayat/KEPUTUSAN.md` sebagai `K-` berikutnya, termasuk
**syarat pembalikannya**: begitu staf di luar tim pengembang memakai sistem ini secara rutin,
produksi diarahkan ke `main` — dan urutannya tetap merge dulu, arahkan kemudian.

Perbarui `docs/MENUNGGU-TINDAKAN-MANUSIA.md`: "konfirmasi Railway" dan "merge PR #11" turun
dari penghalang jadi kebersihan yang bisa dikerjakan kapan saja. **T-18 ditutup** — jawabannya
kini diketahui dan diterima.

Sisanya tetap terbuka dan tetap penting: rotasi `MAILTRAP_API_TOKEN` yang bocor, verifikasi
domain Mailtrap, dan SPF/DKIM/DMARC.

---

## ATURAN PROSES

```bash
git fetch --all --prune
git log --oneline -3 origin/main
git log --oneline origin/main..HEAD
```

Baseline test **360**. **Nol perubahan skema. Nol tulis ke tabel mana pun.**

---

# PROMPT UNTUK CLAUDE CODE — SALIN MULAI DARI SINI

---

## TUGAS 1 — Lapisan baca `staging_20fit_data`

Server-only, service role, pola `lib/crm/multisource.ts` yang sudah ada. **Nol tulis, nol
salin ke `crm_*`** — baca dan gabungkan saat tampil, seperti seluruh enrichment sebelumnya.

**Catatan keamanan yang harus disebut di komentar:** tabel ini **RLS OFF** (T-02), jadi
isinya sudah terbuka bagi siapa pun yang memegang anon key. Membacanya lewat service role
dari CRM **tidak menambah paparan** — ia justru memberi jalur yang tergerbang dan teraudit
untuk data yang sekarang bisa diambil tanpa login. Itu bukan alasan untuk longgar; kolom
aman tetap ditetapkan sebagai konstanta teruji, pola `MULTISOURCE_FORBIDDEN_COLUMNS`.

**Nama kolomnya berspasi dan bertanda titik** — `"Tgl / Tahun lahir"`, `"Sportfest v.02
Single"`, `"Mandiri RUNFEST 2.7K"`. Harus di-quote; buat pemetaan nama kolom → kunci
internal yang bersih di satu tempat, dan **jangan susun nama kolom lewat penggabungan
string** di query.

Pencocokan lewat `normalizeEmail` (K-06). Nol cocok-nama-saja.

---

## TUGAS 2 — Tanggal lahir dan umur

**Ini yang paling bernilai.** 5.439 profil yang cocok punya tanggal lahir; `master_customer`
punya nol.

**Kolomnya bertipe teks**, jadi bentuknya harus diperiksa sebelum diurai. Dan berlaku
peringatan dari temuan sebelumnya: `cf_hyrox_participants` terbukti punya **321 baris dengan
hari dan bulan tertukar** akibat bug parsing `DD/MM` versus `MM/DD` saat impor. **Periksa
apakah kolom ini kena bug yang sama** — laporkan hasilnya sebelum menulis kode penguraian.

Cara memeriksanya: kolom `Umur` juga ada dan terisi untuk 5.467 baris yang sama. Kalau umur
yang dihitung dari tanggal lahir tidak cocok dengan kolom `Umur`, salah satunya rusak.
Itu pemeriksaan silang yang tersedia gratis — pakai.

**Aturan penyajian:**

- Fungsi murni untuk penguraian, dengan test: bentuk yang berhasil, bentuk yang gagal,
  tahun mustahil, dan hari-bulan ambigu (≤12 di kedua posisi — **tidak bisa dipastikan**,
  jadi tandai, jangan tebak).
- Yang gagal diurai **ditandai**, bukan dibuang diam-diam. Hitungannya masuk `/quality`.
- Tandai asalnya di layar: tanggal lahir dari `staging_20fit_data` versus dari NIK Hyrox.
  Kalau keduanya ada dan berbeda, **tampilkan keduanya** beserta asalnya — jangan pilih
  diam-diam (aturan yang sama seperti Sprint 3S).
- **Umur dihitung dari tanggal lahir, bukan diambil dari kolom `Umur`.** Kolom itu snapshot
  saat impor 20 April 2026 dan sudah basi; pakai ia hanya sebagai pemeriksa silang.

---

## TUGAS 3 — Keikutsertaan program dan RFM

Kolom-kolom ini yang menjawab pertanyaan "orang ini masuk kelompok apa". Nilainya bertanda
`-` bila tidak ikut, jadi **`-` berarti tidak, bukan kosong** — dan `NULL` berarti kosong.
Bedakan keduanya.

Terukur 12 Agustus 2026, **ukur ulang sendiri**:

| Kolom | Ikut |
|---|---|
| `Fitco User` | **74.914** |
| `Mandiri RUNFEST 5K` | 6.762 |
| `Jhm 2025 - 5k` | 2.555 |
| `Padel rabel` | 1.358 |
| `Pasien 20FIT Clinic 2025-2026` | 365 |
| `Pasien 20FIT Clinic 2024-2025` | 100 |
| `Sportfest v.02 Single` | 70 |
| `Training Session` | 65 |
| `Physio or Sports Massage` | 7 |

Kolom lain yang ada dan harus ikut diukur: `Sportfest v.02 Half/Relay/Double`,
`Jhm 2025 - 10K/HM`, `Jhm 2024 - 5k/10K/HM`, `Iwhm 2025 - 5k/10k/21k`,
`Raya run 2025 - 5k/10k`, `Mandiri RUNFEST 2.7K/10K`, `Protection`.

**`Arena`, `GYM`, dan `Paid Shop` isinya nol** — kosong seluruhnya. Tampilkan sebagai nol
terukur (K-08), jangan hilangkan barisnya; ketiadaan itu sendiri temuan.

**RFM** (`RFM per paid order`) punya lima nilai: `Campion user`, `Loyal user`, `New User`,
`Potensial user`, dan `-`. Tampilkan apa adanya, **termasuk salah ejanya** — jangan
"perbaiki" jadi `Champion`; itu nilai yang tersimpan, dan mengubahnya membuat tampilan tidak
lagi cocok dengan sumbernya. `RFM per revenue` **nol terisi** — sebutkan.

---

## TUGAS 4 — Tampilkan di tiga tempat

**Detail profil** — bagian "Data impor 20FIT": tanggal lahir, umur terhitung, kota, RFM, dan
daftar program yang diikuti. Yang tidak cocok berbunyi "profil ini tidak ada di data impor",
bukan bidang kosong.

**`/quality`** — perbarui blok cakupan dengan sumber ini di posisi teratas (98,6% cocok,
kontras tajam dengan sumber lain), plus: berapa tanggal lahir berhasil diurai, berapa gagal,
dan berapa yang tidak cocok dengan kolom `Umur`.

**Filter segmen** — RFM (lima nilai, daftar tertutup) dan keikutsertaan program sebagai
kondisi AND/OR. Aturan yang sudah ada tidak berubah: jumlah berpasangan §18.8, bentuk yang
tak terungkap jujur **ditolak di validasi**, nol kriteria berbasis waktu (K-19), ambang
segmen kecil 25 tetap berlaku.

**Kartu dashboard** — sekarang layak: berapa profil punya tanggal lahir, dan sebaran RFM.
Aturan K-08 berlaku penuh: `0` berarti terukur nol, `—` berarti tidak ada sumbernya.

---

## LARANGAN

| Jangan | Alasan |
|---|---|
| Jangan `UPDATE` `master_customer` dengan data staging | Read-only per desain; gabungkan saat tampil |
| Jangan salin ke `crm_*` | Salinan akan basi; Fase 0 belum dicabut |
| Jangan pakai kolom `Umur` sebagai umur yang ditampilkan | Snapshot 20 April 2026, sudah basi — pemeriksa silang saja |
| Jangan tebak hari-bulan yang ambigu | Tandai; `cf_hyrox` sudah terbukti punya 321 baris tertukar |
| Jangan "perbaiki" ejaan nilai RFM | `Campion user` adalah nilai tersimpan |
| Jangan samakan `-` dengan `NULL` | `-` berarti tidak ikut; `NULL` berarti kosong |
| Jangan hilangkan baris bernilai nol dari `/quality` | K-08 |
| Jangan susun nama kolom lewat penggabungan string | Nama berspasi dan bertitik; petakan sekali di satu tempat |
| Jangan cocokkan lewat nama saja | Salah cocok = riwayat orang lain menempel di profil |
| Jangan nyalakan RLS di `staging_20fit_data` | Fase 0, milik pemilik data |
| Jangan buat migrasi, view, atau RPC | Nol perubahan skema |
| Jangan sediakan kriteria berbasis waktu | K-19 |
| Jangan hapus prefix `NODE_ENV=production` di `railway.json` | Baca README dulu |

---

## LAPORAN PENUTUP

1. **Status remote + kondisi database**
2. **Keputusan alur kerja** — `K-` yang kamu catat, syarat pembalikannya, dan status T-18
3. **Kecocokan** — angka yang kamu ukur lewat `normalizeEmail`, dibanding acuan 81.079
4. **Tanggal lahir** — hasil pemeriksaan bug tukar hari-bulan **sebelum** menulis kode,
   berapa berhasil diurai, berapa gagal, dan berapa yang bentrok dengan kolom `Umur`
5. **Program dan RFM** — angka per kolom yang kamu ukur, termasuk yang nol
6. **Tampilan** — apa yang muncul di profil, `/quality`, filter, dan dashboard
7. **Yang masih menggantung** — item `MENUNGGU-TINDAKAN-MANUSIA.md` yang tersisa
8. **Yang ditemukan tapi tidak disentuh**
9. **Yang TIDAK bisa kamu verifikasi**

Gate akhir: `tsc --noEmit` bersih, `next lint` bersih, seluruh test hijau,
`NODE_ENV=production npm run build` lulus. Sebutkan jumlah test sebelum (360) dan sesudah.

Jangan klaim apa pun yang belum kamu jalankan dan lihat hasilnya.

# SELESAI — AKHIR PROMPT
