# DUA PROMPT — Jalankan sebagai dua sesi terpisah

> Sprint 4A (ekspor + AI segmen) dan Sprint 4B (dua bahasa + rapikan tampilan) **jangan
> digabung**. 4B menyentuh hampir setiap berkas UI; menggabungkannya dengan fitur baru akan
> menghasilkan diff yang tidak bisa ditinjau siapa pun, dan kalau ada yang rusak tidak akan
> jelas bagian mana penyebabnya.

---

## CATATAN ATAS LAPORAN 3Y

Penalaranmu soal kolom `Umur` lebih tepat daripada saran di prompt: menukar hari dan bulan
tidak mengubah tahun, jadi `Umur` hanya bisa memvalidasi tahun dan **tidak bisa** memutus
ambiguitas 2.232 baris. Itu koreksi yang benar, dan menandai ambigu alih-alih menebak adalah
keputusan yang tepat.

Dua hal dari angka yang kamu laporkan perlu masuk sebagai temuan, bukan sekadar statistik:

**RFM praktis tidak bisa dipakai menyegmentasi.** Sebarannya `New User` 81.213 ·
`Potensial user` 7.057 · `Loyal user` 65 · `Campion user` 1. Satu keranjang memuat 92% pool,
dan dua keranjang teratas hanya berisi 66 orang. Kolom ini akan terlihat seperti dimensi
segmentasi yang berguna padahal bukan — pola yang sama dengan `segment` yang terbalik.
Catat di `docs/riwayat/TEMUAN.md` dan sebutkan di layar filter, supaya orang tidak menyusun
kampanye di atasnya.

**Resolver segmen puluhan detik untuk kriteria besar** adalah penghalang nyata untuk ekspor,
bukan sekadar catatan kinerja. Ekspor 75 ribu baris di atas resolver sepuluhan detik akan
kena batas waktu HTTP. Ini ditangani di Sprint 4A TUGAS 1.

---
---

# SPRINT 4A — Ekspor Segmen dan Asisten Segmen AI

## ATURAN PROSES

```bash
git fetch --all --prune
git log --oneline -3 origin/main
git log --oneline origin/main..HEAD
```

Baseline test **377**. Berbeda → berhenti dan lapor.

---

## TUGAS 1 — Ukur dan atasi kinerja resolver lebih dulu

Kamu melaporkan kriteria besar butuh puluhan detik. Ekspor tidak bisa dibangun di atas itu.

Ukur dulu, dengan angka: berapa lama resolver menyelesaikan `RFM = New User` (81.213) dan
`Fitco User` (74.914). Lalu tentukan penyebabnya — paging PostgREST, `EMAIL_CEILING`, atau
pencocokan di TypeScript.

Sampaikan pilihanmu sebelum mengerjakan. Kalau perbaikannya butuh fungsi Postgres, itu
migrasi 14 dan boleh — tapi tunjukkan SQL-nya dan berhenti dulu, seperti biasa. Kalau bisa
diselesaikan tanpa perubahan skema, lebih baik.

Ekspor tidak boleh dibangun sampai resolver bisa menyelesaikan kriteria terbesar dalam waktu
yang wajar. Kalau ternyata tidak bisa, katakan dan usulkan ekspor asinkron sebagai gantinya.

---

## TUGAS 2 — Ekspor segmen

Ekspor adalah alasan utama layar segmen ada, dan sekaligus jalur paling mudah membuat data
pelanggan beredar di luar sistem. Aturannya ketat bukan karena legal, melainkan karena
berkas yang sudah terunduh tidak bisa ditarik kembali.

**Gerbang.** Matriks PRD 17.2 memisahkan `export ≤ threshold` dan `export > threshold`.
Tetapkan ambangnya, sebutkan angkanya di laporan, dan pakai matriks yang sudah ada:

