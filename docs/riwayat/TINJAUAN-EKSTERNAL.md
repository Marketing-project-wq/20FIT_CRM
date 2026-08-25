# Tinjauan Eksternal — apa yang tertangkap dengan memeriksa ulang

Catatan ini merekam apa yang muncul dari **memverifikasi laporan secara independen** lewat
akses SQL langsung ke produksi, bukan dari membacanya saja. Ia ada di sini karena polanya
lebih berharga daripada daftar temuannya: sesi berikutnya perlu tahu bahwa langkah verifikasi
itu berulang kali menghasilkan sesuatu.

Temuan yang sudah masuk register resmi (`TEMUAN.md`) hanya dirujuk, tidak disalin.

---

## Yang tertangkap karena angkanya diperiksa ulang

**`crm_purge_audit_log` bisa dieksekusi `anon`** (T-01). Laporan sprint sebelumnya menulis
fungsi lama "mungkin punya pola serupa" dan tidak memeriksa. Sudah pasti, dan yang kena
adalah fungsi yang menonaktifkan trigger append-only lalu menghapus baris audit.
**Pelajaran: curiga bukan pengganti memeriksa.**

**`master_customer` punya policy `authenticated_full_access`** (T-17). Ditemukan justru
karena laporan sendiri menulis kehati-hatian di bagian "yang tidak bisa saya verifikasi" —
bahwa `relrowsecurity` bukan ukuran yang cukup. Kehati-hatian itu benar dan tidak
ditindaklanjuti. **Ini kedua kalinya jawabannya sudah ada di tempat yang sudah dilihat.**

**Celah verifikasi yang ternyata sudah tertutup.** Lima sprint berturut melaporkan "runtime
belum pernah terbukti". Buktinya sudah ada di baris audit `id=32` — dua baris sebelum jumlah
yang sedang dihitung.

