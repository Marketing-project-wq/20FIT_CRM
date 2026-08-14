# CLAUDE CODE PROMPT — Perbaikan Email Reset Kata Sandi

> **Tiga masalah terpisah, dan yang pertama harus dikerjakan hari ini juga.**

---

## MENDESAK — `MAILTRAP_API_TOKEN` terekspos

Token `MAILTRAP_API_TOKEN` terlihat penuh dalam bentuk teks biasa di screenshot dashboard
Railway yang dibagikan ke luar. Anggap ia bocor.

**Yang harus dilakukan pemegang akses (bukan kamu):** cabut token itu di Mailtrap, terbitkan
yang baru, perbarui variabel di Railway. Siapa pun yang memegang token itu bisa mengirim
email atas nama domain `20fit.id`.

Tulis langkahnya di `docs/SETUP-reset-password.md`, dan tambahkan catatan bahwa variabel
Railway tidak boleh ditampilkan dalam keadaan terbuka saat berbagi layar — nilai `MAILTRAP_FROM`
juga terlihat, meski itu tidak sensitif. Sebutkan di laporan bahwa ini menunggu tindakan
manusia.

---

## MASALAH 1 — Pengirimnya milik tim lain

Email reset datang dari **`UOB Heartbeat Run <UOB@20fit.id>`**. Itu identitas pengirim
sistem lain, dan penyebabnya struktural: **pengaturan SMTP dan template di Supabase Auth
berlaku untuk seluruh proyek**, sedangkan proyek Supabase ini dipakai bersama banyak tim
(arena, clinic, uob, my20fit, shop, talent).

**Jangan ubah pengaturan SMTP atau template di dashboard Supabase.** Mengubahnya akan
membuat email reset milik UOB, arena, dan tim lain ikut berubah jadi "20FIT CRM" — persis
kelas masalah yang sama dengan policy `authenticated_full_access` (T-17): satu setelan
bersama yang tidak boleh diubah sepihak oleh satu tim.

**Jalan keluarnya: jangan pakai mailer Supabase sama sekali.** Variabel Mailtrap sudah
tersedia di Railway (`MAILTRAP_API_TOKEN`, `MAILTRAP_FROM=crm@20fit.id`), jadi aplikasi bisa
mengirim emailnya sendiri:

1. Di server, dengan service role:
   `supabase.auth.admin.generateLink({ type: 'recovery', email })`
   Ini **menghasilkan** OTP dan tautan **tanpa mengirim email apa pun**.
2. Ambil `email_otp` dari hasilnya, lalu kirim email sendiri lewat Mailtrap — dengan
   pengirim, subjek, isi, dan bahasa yang kamu kendalikan penuh.
3. Pengguna memasukkan kode → `supabase.auth.verifyOtp({ email, token, type: 'recovery' })`
   → sesi → `updateUser({ password })`.

Nol tabel baru, nol perubahan skema, nol setelan bersama yang disentuh.

**Yang wajib dijaga saat memindah jalur ini:**

- `generateLink` **gagal untuk email yang tidak terdaftar**. Tangkap galatnya dan tetap
  kembalikan pesan generik yang sama persis. Kalau tidak, halaman ini berubah jadi alat
  memeriksa siapa punya akun — 887 akun ada di `auth.users` proyek bersama ini.
- `generateLink` butuh **service role**, jadi hanya di server action. Jangan pernah sampai
  ke klien.
- Log tetap bebas PII: status dan kode saja, tidak pernah emailnya. Pola
  `app/login/actions.ts` sudah benar.
- Aksi audit tetap `login.password_reset_requested` (prefiks `login.%`, sudah di allowlist).

---

## MASALAH 2 — Halaman minta kode OTP, email mengirim tautan

Halaman `/forgot-password` berbunyi "Kirim kode OTP ke email Anda" dan menyediakan tombol
**MASUKKAN KODE OTP**. Tapi email yang datang berisi template bawaan Supabase berbahasa
Inggris: *"Follow this link to reset the password for your user"* — sebuah tautan, bukan
kode enam digit.

Pengguna tidak punya kode untuk dimasukkan. Alurnya buntu.

Penyebabnya: template Supabase memakai `{{ .ConfirmationURL }}`, bukan `{{ .Token }}`.
Karena template itu setelan bersama dan tidak boleh diubah, perbaikannya adalah MASALAH 1 —
kirim emailmu sendiri, yang isinya kode enam digit.

**Sekalian perbaiki di halamannya:**

