# CLAUDE CODE PROMPT — Migrasi 11 + Perbaikan Email Reset

> **Dua pekerjaan terpisah dalam satu prompt. Kerjakan BAGIAN A lebih dulu** — ia sudah
> menunggu di gate dan SQL-nya sudah ditinjau. BAGIAN B berdiri sendiri dan tidak
> bergantung padanya.
>
> Keduanya menyentuh produksi dengan cara berbeda: A menulis 408 ribu baris data, B
> mengubah jalur pengiriman email. Laporkan keduanya terpisah.

---

## ATURAN PROSES

```bash
git fetch --all --prune
git log --oneline -3 origin/main
git log --oneline origin/main..HEAD
```

Laporkan apa adanya. Baseline `npm test` hijau sebelum mulai; kalau merah, **berhenti dan lapor**.

---

# BAGIAN A — JALANKAN MIGRASI 11

**Konfirmasi diberikan: jalankan migrasi 11.**

SQL yang kamu tunjukkan di
`supabase/migrations/20260812000000_create_crm_backfill_consent.sql` sudah ditinjau dan
**disetujui apa adanya**. Ketiga perbaikan sudah masuk: `grant execute … to service_role`
bersama `revoke` di berkas yang sama (K-15), matriks lima kombinasi, dan reversibilitas
terdokumentasi. Jangan ubah SQL-nya lagi — yang dijalankan harus yang ditinjau.

Temuan jalur bacamu juga tepat dan penting: `.select()` tanpa batas lalu `.in()` dengan
~80 ribu id memang akan terpotong diam-diam di batas 1000 baris PostgREST. Penggantian ke
`head:true` atas inner embed adalah pendekatan yang benar.

## A1 — Terapkan dan verifikasi

Jalankan lewat `apply_migration` (**bukan** `db push`), lalu `select crm_backfill_consent()`.

Verifikasi berurutan, dan laporkan tiap angkanya:

1. **Jumlah tertulis per purpose dan channel.** Prediksi: `marketing×email` 81.637,
   `marketing×whatsapp` 81.615, `transactional×email` 81.637, `transactional×whatsapp`
   81.615, `transactional×phone_call` 81.615 = **408.119**. Selisih apa pun dilaporkan,
   bukan disesuaikan.
2. **Idempotensi dibuktikan, bukan diasumsikan** — jalankan kedua kali, tunjukkan **nol**
   baris tersisip. Baris audit kedua yang berbunyi "0 baris" boleh; sebutkan itu memang
   perilakunya.
3. **`proacl`** hanya `postgres` dan `service_role`.
4. **Versi ledger tercap**, lalu perbarui tabel ledger di README (versi akan berbeda dari
   timestamp nama berkas — pola yang sama untuk kesekian kali).

## A2 — Buktikan embed-count benar

Ini bagian yang paling mudah dilewati dan paling mahal kalau salah. Embed-count PostgREST
secara teori menghitung baris induk yang punya minimal satu anak cocok — **tapi belum
pernah dijalankan terhadap data nyata di proyek ini.**

Bandingkan hasil jalur baca aplikasi dengan SQL langsung:

```sql
select count(distinct customer_id) from crm_consent
where purpose = 'marketing' and status = 'active';
```

Prediksi: **82.253** untuk marketing dan 82.253 untuk layanan (suppression nol). Kalau
angka aplikasi berbeda, **jalur bacanya salah, bukan datanya** — perbaiki kodenya, jangan
sentuh data. Backfill-nya reversibel, jadi ini murah diperbaiki.

Ukur juga waktu muat dashboard dan segment builder sesudahnya, dan laporkan.

## A3 — Suppression tetap menang

Nol baris suppression hari ini, jadi hasilnya sama saja. Tapi pastikan optimasi
`head:true` **tidak menghapus pengurangan suppression**. Kalau sulit dibuktikan tanpa data,
tulis test fungsi murni untuk kasus "punya consent aktif tetapi ada di suppression →
tidak contactable" — dan jangan tulis baris suppression uji ke produksi.

## A4 — Kalau ada yang salah

`crm_consent` **nol trigger**, jadi `delete from crm_consent where source =
'20fit_data_import'` membatalkannya bersih. Tulis kalimat ini di berkas PR dan rencana
revert — dan sebutkan bahwa ini **berbeda** dari `crm_suppression` dan `crm_audit_log` yang
append-only dan tidak bisa dibatalkan.

---

# BAGIAN B — EMAIL RESET KATA SANDI

## Bukti diagnostik, jangan diulang penyelidikannya