- `super_admin`, `crm_manager` — kedua ambang
- `crm_operator`, `unit_manager` — status `approval`. Alur persetujuan belum ada, jadi tolak
  dengan pesan yang jelas: "butuh persetujuan, fitur belum tersedia". Jangan diloloskan.
- `analyst`, `data_steward` — tidak berhak. Untuk `analyst` alasannya penting dan tulis di
  komentar: perannya melihat kontak dalam keadaan tersamar, dan ekspor tersamar tidak ada
  gunanya untuk menghubungi, sedangkan ekspor tak tersamar melanggar gerbangnya.

**Suppression dikecualikan dari ekspor untuk tujuan marketing.** Nol baris hari ini, jadi
belum berpengaruh — tapi pemeriksaannya harus ada sejak sekarang, karena ekspor adalah jalur
tercepat menghubungi orang yang sudah minta berhenti.

**Audit.** Aksi `export.performed` — prefiks `export.%` sudah ada di denylist kepatuhan
migrasi 8, jadi dikecualikan permanen dari pemangkasan. Konfirmasi lewat test paritas Sprint
3E dengan nama aksi yang persis dipakai. Yang dicatat: jumlah baris, kriteria yang dipakai,
kolom yang disertakan, dan aktornya. Bukan isinya.

**Kolom yang boleh diekspor** ditetapkan sebagai konstanta teruji. Data klinis dan NIK
**tidak pernah** masuk ekspor, apa pun perannya — begitu ada di berkas, gerbang
`profile.view_health` tidak berlaku lagi.

**Format CSV**, dengan header. Sertakan baris keterangan di dalam berkas: tanggal ekspor,
kriteria, jumlah baris, dan siapa yang mengekspor — supaya berkas yang beredar tetap bisa
dilacak asalnya.

Pertimbangkan batas ukuran dan waktu. Kalau ekspor 82 ribu baris melewati batas respons,
katakan dan usulkan pendekatannya, jangan biarkan gagal di tengah.

---

## TUGAS 3 — Asisten segmen AI

Pengguna menulis deskripsi bebas — "pelanggan yang pernah ikut RUNFEST dan punya email",
"peserta Sportfest di Jakarta" — dan sistem mengusulkan kriteria filternya.

**Arsitektur yang wajib, dan ini inti keamanannya:**

```
teks bebas → (server) LLM → JSON kriteria → validator yang sudah ada → resolver yang sudah ada
```

- AI **tidak pernah** menghasilkan SQL, dan **tidak pernah** menyentuh database.
- Keluarannya JSON yang harus lolos skema kriteria yang sudah ada. Apa pun di luar daftar
  tertutup **ditolak**, bukan diteruskan.
- Panggilan LLM di server saja; kunci API tidak pernah sampai ke klien.
- Hasilnya adalah **usulan**. Tampilkan kriteria yang diusulkan dalam kalimat yang bisa
  dibaca, biarkan pengguna mengubah, dan jalankan hanya setelah ia menekan tombol. Jangan
  langsung menghitung.

**Yang harus ditangani jujur:**

