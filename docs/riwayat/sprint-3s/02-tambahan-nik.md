# TAMBAHAN UNTUK PROMPT SPRINT 3S — TUGAS 6: Lengkapi Profil dari NIK

> Sisipkan sebagai TUGAS 6 di `CLAUDE_CODE_PROMPT_SPRINT_3S_BUKA-SEMUA.md`, sebelum
> bagian LARANGAN. Larangan tambahan di bawah digabungkan ke tabel larangan yang sudah ada.

---

## TUGAS 6 — Urai NIK jadi field profil

NIK 16 digit punya struktur baku: **`PP KK CC · DD MM YY · XXXX`**

| Posisi | Isi | Bisa diturunkan jadi |
|---|---|---|
| 1–2 | Kode provinsi | Provinsi pendaftaran |
| 3–4 | Kode kabupaten/kota | Kabupaten/kota pendaftaran |
| 5–6 | Kode kecamatan | Kecamatan pendaftaran |
| 7–8 | Tanggal lahir, **+40 bila perempuan** | Tanggal lahir **dan gender** |
| 9–10 | Bulan lahir | Bulan lahir |
| 11–12 | Tahun lahir, **2 digit** | Tahun lahir (perlu aturan abad) |
| 13–16 | Nomor urut pendaftaran | — tidak ada informasi profil |

Ini menjawab tiga field yang selama ini 0% terisi di `master_customer`: **gender**,
**tanggal lahir**, dan **domisili** (sebagian).

### Kualitas NIK di data — terverifikasi 11 Agustus 2026, ukur ulang sendiri

Dari 1.030 NIK di `cf_hyrox_participants`:

| | Jumlah |
|---|---|
| Panjang 16 digit (setelah membuang non-digit) | **971** |
| Panjang salah | **59** — tidak bisa diurai, jangan dipaksakan |
| Kode hari valid → gender terbaca | 968 (**484 perempuan, 484 laki-laki**) |
| Kode hari di luar rentang | 3 |
| Bulan valid | 969 · bulan tak valid: 2 |
| Provinsi berbeda | 27 |

### TEMUAN BESAR — `tgl_lahir` yang tersimpan rusak, NIK yang benar

Dari 967 NIK yang bisa diurai dan punya `tgl_lahir` tersimpan:

| | Jumlah |
|---|---|
| Hari + bulan **cocok persis** | 614 |
| **Hari dan bulan TERTUKAR** | **321** |
| Tidak cocok karena hal lain | 32 |
| Tahun (2 digit) cocok | 947 dari 967 |
| Tahun mustahil (< 1930 atau > 2020; ada nilai `84` dan `2026`) | 5 |

**321 baris tertukar hari-bulan bukan 321 kesalahan ketik independen** — itu bug parsing
tanggal saat impor, `DD/MM` dibaca `MM/DD`. Polanya sama persis dengan `gmaol.com` (T-16):
kerusakan sistematis, bukan kesalahan manusia satu per satu.

**Konsekuensinya penting dan berlawanan dengan dugaan awal: untuk 321 baris itu, tanggal
lahir dari NIK lebih dapat dipercaya daripada kolom `tgl_lahir` yang tersimpan.**

Selidiki dulu: periksa apakah kolom tanggal lain di tabel yang sama — dan di tabel impor
lain — kena bug yang sama. Kalau iya, itu temuan yang jauh lebih besar daripada tanggal
lahir. Laporkan sebelum menulis kode.

### Aturan penguraian

**Gender** — kode hari 41–71 berarti perempuan, tanggal sebenarnya = kode − 40. Ini paling
andal dari semua turunan; pakai sebagai sumber gender.

**Tahun — 2 digit, jadi ambigu.** `85` bisa 1985 atau 2085. Tetapkan aturan eksplisit
dengan argumen, jangan diam-diam: untuk basis pelanggan kebugaran, rentang usia wajar
kira-kira 15–80 tahun, sehingga tahun kelahiran ± 1946–2011. Terapkan aturan itu,
**tandai** setiap NIK yang hasilnya jatuh di luar rentang alih-alih memaksakan tebakan.
Tulis aturannya di komentar supaya bisa ditinjau.

