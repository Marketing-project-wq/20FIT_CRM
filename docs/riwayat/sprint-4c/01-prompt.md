# CLAUDE CODE PROMPT — Sprint 4C: Selesaikan Dua Bahasa di Layar Dalam

> **Fondasi 4B-nya bagus.** Kunci hilang dijaga dua lapis — tipe TypeScript untuk waktu
> kompilasi, test paritas dua arah untuk runtime — dan itu lebih kuat daripada yang diminta.
> Menahan layar dalam alih-alih menerjemahkannya terburu-buru juga keputusan yang benar:
> memperhalus peringatan justru pelanggaran yang paling dilarang sprint itu.
>
> **Tapi keadaannya sekarang setengah jalan, dan setengah jalan punya biayanya sendiri.**
> Pengguna yang memilih Inggris mendapat navigasi, dashboard, CSV, dan email dalam bahasa
> Inggris — lalu membuka `/quality` dan menghadapi prosa Indonesia yang padat. Layar dalam
> justru yang paling butuh dipahami, karena di sanalah seluruh peringatan kualitas data
> berada.
>
> Sprint ini menyelesaikannya, dengan kehati-hatian yang sama yang membuatmu menahannya.

---

## ATURAN PROSES

```bash
git fetch --all --prune
git log --oneline -3 origin/main
git log --oneline origin/main..HEAD
```

Baseline test **403**. Berbeda → berhenti dan lapor.
**Nol perubahan skema, lapisan baca, gerbang, atau angka.**

---

# PROMPT UNTUK CLAUDE CODE — SALIN MULAI DARI SINI

---

## TUGAS 1 — Pasang penanda cakupan lebih dulu

**Kerjakan ini sebelum menerjemahkan apa pun**, karena ia berguna bahkan bila sprint ini
tidak selesai seluruhnya.

Saat bahasa Inggris dipilih dan pengguna membuka layar yang isinya masih Indonesia,
tampilkan penanda ringkas: bagian ini belum tersedia dalam bahasa Inggris. Satu baris,
sekali per layar, tidak mengganggu.

Alasannya: pencampuran bahasa yang **diam** akan terbaca sebagai kerusakan. Pencampuran yang
**diberi label** terbaca sebagai pekerjaan yang sedang berjalan. Bedanya kecil di kode dan
besar di kepercayaan.

Simpan daftar layar yang sudah dua bahasa di satu tempat, dan hapus entri dari daftar itu
seiring tiap layar selesai — sehingga penandanya hilang sendiri, bukan perlu dibersihkan
manual dan akhirnya tertinggal.

---

## TUGAS 2 — Terjemahkan layar dalam, satu per satu

Urutkan berdasarkan kepadatan peringatan, yang tersulit lebih dulu selagi perhatian masih
segar:

1. **`/quality`** — paling padat; hampir setiap blok memuat peringatan bernuansa
2. **Detail profil** — penandaan asal data, "tidak terekam" versus "belum terisi", bagian klinis
3. **Segment builder** — penjelasan kriteria, catatan RFM, ambang segmen kecil, batas OR
4. **`/consent`** — "nol baris berarti nol orang boleh dihubungi", hierarki suppression
5. **Layar audit `/settings`** — kelas retensi, penanda artefak, penjelasan gap id
6. **Pencarian** — pesan "terlalu banyak", alasan penolakan bentuk

**Untuk setiap peringatan yang diterjemahkan, catat tiga hal di berkas terjemahan sebagai
komentar:** kalimat Indonesianya, kalimat Inggrisnya, dan **nuansa apa yang berisiko hilang**.
Ini yang mencegah orang berikutnya "menyederhanakan" kalimat panjang yang panjangnya memang
disengaja.

**Frasa yang sudah terbukti sulit, pakai keputusan 4B dan jangan diulang dari nol:**
`0 (measured)` versus `— (no source)`, `load timestamp` (bukan "date added"),
`no data source exists` (bukan "unavailable"), `not recorded` (bukan "no data"),
`not filled in` (bukan "empty").

**Frasa baru yang akan kamu temui di layar dalam, dan jebakannya:**

| Indonesia | Nuansa yang harus bertahan |
|---|---|
| "cap muat, bukan aktivitas" | bahwa tanggalnya nyata tetapi **artinya** bukan aktivitas |
| "ambigu — tidak bisa dipastikan" | bukan "tidak valid"; nilainya ada, urutannya yang tak pasti |
| "dilemahkan, belum ditutup" (gap audit) | temuan yang berhenti muncul bukan temuan yang terjawab |
| "artefak verifikasi" | baris audit sah yang bukan aktivitas nyata |
| "butuh persetujuan, fitur belum tersedia" | ditolak karena alurnya belum ada, bukan karena tidak berhak |
| "suppression menang atas consent" | hierarki, bukan sekadar urutan pemeriksaan |
| "92% dalam satu keranjang" | bahwa RFM tak layak jadi dasar kampanye |

