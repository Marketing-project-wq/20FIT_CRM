# Setup: reset kata sandi (email dikirim aplikasi via Mailtrap)

> Alur "lupa kata sandi" mengirim **kode enam digit** ke email, dan **aplikasi ini yang
> mengirim emailnya sendiri lewat Mailtrap** — bukan mailer bawaan Supabase.
>
> **Kenapa bukan mailer Supabase?** Pengaturan SMTP + template di Supabase Auth berlaku untuk
> **seluruh proyek**, dan proyek ini dipakai bersama banyak tim (arena, clinic, uob, my20fit,
> shop, talent). Mengubahnya akan membuat email reset milik UOB/arena/dll ikut berubah — kelas
> masalah yang sama dengan policy `authenticated_full_access` (T-17): satu setelan bersama yang
> tak boleh diubah sepihak. Karena itu aplikasi memakai
> `auth.admin.generateLink({ type: 'recovery' })` (menghasilkan kode, **tidak mengirim apa
> pun**) lalu mengirim emailnya sendiri dengan pengirim `20FIT CRM <crm@20fit.id>`.
>
> **Nol setelan Supabase bersama yang disentuh. Nol tabel baru. Nol perubahan skema.**

Proyek: `20FIT ALL DATA` (`cpvzwqptzcxnwzfzgrmt`). URL produksi:
`https://20fitcrm-production.up.railway.app`.

---

## 0. MENDESAK — rotasi `MAILTRAP_API_TOKEN` (menunggu tindakan manusia)

Token `MAILTRAP_API_TOKEN` **terlihat penuh dalam teks biasa** di sebuah screenshot dashboard
Railway yang dibagikan ke luar. **Anggap ia bocor.** Siapa pun yang memegangnya bisa mengirim
email atas nama domain `20fit.id`.

**Langkah pemegang akses (bukan aplikasi ini):**

1. Masuk ke Mailtrap → **Sending Domains / API Tokens** → **cabut (revoke)** token yang bocor.
2. **Terbitkan token baru.**
3. Di Railway → service CRM → **Variables** → perbarui `MAILTRAP_API_TOKEN` ke nilai baru.
   Railway me-redeploy; alur reset langsung memakai token baru tanpa perubahan kode.
4. Pastikan token lama benar-benar mati (kirim uji dengan token lama → harus ditolak).

**Higiene berbagi layar:** variabel Railway tidak boleh ditampilkan dalam keadaan terbuka saat
screen-share/− screenshot. Nilai `MAILTRAP_FROM` (`crm@20fit.id`) juga terlihat; itu tidak
sensitif, tapi biasakan menutup panel Variables saat berbagi.

> Aplikasi tidak pernah mencatat token, email, atau kode ke log/audit — tapi itu tidak
> menolong bila nilainya tampil di layar. Rotasi tetap wajib.

---

## 1. Variabel lingkungan (Railway) — WAJIB

| Variabel | Nilai | Guna |
|---|---|---|
| `MAILTRAP_API_TOKEN` | token **Sending** Mailtrap (rahasia) | otorisasi kirim |
| `MAILTRAP_FROM` | `crm@20fit.id` | alamat pengirim (nama tampil: `20FIT CRM`) |

Keduanya sudah ada di Railway. Server action memerlukan **service role** untuk `generateLink`
(sudah ada sebagai `SUPABASE_SERVICE_ROLE_KEY`); ia tidak pernah sampai ke klien.

---

## 2. Mailtrap: pastikan **Sending**, bukan **Testing/sandbox**

Email sampai ke Gmail (masuk Spam), jadi kemungkinan besar ini produk **Sending** — pastikan:

- Endpoint yang dipakai aplikasi: `https://send.api.mailtrap.io/api/send` (Sending). Kotak
  **Testing** memakai host `sandbox.api.mailtrap.io` dan **tidak** mengantar ke inbox nyata.
- Di Mailtrap → **Sending Domains** → domain `20fit.id` harus **Verified**. **Kalau BELUM
  verified, pengiriman dari `crm@20fit.id` ditolak sepenuhnya oleh Mailtrap** — dan gejalanya
  menipu: pengguna mendapat halaman kode tapi email tak pernah datang, mudah disalahartikan
  sebagai "kode salah". Periksa status Verified sebelum menyimpulkan ada bug di alur.