- Permintaan yang tidak bisa diungkapkan — misalnya berbasis waktu ("aktif 3 bulan
  terakhir") — dijawab dengan **penjelasan kenapa tidak bisa**, bukan dengan kriteria
  terdekat yang salah. Untuk kriteria waktu, alasannya K-19: kolom waktunya cap muat.
- Permintaan yang menyentuh kriteria klinis dari peran tanpa `profile.view_health` ditolak.
  AI **tidak boleh** jadi jalan pintas melewati gerbang; jalankan pemeriksaan yang sama
  dengan `hasClinicalCriteria`.
- Kalau AI ragu, tampilkan keraguannya. Usulan yang salah tapi terlihat yakin lebih buruk
  daripada "saya tidak yakin, maksud Anda ini atau itu?".

**Audit.** Ini pembacaan dengan parameter pengguna, jadi wajib audit. Yang dicatat:
**kriteria hasil**, bukan teks mentahnya. Teks bebas bisa memuat nama orang — "cari data
Budi" — dan audit bersifat append-only. Kalau kamu tetap menyimpan teksnya, batasi
panjangnya dan tandai bahwa itu ketikan pengguna (K-17). Argumentasikan pilihanmu.

**Sediakan jalur tanpa AI.** Filter manual tetap ada dan tetap lengkap. AI mempercepat, bukan
menggantikan — dan kalau layanannya mati, layar itu harus tetap berfungsi.

---

## LARANGAN — Sprint 4A

| Jangan | Alasan |
|---|---|
| Jangan bangun ekspor sebelum resolver terukur wajar | Ekspor besar akan gagal di tengah |
| Jangan izinkan AI menghasilkan atau menjalankan SQL | Satu-satunya jalur adalah JSON → validator |
| Jangan biarkan AI melewati gerbang `profile.view_health` | Pemeriksaan yang sama seperti filter manual |
| Jangan sertakan NIK atau data klinis di ekspor | Berkas yang terunduh tidak bisa ditarik kembali |
| Jangan loloskan ekspor untuk peran berstatus `approval` | Alur persetujuan belum ada |
| Jangan hapus pemeriksaan suppression di ekspor | Jalur tercepat menghubungi yang sudah minta berhenti |
| Jangan catat isi ekspor atau teks mentah AI di audit | Append-only; catat kriteria dan jumlah |
| Jangan jalankan usulan AI otomatis | Pengguna harus melihat dan menyetujui dulu |
| Jangan buat aksi audit di luar prefiks yang ada | `export.%` sudah di denylist |
| Jangan sediakan kriteria berbasis waktu | K-19 |
| Jangan `UPDATE`/`INSERT`/`DELETE` di tabel mana pun | Nol tulis |
| Jangan hapus prefix `NODE_ENV=production` di `railway.json` | Baca README dulu |

## LAPORAN — Sprint 4A

1. Status remote + kondisi database
2. Kinerja resolver — angka sebelum dan sesudah, penyebab, dan pilihanmu
3. Ekspor — ambang yang ditetapkan, gerbang per peran, kolom yang disertakan, bentuk audit
4. Asisten AI — bentuk JSON, bagaimana permintaan tak terungkap dijawab, bagaimana gerbang
   klinis ditegakkan, dan apa yang kamu catat di audit
5. RFM sebagai temuan — di mana kamu catat dan bagaimana disebut di layar
6. Yang masih menggantung
7. Yang ditemukan tapi tidak disentuh
8. Yang TIDAK bisa kamu verifikasi

Gate: `tsc --noEmit`, `next lint`, seluruh test, `NODE_ENV=production npm run build`.
Sebutkan jumlah test sebelum (377) dan sesudah.

---
---

# SPRINT 4B — Dua Bahasa dan Rapikan Tampilan

Jalankan setelah 4A mendarat.

## TUGAS 1 — Dua bahasa, Indonesia dan Inggris

Seluruh antarmuka sekarang berbahasa Indonesia. Tambahkan bahasa Inggris dengan Indonesia
sebagai bawaan.

**Yang harus benar:**

- Satu berkas terjemahan per bahasa, kunci yang sama, dan **test yang gagal bila ada kunci
  yang hilang di salah satu bahasa**. Tanpa itu, teks Indonesia akan bocor ke tampilan
  Inggris secara acak.
- Format angka dan tanggal mengikuti bahasanya: `id-ID` versus `en-US`. Perhatikan pemisah
  ribuan dan desimal — `82.253` dalam Indonesia berarti delapan puluh dua ribu, dalam
  Inggris berarti delapan puluh dua koma dua lima tiga. Salah format di layar kualitas data
  akan mengubah arti angkanya.
- Pilihan bahasa disimpan per pengguna dan bertahan antar sesi.

**Peringatan kualitas data adalah bagian tersulit, dan yang paling penting.** Nuansanya
mudah hilang saat diterjemahkan:

| Indonesia | Inggris yang benar | Yang salah |
|---|---|---|
| "tidak terekam" | "not recorded" | "no data" — mengaburkan sebab |
| "belum terisi" | "not filled in" | "empty" — terbaca seperti nol |
| "cap waktu muat" | "load timestamp" | "date added" — justru mengklaim hal yang dibantah |
| "0 terukur" versus "—" | "0 (measured)" versus "—" | menyatukan keduanya |

Aturan K-08 dan K-19 harus tetap jelas di kedua bahasa. Kalau sebuah frasa Inggris tidak
bisa membawa nuansanya, panjangkan kalimatnya — jangan potong artinya.

**Jangan terjemahkan nilai yang tersimpan.** `Campion user`, `Fitco User`, `Padel rabel`
tetap apa adanya di kedua bahasa; itu data, bukan label antarmuka. Nama kolom teknis
(`phone_normalized`, `last_activity_at`) juga tetap.

## TUGAS 2 — Rapikan tampilan, kurangi tebal

Terlalu banyak teks ditebalkan, sehingga penekanannya hilang — kalau semuanya menonjol,
tidak ada yang menonjol.

**Baca `/mnt/skills/public/frontend-design/SKILL.md` sebelum mulai.** Ia memuat batasan
desain dan token untuk lingkungan ini.

Arahannya:

- Bangun hierarki lewat ukuran, spasi, dan warna teks, bukan lewat ketebalan. Sistem ini
  sudah punya `text-ink`, `text-ink-soft`, `text-ink-faint` — pakai itu.
- Tebal disisakan untuk satu hal per blok: angka utama, atau judul bagian. Bukan keduanya,
  dan bukan kata-kata di dalam kalimat.
- Peringatan kualitas data tetap harus terbaca jelas — tapi lewat tint dan tata letak, bukan
  lewat menebalkan setengah kalimatnya. Ini tempat penebalan paling banyak menumpuk sekarang.
- Rapikan spasi antar-blok supaya halaman padat informasi tetap bisa dipindai.
- Nol kelas warna bernomor (K-11); hanya token datar dan utilitas `.tint-*`.

**Yang tidak boleh berubah:** isi peringatan, pembedaan `0` versus `—`, penandaan asal data,
dan gerbang peran. Ini pekerjaan tampilan, bukan pekerjaan makna. Kalau sebuah peringatan
jadi kurang terlihat setelah dirapikan, itu kemunduran — bukan kerapian.

## LARANGAN — Sprint 4B

| Jangan | Alasan |
|---|---|
| Jangan terjemahkan nilai data yang tersimpan | Itu data, bukan label |
| Jangan pakai format angka yang salah per bahasa | `82.253` berarti berbeda di dua bahasa |
| Jangan perhalus peringatan kualitas data saat menerjemahkan | "no data" bukan "tidak terekam" |
| Jangan kurangi keterlihatan peringatan demi kerapian | Itu kemunduran, bukan kerapian |
| Jangan ubah gerbang peran, pembedaan `0`/`—`, atau penandaan asal | Pekerjaan tampilan, bukan makna |
| Jangan pakai kelas warna bernomor | K-11 |
| Jangan ubah lapisan baca atau skema | Sprint tampilan |

## LAPORAN — Sprint 4B

1. Status remote
2. Dua bahasa — bagaimana kunci hilang dijaga, dan bagaimana format angka dibedakan
3. Terjemahan peringatan — frasa yang sulit dan bagaimana kamu memutuskan
4. Tampilan — di mana tebal dikurangi, dan bagaimana hierarki digantikan
5. Konfirmasi makna tidak berubah — peringatan, `0` versus `—`, penandaan asal, gerbang
6. Yang TIDAK bisa kamu verifikasi

Gate: `tsc --noEmit`, `next lint`, seluruh test, `NODE_ENV=production npm run build`.

Jangan klaim apa pun yang belum kamu jalankan dan lihat hasilnya.

# SELESAI