- Sebutkan **berapa lama kode berlaku**. Orang yang tidak tahu masa berlakunya akan mencoba
  kode kedaluwarsa lalu mengira sistemnya rusak.
- Email yang ditampilkan kembali muncul sebagai `Marketing@20fit.id` — tampilkan bentuk
  ternormalisasi (huruf kecil) lewat `normalizeEmail` (K-06), supaya konsisten dengan yang
  benar-benar dicari sistem.
- Beri jeda pada "Kirim ulang" supaya tombol itu tidak jadi jalur pengiriman berulang.

---

## MASALAH 3 — Emailnya masuk spam dan ditandai berbahaya

Gmail menaruhnya di Spam **dan** menampilkan spanduk merah *"This message might be
dangerous"*. Ini bukan kosmetik: kalau staf tidak menemukan emailnya, fitur ini tidak
berfungsi sama sekali.

Tiga sebab yang saling menguatkan, dan semuanya bisa diperbaiki:

| Sebab | Perbaikan |
|---|---|
| Nama pengirim "UOB Heartbeat Run" pada email reset kata sandi 20FIT CRM — pola yang persis dipakai penipuan | MASALAH 1: kirim sebagai `20FIT CRM <crm@20fit.id>` |
| Domain `20fit.id` mengirim lewat infrastruktur pihak ketiga tanpa autentikasi domain yang selaras | Atur **SPF, DKIM, dan DMARC** untuk Mailtrap di DNS `20fit.id` |
| Isi generik berbahasa Inggris tanpa konteks organisasi | Template Indonesia: sebut 20FIT CRM, alat internal, dan bahwa akun dibuat admin |

**SPF/DKIM/DMARC adalah pekerjaan pemegang DNS, bukan pekerjaanmu.** Tulis langkahnya di
`docs/SETUP-reset-password.md` — record apa, nilai dari mana, dan cara memastikan sudah
benar. Sebutkan bahwa tanpa ini, email akan tetap masuk spam betapapun rapinya isinya.

Periksa juga apakah akun Mailtrap yang dipakai adalah produk **Sending** atau kotak
**Testing/sandbox**. Emailnya sampai ke Gmail, jadi kemungkinan besar Sending — pastikan,
dan sebutkan batas kirim hariannya di dokumen.

---

## LARANGAN

| Jangan | Alasan |
|---|---|
| Jangan ubah SMTP, template, atau setelan Auth di dashboard Supabase | Setelan proyek bersama; akan mengubah email tim lain |
| Jangan bedakan pesan untuk email terdaftar dan tidak | `generateLink` gagal untuk email tak dikenal — tangkap, jangan bocorkan |
| Jangan kirim OTP atau tautan reset dari klien | `generateLink` butuh service role; server saja |
| Jangan catat email atau OTP di log, `metadata` audit, atau pesan galat | — |
| Jangan buat tabel OTP sendiri | `generateLink` + `verifyOtp` sudah cukup; nol perubahan skema |
| Jangan buat aksi audit baru | `login.password_reset_requested` sudah cocok prefiks `login.%` |
| Jangan pakai kelas warna bernomor | Tidak menghasilkan CSS (K-11) |
| Jangan tampilkan nilai variabel Railway saat berbagi layar | Satu token sudah bocor |
| Jangan merge atau push ke `main` tanpa izin eksplisit | Produksi sedang dipakai orang |

---

## LAPORAN PENUTUP

1. **Status remote + kondisi database**
2. **Rotasi token** — langkah yang kamu tulis, dan konfirmasi ini menunggu tindakan manusia
3. **Jalur pengiriman baru** — bentuk `generateLink` → Mailtrap → `verifyOtp`, dan
   konfirmasi nol setelan Supabase bersama yang disentuh
4. **Perlindungan enumerasi** — bagaimana kegagalan `generateLink` untuk email tak terdaftar
   ditangani sehingga pesannya tetap seragam
5. **Alur OTP** — masa berlaku yang ditampilkan, normalisasi email, jeda kirim ulang
6. **Deliverability** — isi template Indonesia, dan langkah SPF/DKIM/DMARC yang kamu
   dokumentasikan
7. **Yang TIDAK bisa kamu verifikasi** — pengiriman email nyata dan penilaian spam Gmail
   hampir pasti termasuk; katakan apa adanya

Gate akhir: `tsc --noEmit` bersih, `next lint` bersih, seluruh test hijau,
`NODE_ENV=production npm run build` lulus. Sebutkan jumlah test sebelum dan sesudah.

Jangan klaim apa pun yang belum kamu jalankan dan lihat hasilnya.

# SELESAI — AKHIR PROMPT