- Catat **batas kirim harian** paket Sending yang aktif (mis. free tier Mailtrap Sending
  membatasi jumlah email/hari). Bila staf yang mereset banyak, batas ini bisa terpukul —
  ketahui angkanya sebelum bergantung penuh pada alur ini.

---

## 3. Deliverability — SPF / DKIM / DMARC (pekerjaan pemegang DNS `20fit.id`)

Gmail menaruh email di **Spam** dan menandai *"This message might be dangerous"*. Selain
identitas pengirim (sudah diperbaiki: kini `20FIT CRM <crm@20fit.id>`, bukan "UOB Heartbeat
Run"), penyebab utamanya **autentikasi domain yang belum selaras**. Tanpa tiga record DNS ini,
email akan **tetap masuk spam betapapun rapinya isinya** — ini bukan kosmetik.

Nilai persisnya diambil dari **Mailtrap → Sending Domains → `20fit.id` → DNS records**
(Mailtrap menampilkan record yang harus disalin). Umumnya:

| Record | Tipe | Isi (ambil nilai dari Mailtrap) | Cara memastikan |
|---|---|---|---|
| **SPF** | TXT di `20fit.id` | sertakan mekanisme Mailtrap, mis. `include:_spf.mailtrap.io` di dalam satu `v=spf1 … ~all` | `dig TXT 20fit.id` memuat include Mailtrap |
| **DKIM** | CNAME/TXT di host yang diberi Mailtrap (mis. `rwmt1._domainkey`) | nilai dari Mailtrap | `dig CNAME <selector>._domainkey.20fit.id` |
| **DMARC** | TXT di `_dmarc.20fit.id` | mulai `v=DMARC1; p=none; rua=mailto:…` lalu perketat ke `p=quarantine`/`reject` setelah lolos | `dig TXT _dmarc.20fit.id` |

Catatan:

- **SPF hanya boleh satu** record `v=spf1` di domain — gabungkan include Mailtrap ke record
  yang sudah ada, jangan menambah record SPF kedua (justru merusak SPF).
- Setelah DNS menyebar, kirim uji ke Gmail lalu buka **Show original** → SPF/DKIM/DMARC harus
  **PASS**. Alat seperti mail-tester.com memberi skor cepat.
- Mulai DMARC dengan `p=none` (pantau, tidak menolak), naikkan bertahap agar tidak memblokir
  email sah tim lain yang juga mengirim dari `20fit.id`.

---

## 4. Verifikasi cepat setelah konfigurasi

1. Buka `https://20fitcrm-production.up.railway.app/forgot-password` → masukkan email staf yang ada.
2. Cek email → harus datang dari **20FIT CRM `<crm@20fit.id>`**, berbahasa Indonesia, berisi
   **kode enam digit** (bukan tautan).
3. Halaman mendarat di `/reset-password` (kode terbawa email ternormalisasi) → masukkan kode +
   kata sandi baru (min 8) → berhasil → diarahkan ke `/login`.
4. Coba email yang **tidak terdaftar** → pesan/alur **identik** (tetap ke halaman kode), tidak
   ada kode yang datang. Itu memang perilaku anti-enumerasi yang benar.

---

## 5. Masa berlaku kode

Kode mengikuti **Email OTP Expiration** proyek Supabase (default **3600 detik = 1 jam**).
Aplikasi menampilkan "berlaku 1 jam" di halaman (`RECOVERY_OTP_VALIDITY_LABEL` di
`lib/auth/recovery.ts`). **Bila** setelan expiry proyek diubah di Supabase (Authentication →
Rate Limits / Providers), ubah label itu agar cocok — kalau tidak, halaman akan menjanjikan
durasi yang salah.

---

> **Anti-enumerasi:** `/forgot-password` berperilaku **sama** entah email terdaftar atau tidak
> — `generateLink` gagal untuk email tak dikenal, galat itu **ditangkap** dan hasilnya tetap
> "kode dikirim". Audit tidak pernah menyimpan email atau kode. 887 akun berbagi proyek auth
> ini; jangan "membantu" dengan membuat pesan berbeda untuk email yang tak ada.
>
> **Rate limit:** tombol "Kirim ulang kode" punya cooldown sisi-klien; Supabase juga membatasi
> laju OTP per email (Authentication → Rate Limits). Keduanya lapis, bukan pengganti.
