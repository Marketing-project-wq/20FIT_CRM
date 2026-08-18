# CLAUDE CODE PROMPT — Sprint 3T: Lupa Kata Sandi

> **Sprint kecil dan berdiri sendiri.** Tidak menyentuh data pelanggan, tidak menyentuh
> skema, tidak berkaitan dengan pekerjaan 3S. Bisa dikerjakan kapan saja di sela.
>
> **Kondisi sekarang:** halaman login tidak punya tautan "lupa kata sandi". Ada yang sudah
> mencoba membuka `/forgot-password` langsung dan dipantulkan — URL produksi menunjukkan
> `?redirectedFrom=%2Fforgot-password`.
>
> **Penyebabnya dua lapis, dan lapisan kedua yang mudah terlewat:** halamannya memang belum
> ada, **dan** `lib/supabase/middleware.ts` hanya melewatkan `/login`, `/health`, dan `/dev`
> tanpa sesi. Menambah halaman tanpa mengubah allowlist middleware akan menghasilkan gejala
> yang persis sama — pantulan ke login — dan itu akan terlihat seperti halamannya gagal
> dibuat.
>
> Akun dibuat admin, tanpa registrasi mandiri (tertulis di halaman login). Reset kata sandi
> **tidak** mengubah itu: ia hanya memulihkan akses akun yang sudah ada.

---

## ATURAN PROSES

```bash
git fetch --all --prune
git log --oneline -3 origin/main
git log --oneline origin/main..HEAD
```

Laporkan apa adanya. **Nol perubahan skema. Nol sentuhan ke data pelanggan.**

---

# PROMPT UNTUK CLAUDE CODE — SALIN MULAI DARI SINI

---

## TUGAS 1 — Buka jalurnya di middleware

Di `lib/supabase/middleware.ts`, `publicPath` saat ini hanya mencakup `/login`. Tambahkan
`/forgot-password` dan `/reset-password`.

**Yang wajib dijaga:**

- Sifat **fail-closed** tidak berubah: bila `NEXT_PUBLIC_SUPABASE_URL` atau anon key tidak
  ada, jalur publik tetap lewat dan jalur terlindungi tetap dipantulkan. Ikuti pola yang
  sudah ada, jangan tulis cabang baru.
- Pengguna yang **sudah** login dipantulkan dari `/login` ke `/`. Terapkan hal yang sama
  untuk `/forgot-password` — orang yang sudah masuk tidak perlu meminta reset. Tapi
  **jangan** untuk `/reset-password`: alur Supabase justru membuat sesi sementara saat
  tautan email diklik, jadi memantulkan halaman itu akan mematahkan resetnya sendiri. Ini
  jebakan paling mudah terkena di sprint ini.
- Perbarui komentar yang menyebut "hanya /login dan /health" — ada di `middleware.ts` dan
  di `lib/supabase/middleware.ts`. Komentar yang salah soal jalur publik akan dipercaya
  orang berikutnya.

Tulis satu test yang menegakkan daftar jalur publik, supaya penambahan berikutnya tidak
lolos tanpa sadar.

---

## TUGAS 2 — Halaman `/forgot-password`

Ikuti bentuk `/login` persis: `data-theme="dark"`, `BrandLogo variant="white"`,
`glass-strong`, komponen `Input`/`Label`/`Button` yang sudah ada. Jangan buat gaya baru —
dan ingat kelas warna bernomor tidak menghasilkan CSS di proyek ini (K-11).

Isi: satu field email, satu tombol, dan tautan kembali ke `/login`.

**Pesan hasilnya wajib sama persis, baik emailnya terdaftar maupun tidak:**

> "Bila email tersebut terdaftar, tautan untuk mengatur ulang kata sandi sudah dikirim.
> Periksa kotak masuk dan folder spam."

Ini bukan formalitas. Pesan yang berbeda akan mengubah halaman ini jadi alat memeriksa
siapa saja yang punya akun — dan proyek Supabase ini dipakai bersama, dengan **887 akun**
di `auth.users`. Alasan itu tulis di komentar, karena orang berikutnya akan tergoda
membuat pesannya "lebih membantu".

Server action-nya memakai `supabase.auth.resetPasswordForEmail(email, { redirectTo })`.
Perlakukan galat seperti `signIn` sudah melakukannya: bedakan penolakan biasa dari
kegagalan koneksi, dan **log tanpa PII** — status dan kode saja, tidak pernah emailnya.
Pola `console.error` di `app/login/actions.ts` sudah benar; ikuti, jangan buat pola kedua.

Beri **rate limit sederhana per alamat email**, cukup untuk menghambat pengiriman berulang.
Kalau tidak ada tempat menyimpan state tanpa menambah tabel, katakan begitu dan andalkan
rate limit bawaan Supabase — laporkan mana yang kamu pilih.

---

## TUGAS 3 — Halaman `/reset-password`

Halaman tujuan tautan email: dua field kata sandi baru (isi dan konfirmasi), lalu
`supabase.auth.updateUser({ password })`.

**Yang harus benar:**

- Tautan reset **kedaluwarsa** dan **sekali pakai**. Bila sesinya tidak sah atau sudah
  lewat, tampilkan pesan jelas beserta tautan kembali ke `/forgot-password` — bukan layar
  galat kosong yang membuat orang mengira sistemnya rusak.