`auth.users.recovery_sent_at` untuk akun uji = **`2026-08-12 04:01:37+00`**, cocok persis
dengan waktu email diterima (11:01 WIB). **Mailer Supabase yang mengirim, bukan Mailtrap.**
Aplikasi masih memakai `resetPasswordForEmail()`, sehingga pengiriman diserahkan ke GoTrue
yang memakai SMTP dan template milik proyek bersama — karena itu pengirimnya
"UOB Heartbeat Run <UOB@20fit.id>" dan isinya template bawaan berbahasa Inggris.

Email kedua pukul 11:01 membuktikan perbaikan belum pernah dijalankan; commit `ae8a249`
adalah pekerjaan consent, bukan email.

## B0 — MENDESAK: `MAILTRAP_API_TOKEN` bocor

Token itu terlihat penuh dalam teks biasa di screenshot dashboard Railway yang dibagikan
ke luar. Anggap bocor. Siapa pun yang memegangnya bisa mengirim email atas nama domain
`20fit.id` — dan email reset kata sandi justru jenis yang paling dipercaya orang.

Tulis langkah rotasinya di `docs/SETUP-reset-password.md`: cabut di Mailtrap, terbitkan
baru, perbarui variabel Railway. **Ini tindakan manusia**, sebutkan begitu di laporan.
Tambahkan juga catatan agar nilai variabel Railway tidak ditampilkan terbuka saat berbagi
layar.

## B1 — Jangan sentuh setelan Supabase, kirim sendiri

**SMTP dan template Auth berlaku untuk seluruh proyek**, dan proyek ini dipakai bersama
UOB, arena, clinic, my20fit, shop, dan talent. Mengubahnya di dashboard akan mengubah email
reset milik mereka juga — kelas masalah yang sama dengan policy `authenticated_full_access`
(T-17): satu setelan bersama yang tidak boleh diubah sepihak.

Ganti jalurnya:

1. Server, service role: `supabase.auth.admin.generateLink({ type: 'recovery', email })`
   — **menghasilkan** OTP tanpa mengirim email apa pun.
2. Ambil `email_otp` dari hasilnya, kirim email sendiri lewat Mailtrap dengan pengirim,
   subjek, isi, dan bahasa yang kamu kendalikan.
3. Pengguna memasukkan kode → `verifyOtp({ email, token, type: 'recovery' })` → sesi →
   `updateUser({ password })`.

Nol tabel baru, nol perubahan skema, nol setelan bersama disentuh.

**Yang wajib dijaga:**

- `generateLink` **gagal untuk email tak terdaftar**. Tangkap galatnya dan kembalikan pesan
  generik yang **sama persis**. Kalau tidak, halaman ini jadi alat memeriksa siapa punya
  akun — 887 akun ada di `auth.users` proyek bersama ini.
- `generateLink` butuh service role. Server action saja; jangan pernah sampai ke klien.
- Log bebas PII: status dan kode saja, tidak pernah emailnya. Ikuti pola
  `app/login/actions.ts`, jangan buat pola kedua.
- Aksi audit tetap `login.password_reset_requested` (prefiks `login.%`, sudah di allowlist
  migrasi 8).

## B2 — Alurnya sekarang buntu, perbaiki sekalian

Halaman berbunyi "Kirim kode OTP" dan menyediakan tombol **MASUKKAN KODE OTP**, tapi email
yang datang berisi tautan ("Follow this link"), bukan kode enam digit. Pengguna tidak punya
apa pun untuk dimasukkan. Ini otomatis selesai begitu B1 dikerjakan — pastikan emailmu
memuat kodenya.

Sekalian:

- Sebutkan **berapa lama kode berlaku**. Tanpa itu, orang mencoba kode kedaluwarsa lalu
  mengira sistemnya rusak.
- Email yang ditampilkan kembali muncul sebagai `Marketing@20fit.id` — tampilkan bentuk
  ternormalisasi lewat `normalizeEmail` (K-06), supaya konsisten dengan yang dicari sistem.
- Beri jeda pada "Kirim ulang" agar tombol itu tidak jadi jalur pengiriman berulang.

## B3 — Deliverability

Gmail menaruhnya di Spam **dan** menampilkan spanduk "This message might be dangerous".
Kalau staf tidak menemukan emailnya, fitur ini tidak berfungsi sama sekali.

