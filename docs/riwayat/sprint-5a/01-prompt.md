# CLAUDE CODE PROMPT — Sprint 5A: Sederhanakan Tampilan, Tabel Cermin, dan Muat Bertahap

> **Koreksi arah, dan penyebabnya harus disebut jujur.** Selama belasan sprint instruksi
> menekankan agar peringatan kualitas data tidak pernah diperhalus, tidak pernah
> disembunyikan, dan selalu menyertakan sebabnya. Kamu mematuhinya dengan baik. Hasil
> kumulatifnya: setiap layar kini berbunyi seperti dokumen desain, dan datanya terkubur di
> bawah penjelasannya.
>
> Lihat sendiri keadaannya: `/audience` memakai separuh layar untuk banner sebelum satu baris
> data muncul. Detail profil menampilkan delapan blok terpisah yang sebagian besar berbunyi
> "tidak ada data … untuk profil ini", masing-masing dengan paragraf penjelas. `/segments`
> mengubur kontrolnya di antara paragraf tentang PostgREST dan K-19.
>
> **Peringatannya tidak dihapus. Tempatnya yang berubah.** Informasi yang sama tetap ada,
> tapi berhenti mendominasi.

---

## ATURAN PROSES

```bash
git fetch --all --prune
git log --oneline -3 origin/main
git log --oneline origin/main..HEAD
```

Baseline test **623**. Berbeda → berhenti dan lapor.

**Terjemahan `/quality` dan detail profil DITUNDA** sampai layarnya disederhanakan — tidak
ada gunanya menerjemahkan 150 string yang sebagian akan dibuang minggu ini.

---

# PROMPT UNTUK CLAUDE CODE — SALIN MULAI DARI SINI

---

## TUGAS 1 — Aturan baru untuk peringatan

Tetapkan satu aturan dan terapkan di seluruh layar. Catat sebagai keputusan `K-` di
`docs/riwayat/KEPUTUSAN.md`, karena ia membalik penekanan sebelumnya dan orang berikutnya
perlu tahu itu disengaja.

**Aturannya:**

- **Satu baris di titik pakai.** Peringatan muncul sebagai satu kalimat pendek tepat di
  sebelah data atau kontrol yang dipengaruhinya — bukan sebagai blok di puncak halaman.
- **Sebabnya di balik pengungkapan.** Penjelasan panjang pindah ke elemen yang bisa dibuka
  ("Kenapa?"), tertutup secara bawaan. Isinya tidak dipotong — hanya tidak lagi dibaca paksa.
- **Maksimum satu banner per layar**, dan hanya bila peringatannya berlaku untuk seluruh
  layar, bukan satu bagian.
- **Nol paragraf yang menjelaskan batasan teknis di antarmuka.** Kalimat tentang PostgREST,
  nama migrasi, kode keputusan `K-19`, dan nama berkas `docs/*.md` **dikeluarkan dari layar**
  dan tetap hidup di kode dan dokumen. Pemakai butuh tahu **apa** yang terbatas, bukan
  **kenapa arsitekturnya begitu**.
- **Bagian kosong menyusut.** Delapan blok "tidak ada data untuk profil ini" menjadi satu
  baris yang menyebutkan sumber-sumber yang tak tersambung. Blok penuh hanya untuk sumber
  yang benar-benar punya isi.

**Yang tidak berubah:** pembedaan `0` versus `—`, penandaan asal data, "tidak terekam"
versus "belum terisi", dan gerbang peran. Ini soal panjang dan tempat, bukan soal makna.

**Uji tiap layar setelahnya:** apakah pemakai masih menyadari peringatan yang relevan dalam
lima detik pertama? Kalau sebuah peringatan jadi tak terlihat sama sekali, ia terlalu jauh
disembunyikan — tarik kembali satu tingkat.

---

## TUGAS 2 — Tabel cermin: rancang dulu, tunjukkan, baru jalankan

Dashboard lambat karena tiap layar menjahit banyak tabel lewat PostgREST. Tabel cermin
menyelesaikannya: satu baris per `customer_id`, kolomnya sudah tergabung, terindeks.