- Syarat panjang minimum kata sandi yang diberitahukan **sebelum** dikirim, bukan sesudah
  ditolak.
- Setelah berhasil: pesan sukses, lalu arahkan ke `/login`.
- Nol tebakan soal siapa penggunanya di layar ini — tidak menampilkan email, nama, atau
  peran. Halaman ini hanya perlu tahu ada sesi reset yang sah.

---

## TUGAS 4 — Tautan di halaman login

Tambahkan "Lupa kata sandi?" di dalam kartu login, di bawah field kata sandi. Kecil,
sekunder, tidak bersaing dengan tombol MASUK.

Teruskan `redirectedFrom` bila ada, supaya orang kembali ke tempat tujuannya setelah
berhasil masuk.

---

## TUGAS 5 — Audit dan konfigurasi

**Audit:** tulis satu baris saat permintaan reset diajukan. Aksinya **`login.password_reset_requested`**
— jatuh di bawah prefiks `login.%` yang **sudah** ada di allowlist operasional migrasi 8,
jadi ia terklasifikasi dengan benar dan dipangkas setelah 90 hari. **Konfirmasi lewat test
paritas Sprint 3E dengan nama aksi yang persis dipakai**, jangan diasumsikan — itu
kesalahan yang sudah dihindari tiga kali (`quality.viewed`, `suppression.*`, `segment.*`).

Yang dicatat: bahwa permintaan diajukan, dan hasilnya. **Emailnya jangan masuk `metadata`.**
Bila `actor_email` memang kolom yang wajar untuk diisi di sini, pertimbangkan bahwa ini
email staf internal, bukan pelanggan — putuskan dan jelaskan pilihanmu. Catat permintaan
**tanpa** memberi tahu apakah akunnya ada; jangan sampai audit log membocorkan apa yang
sengaja disembunyikan dari layar.

**Konfigurasi yang harus dilakukan manusia di dashboard Supabase — sebutkan di laporan,
kamu kemungkinan tidak bisa mengaturnya sendiri:**

1. **Redirect URL** produksi wajib masuk allowlist Auth Supabase
   (`https://20fitcrm-production.up.railway.app/reset-password`). Tanpa ini tautan emailnya
   akan ditolak, dan gejalanya terlihat seperti bug aplikasi.
2. **Template email** Supabase bawaannya berbahasa Inggris. Seluruh antarmuka ini bahasa
   Indonesia; sarankan template Indonesia dan sediakan teksnya.
3. **SMTP.** Bawaan Supabase punya batas kirim rendah dan tidak untuk produksi. Periksa
   apakah SMTP kustom sudah diatur; kalau belum, sebutkan sebagai prasyarat.

Tulis ketiganya di `docs/SETUP-reset-password.md` supaya siapa pun yang punya akses
dashboard bisa menuntaskannya tanpa menebak.

---

## LARANGAN

| Jangan | Alasan |
|---|---|
| Jangan bedakan pesan untuk email terdaftar dan tidak | Akan jadi alat memeriksa siapa punya akun; 887 akun di proyek bersama |
| Jangan pantulkan pengguna bersesi dari `/reset-password` | Alur Supabase membuat sesi sementara; memantulkannya mematahkan reset |
| Jangan buat registrasi mandiri | Akun dibuat admin — reset hanya memulihkan akses yang sudah ada |
| Jangan catat email di `metadata` audit atau log | Pola `login/actions.ts` sudah benar; ikuti |
| Jangan buat aksi audit di luar prefiks yang sudah ada | Allowlist migrasi 8 memangkas per nama eksak |
| Jangan pakai kelas warna bernomor | Tidak menghasilkan CSS di proyek ini (K-11) |
| Jangan buat migrasi, tabel, view, atau RPC | Nol perubahan skema |
| Jangan longgarkan fail-closed middleware | Jalur terlindungi tetap dipantulkan saat env tak lengkap |
| Jangan sentuh data pelanggan atau `crm_*` selain menulis satu baris audit | Sprint ini soal autentikasi staf |
| Jangan merge atau push ke `main` tanpa izin eksplisit | Produksi sedang dipakai orang |
| Jangan hapus prefix `NODE_ENV=production` di `railway.json` | Baca README dulu |

---

## LAPORAN PENUTUP

1. **Status remote**
2. **Middleware** — jalur publik yang ditambahkan, bagaimana `/reset-password` dibedakan
   dari `/forgot-password` untuk pengguna bersesi, dan test yang menjaganya
3. **Kedua halaman** — bentuknya, dan bagaimana pesan seragam ditegakkan
4. **Audit** — aksi yang dipakai, konfirmasi klasifikasinya lewat test paritas, dan apa
   yang kamu putuskan soal `actor_email`
5. **Rate limit** — buatan sendiri atau bawaan Supabase, dan alasannya
6. **Konfigurasi dashboard** — ketiga item, dan mana yang bisa kamu verifikasi sendiri
7. **Yang TIDAK bisa kamu verifikasi** — pengiriman email nyata hampir pasti termasuk

Gate akhir: `tsc --noEmit` bersih, `next lint` bersih, seluruh test hijau,
`NODE_ENV=production npm run build` lulus. Sebutkan jumlah test sebelum dan sesudah.

Jangan klaim apa pun yang belum kamu jalankan dan lihat hasilnya.

# SELESAI — AKHIR PROMPT