| Sebab | Perbaikan |
|---|---|
| Nama pengirim "UOB Heartbeat Run" pada reset kata sandi 20FIT — pola yang persis dipakai penipuan | B1: kirim sebagai `20FIT CRM <crm@20fit.id>` |
| Domain `20fit.id` mengirim lewat pihak ketiga tanpa autentikasi domain selaras | **SPF, DKIM, DMARC** untuk Mailtrap di DNS `20fit.id` |
| Isi generik berbahasa Inggris tanpa konteks organisasi | Template Indonesia: sebut 20FIT CRM, alat internal, akun dibuat admin |

**SPF/DKIM/DMARC pekerjaan pemegang DNS, bukan kamu.** Tulis langkahnya di
`docs/SETUP-reset-password.md` — record apa, nilainya dari mana, cara memastikan sudah
benar — dan sebutkan bahwa **tanpa itu email tetap masuk spam betapapun rapinya isinya**.

Periksa juga: apakah domain `20fit.id` sudah **terverifikasi di akun Mailtrap**? Kalau
belum, pengiriman dari `crm@20fit.id` akan ditolak sepenuhnya, dan gejalanya akan terlihat
seperti kode yang salah. Pastikan juga akunnya produk **Sending**, bukan kotak
Testing/sandbox, dan catat batas kirim hariannya.

---

## LARANGAN

| Jangan | Alasan |
|---|---|
| Jangan ubah SQL migrasi 11 lagi | Yang dijalankan harus yang ditinjau |
| Jangan sentuh data bila embed-count meleset | Itu bug kode, bukan bug data |
| Jangan tulis baris suppression atau consent uji | Suppression tak bisa dihapus; consent uji mencemari hitungan |
| Jangan ubah SMTP, template, atau setelan Auth di dashboard Supabase | Setelan proyek bersama; mengubah email tim lain |
| Jangan bedakan pesan untuk email terdaftar dan tidak | `generateLink` gagal untuk email tak dikenal — tangkap, jangan bocorkan |
| Jangan kirim OTP atau tautan reset dari klien | Butuh service role; server saja |
| Jangan catat email atau OTP di log, `metadata`, atau pesan galat | — |
| Jangan buat tabel OTP sendiri | `generateLink` + `verifyOtp` sudah cukup |
| Jangan buat aksi audit baru | `consent.backfilled` dan `login.password_reset_requested` sudah cocok prefiks yang ada |
| Jangan buat migrasi lain selain 11 | Satu perubahan skema per siklus |
| Jangan jalankan `supabase db push` | Ledger diverge dan punya entri ganda |
| Jangan `UPDATE`/`DELETE` di `master_customer` | Read-only per desain |
| Jangan pakai kelas warna bernomor | Tidak menghasilkan CSS (K-11) |
| Jangan merge atau push ke `main` tanpa izin eksplisit | Produksi sedang dipakai orang |
| Jangan hapus prefix `NODE_ENV=production` di `railway.json` | Baca README dulu |

---

## LAPORAN PENUTUP

**Bagian A — Migrasi 11**

1. Versi ledger tercap, `proacl`, dan baris README yang diperbarui
2. Jumlah tertulis per purpose dan channel, dibanding prediksi 408.119
3. Bukti idempotensi — jalan kedua = 0 baris
4. **Embed-count vs `count(distinct customer_id)`** — cocok atau tidak, dan apa yang kamu
   perbaiki bila meleset
5. Waktu muat dashboard dan segment builder sesudahnya
6. Konfirmasi suppression tetap dikurangkan

**Bagian B — Email reset**

7. Rotasi token — langkah yang ditulis, dan konfirmasi menunggu tindakan manusia
8. Jalur baru `generateLink` → Mailtrap → `verifyOtp`, dan konfirmasi nol setelan Supabase
   bersama disentuh
9. Perlindungan enumerasi — bagaimana kegagalan `generateLink` ditangani
10. Alur OTP — masa berlaku, normalisasi email, jeda kirim ulang
11. Deliverability — template Indonesia, dan langkah DNS yang didokumentasikan
12. Status verifikasi domain Mailtrap

**Keduanya**

13. Yang ditemukan tapi tidak disentuh
14. **Yang TIDAK bisa kamu verifikasi** — pengiriman email nyata dan penilaian spam Gmail
    hampir pasti termasuk; katakan apa adanya

Gate akhir: `tsc --noEmit` bersih, `next lint` bersih, seluruh test hijau,
`NODE_ENV=production npm run build` lulus. Sebutkan jumlah test sebelum dan sesudah.

Jangan klaim apa pun yang belum kamu jalankan dan lihat hasilnya.

# SELESAI — AKHIR PROMPT