**Wilayah adalah tempat KTP diterbitkan, BUKAN alamat sekarang.** Beri label yang tepat:
"Provinsi pendaftaran KTP", bukan "Domisili". Orang pindah; label yang salah akan membuat
staf menelepon ke kota yang keliru. Ini bukan kehati-hatian berlebihan — ini akurasi.

**Butuh tabel referensi kode wilayah Kemendagri**, dan itu **tidak ada di database**.
Kode provinsi (2 digit, 38 provinsi) stabil dan bisa ditanam sebagai konstanta. Kode
kabupaten dan kecamatan **berubah** karena pemekaran — NIK terbitan 2005 bisa memuat kode
kabupaten yang kini sudah dimekarkan. Karena itu:

- **Provinsi**: tanam sebagai konstanta, uji dengan test. Aman.
- **Kabupaten/kecamatan**: hanya bila tabel referensinya disediakan tim. Kalau tidak ada,
  **tampilkan kodenya apa adanya** dan katakan referensinya belum tersedia — jangan
  menebak nama wilayah dari kode.

**Validasi sebelum mengurai.** Buang non-digit dulu, wajib tepat 16 digit, tolak pola
dummy (semua digit sama, `1234567890123456`). NIK tak valid → tandai, jangan urai
sebagian.

### Bagaimana hasilnya dipakai

**Jangan `UPDATE master_customer`** — larangan yang sama seperti seluruh sprint ini. Field
turunan dihitung saat tampil, dari NIK, lewat fungsi murni yang ditest.

**Tandai asal tiap field di layar** — turunan dari NIK, atau dari sumber lain. Staf harus
bisa membedakan "sistem menghitung ini dari NIK" dari "orangnya mengisi ini". Saat keduanya
berbeda, tampilkan **keduanya** beserta asalnya, jangan pilih diam-diam. 321 baris tertukar
itu justru yang paling butuh perlakuan ini.

**Fungsi murni + test wajib**, dengan kasus: perempuan (hari > 40), laki-laki, batas
tanggal 31 dan 71, bulan tak valid, panjang salah, NIK dummy, tahun di luar rentang, dan
NIK dengan spasi atau tanda hubung.

Tambahkan cakupan turunan NIK ke `/quality`: berapa profil kini punya gender dan tanggal
lahir dari NIK, dan berapa NIK yang tak bisa diurai.

---

## TAMBAHAN LARANGAN — gabungkan ke tabel larangan 3S

| Jangan | Alasan |
|---|---|
| Jangan sebut wilayah dari NIK sebagai "domisili" atau alamat sekarang | Itu tempat KTP diterbitkan; orang pindah |
| Jangan menebak nama kabupaten/kecamatan tanpa tabel referensi Kemendagri | Kode berubah karena pemekaran; tebakan akan salah dalam senyap |
| Jangan urai NIK yang panjangnya bukan 16 digit atau berpola dummy | 59 baris; penguraian sebagian menghasilkan tanggal palsu |
| Jangan diam-diam memilih antara tanggal lahir dari NIK dan yang tersimpan | 321 baris tertukar; tampilkan keduanya beserta asalnya |
| Jangan pakai NIK sebagai kunci pencocokan profil | `master_customer` tak punya kolom NIK |
| Jangan tampilkan digit 13–16 sebagai apa pun yang bermakna | Nomor urut pendaftaran, nol informasi profil |
| Jangan taruh NIK atau turunannya di `metadata` audit | Sama seperti field sensitif lain |

---

## TAMBAHAN LAPORAN PENUTUP

Sisipkan sebagai poin baru:

**Turunan NIK** — berapa NIK bisa diurai dan berapa tidak; jumlah gender dan tanggal lahir
yang dihasilkan; aturan abad yang kamu tetapkan beserta alasannya; hasil penyelidikan
apakah bug tukar hari-bulan juga mengenai kolom tanggal lain; dan apakah tabel referensi
wilayah tersedia atau kodenya ditampilkan mentah.