Kalau versi Inggris perlu lebih panjang, panjangkan. Kalimat pendek yang kehilangan sebab
lebih buruk daripada kalimat panjang yang tepat.

**Jangan terjemahkan:** nilai data tersimpan (`Campion user`, `Fitco User`, `New User`,
`Padel rabel`), nama kolom teknis, nama aksi audit (`profile.viewed`, `export.performed`),
dan nama kelas retensi bila itu istilah teknis. Beri keterangan di sebelahnya bila perlu.

---

## TUGAS 3 — Uji makna, bukan hanya kelengkapan

Test paritas kunci sudah ada dan bagus. Ia menangkap kunci hilang, tapi **tidak** menangkap
terjemahan yang benar secara teknis namun lebih lemah artinya. Itu risiko sesungguhnya di
sprint ini.

Tambahkan dua pengaman:

**Pengaman panjang.** Untuk kunci peringatan, gagalkan test bila versi Inggris jauh lebih
pendek daripada versi Indonesia — tetapkan ambangnya, argumentasikan, dan izinkan
pengecualian yang ditandai eksplisit. Ini bukan ukuran mutu terjemahan; ia deteksi kasar
untuk kalimat yang dipangkas. Sebagian besar peringatan di sistem ini panjang karena
sebabnya perlu ikut disebut.

**Pengaman istilah terlarang.** Gagalkan bila terjemahan Inggris memuat frasa yang sudah
diputuskan salah: `no data` untuk "tidak terekam", `date added` untuk cap muat,
`unavailable` untuk tidak ada sumber, `empty` untuk belum terisi. Daftar itu tumbuh seiring
keputusan baru; simpan di satu tempat bersama alasannya.

---

## TUGAS 4 — Tinjau sendiri hasilnya sebagai pembaca baru

Setelah selesai, buka tiap layar dalam bahasa Inggris dan jawab pertanyaan yang sama seperti
di 4B:

Apakah pembaca yang baru pertama kali melihat layar ini masih akan menyadari bahwa gender
0% terisi, bahwa 98,65% lifetime value bernilai nol, bahwa kolom waktu adalah cap muat, dan
bahwa RFM menaruh 92% orang dalam satu keranjang?

Kalau ada satu saja yang jawabannya jadi lebih ragu dalam bahasa Inggris, **perbaiki
kalimatnya**, bukan turunkan standarnya. Laporkan mana yang sempat meleset dan bagaimana
kamu memperbaikinya — kalau tidak ada satu pun, sebutkan apa yang kamu periksa sehingga
yakin.

---

## LARANGAN

| Jangan | Alasan |
|---|---|
| Jangan persingkat peringatan agar terlihat rapi dalam bahasa Inggris | Panjangnya disengaja; sebabnya ikut disebut |
| Jangan terjemahkan nilai data tersimpan atau nama aksi audit | Itu data dan identifier, bukan label |
| Jangan ubah angka, gerbang peran, `0` versus `—`, atau penandaan asal | Sprint bahasa, bukan makna |
| Jangan ubah test lama supaya lolos | Itu tanda perilaku berubah |
| Jangan ubah lapisan baca, RPC, atau skema | Nol perubahan skema |
| Jangan biarkan pencampuran bahasa tanpa penanda | Diam terbaca sebagai kerusakan |
| Jangan pakai kelas warna bernomor | K-11 |
| Jangan hapus prefix `NODE_ENV=production` di `railway.json` | Baca README dulu |

---

## LAPORAN PENUTUP

1. Status remote + kondisi database
2. **Penanda cakupan** — bentuknya, dan bagaimana entri hilang sendiri saat layar selesai
3. **Layar yang selesai** — mana yang tuntas, mana yang tersisa, dan kenapa
4. **Frasa sulit** — keputusan untuk ketujuh nuansa di tabel, dan frasa baru yang kamu temui
5. **Dua pengaman** — ambang panjang yang kamu pilih beserta alasannya, dan daftar istilah
   terlarang
6. **Tinjauan pembaca baru** — apa yang sempat meleset dan bagaimana diperbaiki
7. Yang masih menggantung — sembilan item `MENUNGGU-TINDAKAN-MANUSIA.md`
8. Yang ditemukan tapi tidak disentuh
9. Yang TIDAK bisa kamu verifikasi

Gate akhir: `tsc --noEmit` bersih, `next lint` bersih, seluruh test hijau, kedua pagar
(Tailwind dan EXECUTE) hijau, `NODE_ENV=production npm run build` lulus. Sebutkan jumlah
test sebelum (403) dan sesudah, dan konfirmasi test lama tidak dimodifikasi.

Jangan klaim apa pun yang belum kamu jalankan dan lihat hasilnya.

# SELESAI — AKHIR PROMPT
