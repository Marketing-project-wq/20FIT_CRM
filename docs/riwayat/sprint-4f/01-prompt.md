# CLAUDE CODE PROMPT — Sprint 4F: Dua Layar Terakhir, dan Dua Sub-halaman yang Tak Berpenanda

> **Analisis ambangmu adalah cara kerja yang benar.** Mengukur 86 string, menemukan nol di
> rentang 50–60%, lalu menyimpulkan 0,5 terlalu longgar karena klausa bisa hilang 40% dan
> tetap lolos — itu revisi berbasis data, bukan penyesuaian angka. Margin 9 poin dengan nol
> pengecualian adalah titik yang tepat.
>
> Dan pengaman menggigit **organik untuk kedua kalinya** (`segments.warn.cityD` memuat
> "empty"). Dua kali tertangkap tanpa direkayasa, dua kali diperbaiki dengan menulis ulang
> alih-alih menambah pengecualian. Pengaman itu sekarang terbukti, bukan diharapkan.

---

## SATU HAL YANG HARUS DIKERJAKAN LEBIH DULU

Kamu mencatat bahwa `/settings/roles` dan `/settings/diagnostik` adalah layar tersendiri dan
**tidak berpenanda**. Itu berarti pengguna yang memilih bahasa Inggris membuka kedua halaman
itu dan menghadapi prosa Indonesia **tanpa penjelasan apa pun**.

Itu persis pencampuran diam yang penanda dibuat untuk mencegah — dan sekarang ia ada di dua
halaman justru karena penandanya dipasang per-layar dengan benar. Konsekuensi yang wajar dari
rancangan yang baik, tapi tetap lubang.

**Perbaiki di TUGAS 1**, sebelum menyentuh dua layar besar. Ini pekerjaan kecil, dan
membiarkannya sampai akhir berarti membiarkan lubangnya terbuka selama dua sesi lagi.

---

## ATURAN PROSES

```bash
git fetch --all --prune
git log --oneline -3 origin/main
git log --oneline origin/main..HEAD
```

Baseline test **621**. Berbeda → berhenti dan lapor.
**Nol perubahan gerbang, angka, atau logika kueri.**

---

# PROMPT UNTUK CLAUDE CODE — SALIN MULAI DARI SINI

---

## TUGAS 1 — Tutup lubang sub-halaman, lalu sisir semuanya

**`/settings/roles` dan `/settings/diagnostik`:** pilih satu — pasang penanda cakupan, atau
terjemahkan sekalian bila teksnya sedikit. Keduanya sah; yang tidak sah adalah membiarkannya
diam. Sebutkan mana yang kamu pilih per halaman dan kenapa.

**Lalu sisir seluruh rute** dan pastikan tak ada layar lain dalam keadaan yang sama. Untuk
tiap rute yang bisa dibuka pengguna, jawab: sudah dua bahasa, berpenanda, atau **terlewat**.
Yang terlewat ditangani sekarang.

Jangan lupa halaman yang bukan bagian shell utama: `/login`, `/forgot-password`,
`/reset-password`, `/health`, dan layar `ComingSoon` yang tersisa. Halaman login khususnya —
ia yang pertama dilihat orang, dan bahasanya belum tentu mengikuti karena pengguna belum
punya sesi.

Tambahkan test yang gagal bila ada `ScreenId` baru yang tidak masuk registry maupun
`BILINGUAL_SCREENS` — supaya layar berikutnya tak bisa lahir dalam keadaan diam.

---

## TUGAS 2 — Layar 5: detail profil

928 baris, dan permukaannya lebih luas dari komponennya sendiri: `page.tsx`, route
`/api/audience/[id]`, dan kemungkinan handler identitas sensitif.

Nuansa yang wajib bertahan — ini layar dengan penandaan asal terbanyak di aplikasi:

| Frasa | Yang harus bertahan |
|---|---|
| cap muat, bukan aktivitas | tanggalnya nyata; **artinya** yang bukan aktivitas |
| tidak terekam versus belum terisi | dua sebab berbeda, jangan disatukan jadi "no data" |
| ambigu — tidak bisa dipastikan | nilainya sah, urutannya yang tak pasti (bukan "invalid") |
| tidak ada sumber data (kesehatan) | bukan "kosong", dan sama sekali bukan "sehat" |
| tidak ada data … untuk profil ini | tak tersambung, bukan tak pernah ikut |
| dari NIK versus dari data impor | penandaan asal; saat berbeda, keduanya tampil |
| aktivitas nyata versus cap muat | pembedaan per-baris di bagian ekosistem |

Bagian klinis dan NIK tetap di balik `profile.view_health` — **gerbangnya tidak berubah**,
hanya bahasanya. Kalau menerjemahkan menuntut menyentuh logika gerbang, berhenti dan lapor;
itu tanda ada yang salah dalam pendekatannya.

---

## TUGAS 3 — Layar 6: `/quality`

Arsitekturnya sudah kamu petakan dan sudah dikonfirmasi. Jalankan.

**Urutan yang mengurangi risiko:** kerjakan string chrome lebih dulu (tidak butuh arsitektur
apa pun), baru pemetaan `key`→kamus dan 37 entri server. Baru setelah keduanya selesai,
tambahkan ke `BILINGUAL_SCREENS`. Sifat semuanya-atau-tidak yang kamu sebut memang benar —
tapi ia berlaku pada **registry**, bukan pada commit. Dua commit terpisah tetap bisa
ditinjau.