**Rancangan yang saya minta kamu evaluasi, bukan terima mentah:**

**Bentuknya materialized view, bukan tabel.** Alasannya: nol logika sinkronisasi untuk
dipelihara — `REFRESH MATERIALIZED VIEW` menggantikan seluruh mekanisme INSERT/UPDATE yang
harus dijaga konsistensinya. Kalau kamu menilai tabel lebih tepat, argumentasikan.

**Peringatan keamanan yang wajib ditangani, dan ini bagian paling mudah salah:**
**materialized view TIDAK mendukung RLS.** Seluruh perlindungan `crm_*` selama ini bersandar
pada RLS ON tanpa policy. Untuk matview, satu-satunya perlindungan adalah **grant**. Jadi
migrasi harus memuat `revoke all … from public, anon, authenticated` dan
`grant select … to service_role`, di berkas yang sama, dan pagar EXECUTE Sprint 3I mungkin
perlu diperluas untuk ikut memeriksa matview. Lewatkan ini dan kamu membuat salinan seluruh
PII yang terbuka bagi siapa pun dengan anon key — persis kelas T-02 yang sedang kita
laporkan ke pemilik data.

**Yang masuk cermin — hanya yang lambat dan statis:**

- Atribut profil: nama, kontak ternormalisasi, kota, unit, segment, LTV
- Dari staging: RFM, tanggal lahir, umur terhitung, penanda ikut program (per kolom)
- Hitungan keterlibatan per unit dari `customer_engagement`
- Penanda tersambung per sumber ekosistem (Hyrox, my20fit, arena, gym, klinik)

**Yang TIDAK boleh masuk cermin:**

- **Consent dan suppression.** Keduanya berubah kapan saja, dan cermin yang basi akan
  menyatakan seseorang bisa dihubungi padahal ia baru saja minta berhenti. Contactability
  tetap dihitung live lewat `crm_contactable_counts` yang sudah cepat.
- NIK, data klinis, dan field sensitif lain. Cermin dibaca banyak layar; menaruhnya di sana
  memperluas permukaannya tanpa perlu. Tetap dibaca langsung di balik `profile.view_health`.

**Kesegaran harus terlihat, bukan diasumsikan.** Simpan waktu refresh terakhir dan tampilkan
di layar yang memakainya. Sebuah cermin yang terlihat live padahal snapshot adalah persis
jebakan `last_activity_at` yang proyek ini habiskan berbulan-bulan untuk membongkar —
jangan buat versi barunya.

**Penyegaran manual, bukan terjadwal.** Fungsi refresh plus tombol untuk peran yang berhak.
`REFRESH … CONCURRENTLY` butuh indeks unik dan tidak bisa jalan dalam transaksi — periksa
apakah `apply_migration` membungkusnya, seperti pelajaran migrasi 12.

**Gate:** tunjukkan SQL migrasi 15, **berhenti**, tunggu konfirmasi.

---

## TUGAS 3 — Sambungkan, dan buktikan angkanya tidak berubah

Alihkan dashboard, `/audience`, dan segment builder ke cermin. Jalur lama untuk data volatil
(consent, suppression, audit) tetap.

**Verifikasi wajib, dengan angka:** setiap hitungan yang sekarang berasal dari cermin harus
**sama persis** dengan hasil jalur lama. Bandingkan minimal: total profil 82.253, `city`
terisi 5.786, LTV > 0 sebanyak 1.112, RFM `New User` 74.021, `Fitco User` 67.653, peserta
Hyrox 152.

Cermin yang lebih cepat tapi memberi angka berbeda adalah kemunduran. Kalau ada selisih,
laporkan dan cari sebabnya sebelum melanjutkan — jangan sesuaikan angka acuannya.

Ukur juga waktu muat sebelum dan sesudah untuk dashboard dan segment builder.

---

## TUGAS 4 — Muat bertahap: 10 baris, lalu "Muat lagi"

