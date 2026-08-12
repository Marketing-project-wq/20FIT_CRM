# Setup: reset kata sandi (konfigurasi dashboard Supabase)

> Alur "lupa kata sandi" (Sprint 3T) sudah dibangun di aplikasi: `/forgot-password`,
> `/reset-password`, tautan di `/login`, dan satu baris audit `login.password_reset_requested`.
> **Tiga hal berikut harus diatur MANUSIA di dashboard Supabase** — tak bisa dilakukan dari
> kode aplikasi ini. Tanpa ini, tautan email ditolak / tak terkirim, dan gejalanya terlihat
> seperti bug aplikasi padahal bukan.

Proyek: `20FIT ALL DATA` (`cpvzwqptzcxnwzfzgrmt`). URL produksi:
`https://20fitcrm-production.up.railway.app`.

## 1. Redirect URL — WAJIB (kalau tidak, tautan reset ditolak)

Authentication → **URL Configuration** → **Redirect URLs** → tambahkan:

```
https://20fitcrm-production.up.railway.app/reset-password
```

Alur memakai `resetPasswordForEmail(email, { redirectTo: <origin>/reset-password })`. Supabase
hanya mengirim ke redirect yang ada di allowlist ini. Bila memakai domain lain (staging/preview),
tambahkan juga variannya. Pastikan **Site URL** juga menunjuk domain produksi.

## 2. Template email — bahasa Indonesia (bawaan Supabase bahasa Inggris)

Authentication → **Email Templates** → **Reset Password**. Seluruh antarmuka ini bahasa
Indonesia; template bawaan tidak. Usulan (link-based, `{{ .ConfirmationURL }}`):

**Subject:**
```
Atur ulang kata sandi 20FIT CRM
```

**Body (HTML):**
```html
<h2>Atur ulang kata sandi</h2>
<p>Ada permintaan untuk mengatur ulang kata sandi akun 20FIT CRM Anda.</p>
<p><a href="{{ .ConfirmationURL }}">Klik di sini untuk membuat kata sandi baru</a></p>
<p>Tautan ini berlaku sekali dan untuk waktu terbatas. Jika Anda tidak meminta ini,
abaikan email ini — kata sandi Anda tidak berubah.</p>
```

> Alur aplikasi memakai **tautan** (link), bukan kode OTP. Biarkan `{{ .ConfirmationURL }}`.
> Klik tautan → Supabase membuat sesi pemulihan sementara → mendarat di `/reset-password`.

## 3. SMTP — prasyarat produksi

Authentication → **Emails → SMTP Settings**. SMTP bawaan Supabase punya **batas kirim rendah**
dan tidak untuk produksi. Periksa apakah SMTP kustom sudah diatur; kalau belum, itu prasyarat
sebelum alur ini dipakai staf sungguhan. (Bila memakai Mailtrap Sending: host
`live.smtp.mailtrap.io`, port 587, kredensial dari Sending Domain terverifikasi.)

## Verifikasi cepat setelah konfigurasi

1. Buka `https://20fitcrm-production.up.railway.app/forgot-password` → masukkan email staf yang ada.
2. Cek email → klik tautan → mendarat di `/reset-password` dengan form kata sandi baru.
3. Isi kata sandi baru (min 8) → berhasil → diarahkan ke `/login` → masuk dengan kata sandi baru.

Bila tautan "tidak sah / kedaluwarsa" padahal baru diklik: hampir selalu **Redirect URL (butir 1)**
belum masuk allowlist, atau **Site URL** salah.

---

> **Rate limit:** alur ini mengandalkan **rate limit email bawaan Supabase** (Authentication →
> Rate Limits) — tidak ada penyimpanan sisi-app untuk state per-email tanpa menambah tabel
> (di luar lingkup). Naikkan/atur di sana bila perlu.
>
> **Anti-enumerasi:** `/forgot-password` menampilkan pesan yang **sama** entah email terdaftar
> atau tidak, dan audit tidak pernah menyimpan email yang diketik — jangan "membantu" dengan
> membuat pesannya berbeda. 887 akun berbagi proyek Supabase ini.