Yang sudah disepakati dan tinggal dieksekusi:

- Literal kunci fill/issue/satellite pindah ke `quality-types.ts` — **diff string-saja**,
  nol perubahan kueri, filter, urutan, atau nilai. Tunjukkan diff-nya.
- `ARTIFACTS_VERIFIED_ON` jadi ISO, diformat per bahasa saat tampil.
- Helper `key`→kamus dengan fallback ke teks server.
- Test berbasis data yang gagal bila satu kunci tak punya entri di **kedua** bahasa —
  inilah yang menutup lubang fallback, dan tanpanya kunci hilang akan diam-diam menampilkan
  bahasa Indonesia.

Nuansa `/quality` yang paling berisiko: `0 (measured)` versus `— (no source)`,
`load timestamp`, `not filled in` versus `not recorded`, **segment terbalik** (kohort NULL
justru LTV tertinggi — bukan "data hilang"), dan **`Rp 0` adalah fakta, bukan data hilang**.

Nama kolom dan nama tabel tetap apa adanya di kedua bahasa, dalam mono.

---

## TUGAS 4 — Tinjauan pembaca baru, dan penutupan

Untuk kedua layar, buka dalam bahasa Inggris dan pastikan peringatannya masih mendarat.
Untuk `/quality`, keempat ini wajib: gender 0% terisi, 98,65% lifetime value nol, kolom waktu
adalah cap muat, dan RFM 92% satu keranjang.

Setelah keenam layar selesai, **laporkan keadaan akhirnya**: berapa layar dua bahasa, berapa
masih berpenanda, dan apakah `BILINGUAL_SCREENS` kini memuat semuanya sehingga penandanya
tak pernah muncul lagi. Kalau masih ada yang tersisa, sebutkan dan kenapa.

Tinjau ulang sekali lagi ambang 0,6 dengan data dari dua layar terakhir — `/quality` punya
peringatan terpanjang di aplikasi, jadi ia sampel yang paling menentukan. Kalau ada yang
mendekati ambang, laporkan; kalau semuanya jauh di atas, katakan itu juga.

---

## LARANGAN

| Jangan | Alasan |
|---|---|
| Jangan biarkan sub-halaman tanpa penanda maupun terjemahan | Pencampuran diam terbaca sebagai kerusakan |
| Jangan ubah kueri, filter, urutan, atau nilai di `quality.ts` | Hanya literal kunci yang berpindah |
| Jangan biarkan kunci kamus hilang lolos karena fallback | Itu lubang yang dibuka fallback |
| Jangan sentuh logika gerbang saat menerjemahkan profil | Kalau terasa perlu, pendekatannya yang salah |
| Jangan terjemahkan nama kolom, tabel, aksi audit, atau nilai data tersimpan | Identifier dan data, bukan label |
| Jangan persingkat peringatan agar rapi dalam bahasa Inggris | Panjangnya disengaja |
| Jangan tambah pengecualian pengaman untuk menghindari menulis ulang | Sudah dua kali terbukti guard-nya yang benar |
| Jangan tambahkan layar ke `BILINGUAL_SCREENS` sebelum tuntas | Penanda hilang padahal teks masih campur |
| Jangan ubah angka, gerbang peran, `0` versus `—`, penandaan asal | Sprint bahasa |
| Jangan ubah test lama supaya lolos | Tanda perilaku berubah |
| Jangan pakai kelas warna bernomor | K-11 |
| Jangan hapus prefix `NODE_ENV=production` di `railway.json` | Baca README dulu |

---

## LAPORAN PENUTUP

1. Status remote + kondisi database
2. **Sub-halaman dan sapuan rute** — pilihanmu per halaman, rute yang ternyata terlewat, dan
   test yang mencegah layar berikutnya lahir dalam keadaan diam
3. **Detail profil** — berkas yang terlibat, permukaan tersembunyi, dan penanganan bagian klinis
4. **`/quality`** — diff `quality.ts` (string-saja), test berbasis data, `ARTIFACTS_VERIFIED_ON`
5. **Tinjauan pembaca baru** — per layar, dan apa yang sempat meleset
6. **Keadaan akhir dua bahasa** — berapa tuntas, berapa berpenanda, apakah selesai
7. **Ambang 0,6** — data dari dua layar terakhir dan keputusanmu
8. Yang masih menggantung — sembilan item `MENUNGGU-TINDAKAN-MANUSIA.md`
9. Yang ditemukan tapi tidak disentuh
10. Yang TIDAK bisa kamu verifikasi

Kalau kedua layar besar tidak muat dikerjakan dengan benar, berhenti jujur seperti dua sesi
terakhir. TUGAS 1 tetap wajib selesai apa pun yang terjadi — ia kecil dan menutup lubang yang
sedang terbuka.

Gate akhir: `tsc --noEmit` bersih, `next lint` bersih, seluruh test hijau, kedua pagar lama
(Tailwind dan EXECUTE) hijau, `NODE_ENV=production npm run build` lulus. Sebutkan jumlah test
sebelum (621) dan sesudah, dan konfirmasi test lama tidak dimodifikasi.

Jangan klaim apa pun yang belum kamu jalankan dan lihat hasilnya.

# SELESAI — AKHIR PROMPT