Ganti paginasi daftar audience jadi 10 baris awal dengan tombol muat lagi.

- Muat lagi **menambah** ke daftar, tidak mengganti halaman.
- Tampilkan berapa yang sudah dimuat dari berapa total.
- Hentikan tombolnya saat habis, dan katakan habis — jangan biarkan tombol yang tak
  melakukan apa-apa.
- **Setiap pemuatan tetap menulis audit** `list.viewed` (K-07: baris individual dengan
  parameter pengguna). Menekan muat lagi lima kali berarti lima baris audit — itu benar,
  bukan berlebihan. Kalau menurutmu itu membanjiri log, laporkan sebagai pertimbangan,
  jangan putuskan sendiri.
- Batas maksimum per permintaan tetap berlaku.

---

## LARANGAN

| Jangan | Alasan |
|---|---|
| Jangan hapus isi peringatan | Yang berubah tempat dan panjangnya, bukan maknanya |
| Jangan masukkan consent atau suppression ke cermin | Cermin basi akan bilang seseorang bisa dihubungi padahal sudah minta berhenti |
| Jangan masukkan NIK atau data klinis ke cermin | Memperluas permukaan tanpa perlu |
| Jangan buat matview tanpa `revoke` dan `grant` di migrasi yang sama | Matview tidak punya RLS — grant satu-satunya perlindungan |
| Jangan tampilkan data cermin tanpa waktu segar terakhir | Snapshot yang terlihat live adalah jebakan `last_activity_at` versi baru |
| Jangan jadwalkan refresh otomatis | Keputusan tersendiri, seperti purge |
| Jangan sesuaikan angka acuan bila cermin berbeda | Itu bug cermin, bukan bug acuan |
| Jangan tampilkan nama migrasi, kode `K-`, atau nama berkas docs di antarmuka | Pemakai butuh tahu apa yang terbatas, bukan kenapa arsitekturnya begitu |
| Jangan terjemahkan `/quality` atau profil sesi ini | Layarnya akan berubah; percuma menerjemahkan yang akan dibuang |
| Jangan ubah gerbang peran, `0` versus `—`, atau penandaan asal | Sprint tampilan dan kinerja |
| Jangan buat migrasi selain 15 | Satu perubahan skema per siklus |
| Jangan hapus prefix `NODE_ENV=production` di `railway.json` | Baca README dulu |

---

## LAPORAN PENUTUP

1. Status remote + kondisi database
2. **Aturan peringatan** — `K-` yang kamu catat, dan sebelum/sesudah per layar: berapa
   paragraf jadi berapa baris
3. **Uji lima detik** — per layar, apakah peringatan relevannya masih mendarat
4. **Migrasi 15** — SQL, keputusan matview versus tabel beserta alasannya, penanganan grant,
   versi ledger, dan cara `CONCURRENTLY` dijalankan
5. **Angka cocok** — tabel perbandingan cermin versus jalur lama untuk keenam acuan
6. **Kinerja** — waktu muat dashboard dan segment builder, sebelum dan sesudah
7. **Muat bertahap** — perilakunya, dan pertimbanganmu soal volume audit
8. Yang masih menggantung — sembilan item `MENUNGGU-TINDAKAN-MANUSIA.md` plus terjemahan
   dua layar yang ditunda
9. Yang ditemukan tapi tidak disentuh
10. Yang TIDAK bisa kamu verifikasi

Kalau keempat tugas tidak muat, kerjakan TUGAS 1 dan 4 lebih dulu — keduanya langsung
terasa oleh pemakai dan tidak butuh perubahan skema. Berhenti jujur seperti tiga sesi
terakhir.

Gate akhir: `tsc --noEmit` bersih, `next lint` bersih, seluruh test hijau, pagar Tailwind,
EXECUTE, dan registry i18n hijau, `NODE_ENV=production npm run build` lulus. Sebutkan jumlah
test sebelum (623) dan sesudah.

Jangan klaim apa pun yang belum kamu jalankan dan lihat hasilnya.

# SELESAI — AKHIR PROMPT
