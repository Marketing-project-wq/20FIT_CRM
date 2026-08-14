# BALASAN — Jalankan Migrasi 14, dengan tiga koreksi

> **Diagnosismu benar dan analisisnya bagus.** Kamu memisahkan biaya database dari biaya
> round-trip, membuktikan `EMAIL_CEILING` bukan penyebabnya, dan menghitung ~330 permintaan
> berurutan. Kesimpulannya tepat: PostgREST tidak bisa mengungkapkan join ini, jadi fungsi
> Postgres memang satu-satunya jalan yang wajar.
>
> **Jalankan migrasi 14**, setelah tiga koreksi di bawah.

---

## Verifikasi yang sudah saya lakukan terhadap SQL-mu

| Diperiksa | Hasil |
|---|---|
| Ke-28 nama kolom di allowlist | **semuanya ada** di `staging_20fit_data` |
| Tipe kolom program dan `Email` | seluruhnya `text` — `btrim()` aman, tak perlu cast |
| Validasi allowlist sebelum `format(%I)` | pola yang benar; `p_rfm` sebagai `$1` juga benar |

Tidak ada celah injeksi. Struktur dasarnya sehat.

---

## KOREKSI 1 — `%1$I` dipakai dua kali, tapi hanya satu argumen format

Di badan query kamu memakai `s.%1$I` **tiga kali** dan meneruskan satu argumen lewat
`coalesce(p_program_column, 'Email')`. Penomoran `%1$I` memang merujuk argumen pertama
berulang kali, jadi ini akan bekerja — tapi **verifikasi sendiri dengan menjalankannya**,
karena `format()` dengan penomoran posisional dan `$q$` dollar-quoting bertingkat mudah
salah tanpa terlihat.

Yang lebih penting: saat `p_program_column` NULL, query menjadi
`($2 is null or (s."Email" is not null and ...))`. Ia berfungsi karena `$2` null, tapi
membaca seolah kolom Email sedang diperiksa sebagai program. Pisahkan jadi dua cabang query
yang eksplisit — satu dengan filter program, satu tanpa. Lebih panjang, tapi orang berikutnya
tidak perlu menelusuri kenapa `Email` muncul di daftar program.

## KOREKSI 2 — `distinct` bisa dibuang

`select distinct m.customer_id` memaksa sort atau hash-aggregate atas hasil join. Karena
`master_customer.email_normalized` unik dan join-nya dari sisi master, satu `customer_id`
hanya bisa muncul lebih dari sekali bila ada **email duplikat di staging**. Kamu melaporkan
88.445 email dengan 88.409 distinct — jadi ada **36 duplikat**, dan `distinct` memang perlu.

Tapi ukur dampaknya: kalau `distinct` memakan waktu berarti, pertimbangkan
`where exists (select 1 from staging …)` alih-alih `join` — bentuk semi-join tidak
menghasilkan baris ganda sehingga `distinct` tidak diperlukan sama sekali. Bandingkan
`EXPLAIN ANALYZE` keduanya dan pakai yang lebih cepat.

## KOREKSI 3 — Sebutkan indeks yang hilang, jangan buat

`staging_20fit_data` **tidak punya indeks sama sekali**, sehingga join-nya selalu seq scan
penuh atas 88.536 baris. Indeks fungsional atas `lower(btrim("Email"))` akan mempercepatnya
banyak.

**Jangan buat.** Tabel itu milik tim lain (Fase 0), dan proyek ini punya aturan tegas untuk
tidak menyentuh objek di luar `crm_*` dan `master_customer`. Tulis usulannya di
`docs/MENUNGGU-TINDAKAN-MANUSIA.md` sebagai item untuk pemilik data, lengkap dengan SQL-nya
dan perkiraan manfaatnya. Kalau 0,73 detik hangat sudah cukup, sebutkan bahwa indeksnya
bersifat opsional.

---

## Arahan untuk TUGAS 2 — ekspor: streaming, bukan batas baris atau antrean

Kamu menawarkan dua pilihan: batasi jumlah baris, atau ekspor asinkron. **Ambil pilihan
ketiga: alirkan CSV-nya.**

Route handler Next.js bisa mengembalikan respons streaming. Ambil halaman berurutan dari
`master_customer` dan tulis baris CSV begitu tiap halaman tiba. Koneksinya tetap hidup karena
data terus mengalir, jadi tidak ada batas waktu idle — 80 halaman × ~150 ms ≈ 12 detik unduhan
yang berjalan, dan itu wajar untuk berkas 80 ribu baris.

Keunggulannya dibanding dua pilihanmu: **tanpa tabel baru** (asinkron butuh tabel pekerjaan,
yaitu migrasi lagi), dan **tanpa batas sewenang-wenang** yang akan ditanyakan orang kenapa
angkanya sepuluh ribu.

Yang harus dijaga saat streaming:

- Baris audit `export.performed` ditulis **setelah** streaming selesai dengan jumlah baris
  sebenarnya, bukan di awal dengan jumlah perkiraan. Ekspor yang putus di tengah tidak boleh
  tercatat seolah lengkap.
- Kalau streaming gagal di tengah, pengguna menerima berkas terpotong. Sertakan **baris
  penanda akhir** di CSV — misalnya baris terakhir berisi jumlah baris — supaya berkas
  terpotong bisa dikenali, bukan diam-diam dipakai sebagai data lengkap.
- Suppression dikecualikan, NIK dan data klinis tidak pernah ikut, gerbang peran seperti yang
  sudah ditetapkan.

Kalau setelah dicoba streaming ternyata tidak bisa diandalkan di Railway, **laporkan
angkanya** dan baru pakai batas baris — dengan angka yang punya alasan, bukan bulat asal.

---

## Setelah migrasi 14 diterapkan

Verifikasi seperti biasa: versi ledger tercap, `proacl` hanya `postgres` dan `service_role`,
pagar EXECUTE Sprint 3I lolos, dan `EXPLAIN ANALYZE` sebelum-sesudah dengan angka.

Konfirmasi juga **hasilnya tidak berubah**: jumlah profil untuk `RFM = New User` dan
`Fitco User` harus sama dengan yang dihasilkan resolver lama. Fungsi baru yang lebih cepat
tapi memberi angka berbeda adalah kemunduran, bukan kemajuan.

Lalu lanjutkan TUGAS 2 (ekspor) dan TUGAS 3 (asisten AI) sesuai prompt Sprint 4A, dan
sampaikan laporan penutup lengkap.

---

## Yang tidak berubah

Seluruh larangan Sprint 4A tetap berlaku, termasuk: AI tidak pernah menghasilkan SQL dan
hanya boleh mengeluarkan JSON yang lolos skema kriteria tertutup; AI tidak boleh melewati
gerbang `profile.view_health`; usulan AI tidak dijalankan otomatis; nol tulis ke tabel mana
pun; dan jangan sentuh objek di luar `crm_*` dan `master_customer`.