**Produksi menjalankan kode branch, bukan `main`** (T-18). Muncul dari kontradiksi antara
laporan ("PR belum di-merge") dan data ("tiga baris audit reset ada, dan orangnya berhasil
masuk").
> **KOREKSI (24 Agu 2026):** kesimpulan ini **salah dan ditarik**. Kontradiksi itu bukan bukti
> "prod = branch" — commit reset sudah masuk `main` lewat PR #10 (04:41 UTC) 7 menit sebelum
> reset (04:48 UTC), tapi `git log -S` dijalankan atas ref `origin/main` **basi** (S-05). Produksi
> dari `main`, selalu. Lihat T-22 (dikoreksi), T-27, K-27 (dibatalkan).

---

## Yang tertangkap sebelum kode ditulis

**SQL migrasi 13 lebih lambat daripada yang digantikannya.** Bentuk yang diajukan diuji
langsung: 3.846 ms, sementara jalur embed yang mau diganti ~2.900 ms. `count(distinct)` di
dalam `GROUP BY` memaksa sort seluruh 408 ribu baris. Bentuk pengganti (distinct di subquery
dulu) diuji dan menghasilkan 805 ms — 4,8× lebih cepat, hasil identik.

**Granularitas suppression belum pernah diputuskan siapa pun.** Anti-join di SQL yang
diajukan mengecualikan seluruh pelanggan bila satu identitasnya di-suppress. Dengan nol baris
suppression, tidak ada test yang bisa menangkap kalau ia berbeda dari aturan TypeScript.
Diangkat sebelum fungsinya ada, lalu diselesaikan jadi K-26.

**Angka contactable salah di rencana backfill.** Rencana menyebut ≈82.089 — itu angka
cakupan `customer_engagement`, bukan gabungan pemilik identitas. Yang benar 82.253, seluruh
pool.

**`grant execute … to service_role` hilang** dari migrasi 11 yang diajukan, padahal K-15
mensyaratkannya bersama `revoke`.

---

## Temuan produk yang mengubah arah

**`staging_20fit_data` versus sumber ekosistem.** Empat sprint dihabiskan menyambungkan
Hyrox, my20fit, arena, gym, dan klinik — gabungannya menyentuh **922 dari 82.253 profil
(1,12%)**. `staging_20fit_data`, sumber impor yang sama dengan `master_customer` dan belum
pernah dipakai, cocok **81.079 profil (98,6%)** dan memuat tanggal lahir untuk 5.467 baris
yang **dijatuhkan impor awal**. Satu sumber ini mengisi lebih banyak dashboard daripada empat
sprint sebelumnya digabung.

**Klinik harus dicocokkan lewat telepon, bukan email.** 12 cocok lewat email versus 106 lewat
telepon. Urutan kunci jadi per sumber, bukan konstanta global.

**RFM praktis tidak bisa menyegmentasi** (T-19). `New User` 81.213 — 92% pool; dua keranjang
teratas hanya 66 orang.

**`clinic_transactions`: 2.277 dari 2.477 baris ber-`patient_id` NULL.** Ditemukan sebelum
angkanya ditampilkan, sehingga "200 transaksi" tidak sempat dibaca sebagai gambaran utuh.

---

## Kesalahan sendiri, dan siapa yang mengoreksinya

Bagian ini yang paling penting dibaca ulang. Loop-nya berjalan dua arah.

**Estimasi perencana dipakai sebagai hitungan.** `staging_20fit_data` disebut 87.966 dari
`pg_class.reltuples`; `count(*)` eksak = 88.536. **Claude Code yang benar.**

**`live_txn_ingest` disebut "mendarat dalam satu pekan".** Artefak dari `date_trunc('week')`;
sebenarnya satu instan. **Claude Code mengukur ulang dan melaporkan selisihnya alih-alih
menyesuaikan diam-diam.**

**Kolom `Umur` disarankan sebagai pemeriksa silang tukar hari-bulan.** Keliru — menukar hari
dan bulan tidak mengubah tahun, jadi `Umur` hanya memvalidasi tahun. **Claude Code yang
benar, dan menandai 2.232 baris ambigu alih-alih menebak.**

**RLS OFF diklaim sebagai temuan baru** padahal sudah tertulis di prompt Sprint 3A sebagai
item Fase 0. Tindakannya benar, framing-nya salah.

**Dokumen eskalasi sempat menyatakan `master_customer` aman**, kalimat yang berasal dari
arahan yang keliru. Diperbaiki secara terbuka dan bertanggal, bukan disunting diam-diam.

**Penumpukan peringatan yang mengubur produknya.** Instruksi selama belasan sprint menekankan
peringatan tidak pernah diperhalus dan selalu menyertakan sebabnya. Dipatuhi dengan baik;
hasil kumulatifnya setiap layar berbunyi seperti dokumen desain dan datanya terkubur.
Dikoreksi lewat K-28 — tempat dan panjangnya yang berubah, bukan maknanya.

---

## Pola yang layak diteruskan

**Berhenti jujur di tengah lebih baik daripada empat layar yang terburu.** Terjadi empat kali
berturut di Sprint 4C–5A, tiap kali dengan alasan yang dijelaskan. Prompt selanjutnya
sebaiknya terus memberi izin itu secara eksplisit.

**Buktikan pagar menggigit.** Pagar Tailwind (3B), paritas retensi (3E), pagar EXECUTE (3I),
dan pengaman terjemahan (4D) semuanya dibuktikan dengan menyuntik pelanggaran, menunjukkan
pesan gagalnya, lalu mengembalikannya. Pengaman terjemahan bahkan menggigit **organik** dua
kali — pada kalimat yang mengutip-untuk-menolak. Keduanya diperbaiki dengan menulis ulang,
bukan menambah pengecualian.

**Ukur, jangan terima saran.** Saran `distinct` diganti semi-join `EXISTS` setelah diukur
(330 ms versus 370 ms). Ambang pengaman panjang dinaikkan dari 0,5 ke 0,6 setelah mengukur
86 string nyata dan menemukan nol di rentang 50–60%.
