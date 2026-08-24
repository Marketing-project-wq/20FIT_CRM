# KEBUTUHAN SISTEM — 20FIT CRM

Dinyatakan pemilik produk, **24 Agustus 2026**. Berkas ini adalah rujukan lingkup: apa yang
sistem ini harus lakukan, dan apa yang **bukan** urusannya.

Bila dokumen lain di repo bertentangan dengan berkas ini, **berkas ini yang menang** — kecuali
untuk angka database, yang selalu diukur ulang.

---

## 1. Tujuan

Tim 20FIT butuh sistem untuk mengelola skema marketing bagi seluruh pengguna yang masuk ke
ekosistem 20FIT.

---

## 2. Mengenali pengguna

Pengenalnya dua hal:

**Demografi** — dari kolom isian, atau dilengkapi dari NIK (NIK memuat provinsi penerbitan,
tanggal lahir, dan gender).

**Perilaku** — dari seluruh touchpoint 20FIT: event dan layanan apa saja yang pernah diikuti.

Sumber datanya Supabase, dan dibuat **tabel duplikasi yang disegarkan tiap 03:00 WIB** agar
waktu muat lebih cepat.

---

## 3. Segmentasi dan aksi

Pengguna dikelompokkan berdasarkan kriteria, disaring lewat demografi maupun perilaku.

**Segmen harus bisa langsung diberi aksi:**

- Email lewat Mailtrap
- Chat
- Telepon oleh admin

---

## 4. Workflow / skema marketing

Notifikasi berupa email, pop-up di aplikasi 20FIT, atau chat, yang diterima pengguna saat:

1. Login
2. Booking pertama
3. Setelah booking
4. Tidak kembali ke ekosistem 20FIT
5. Pengingat scan makanan di my20fit
6. Fitpoint mendekati kedaluwarsa
7. Ada promosi berjalan

Dan pemicu lain sejenis.

---

## 5. Template

Template email dan chat **disimpan dan bisa diedit di dalam sistem**, lalu dipakai di
workflow.

---

## 6. Data dan izin

Seluruh data di Supabase adalah milik 20FIT, sah, dan penggunanya sudah mengizinkan untuk
dihubungi. **Izin dan legalitas bukan hal yang perlu dipersoalkan sistem ini.**

**Unsubscribe:** pengguna diberi opsi berhenti berlangganan layanan CRM 20FIT. Data yang
memilih unsubscribe **tetap disimpan di tabel terpisah** di dalam sistem, sebagai basis data
saja.

---

## 7. Konsekuensi lingkup

Diturunkan dari pernyataan di atas, dan mengikat sampai pemilik produk mengubahnya:

**Consent bukan gerbang.** Setiap pengguna dianggap boleh dihubungi. Yang menentukan siapa
tidak boleh dihubungi hanyalah **unsubscribe**. Layar dan angka yang menyajikan consent
sebagai penghalang perlu dibingkai ulang.

**Unsubscribe adalah gerbang sesungguhnya**, dan berlaku untuk setiap kanal serta setiap
workflow. Tidak ada pengiriman yang boleh melewatinya.

**Tabel duplikasi bersifat snapshot**, jadi ia tidak cocok untuk pemicu berbasis kejadian.
Workflow yang harus bereaksi terhadap sesuatu yang baru saja terjadi tidak bisa membaca
snapshot harian.

**Setiap pengiriman meninggalkan catatan** — siapa dikirimi apa, kapan, lewat kanal apa,
dan hasilnya. Bukan demi kepatuhan, melainkan agar kampanye yang gagal bisa ditelusuri dan
tidak dikirim dua kali.

---

## 8. Keadaan implementasi — 24 Agustus 2026

| Kebutuhan | Status |
|---|---|
| Mengenali lewat demografi | Ada |
| Demografi dari NIK | Ada |
| Demografi dari isian admin | Jalur database ada; form belum |
| Perilaku dari touchpoint | Sebagian besar sumber tersambung |
| Tabel duplikasi 03:00 WIB | Ada dan berjalan |
| Segmentasi dan filter | Ada |
| Ekspor CSV segmen | Ada |
| **Aksi ke segmen (email/chat/telepon)** | **Belum ada** |
| **Workflow dan pemicu** | **Belum ada** |
| **Template tersimpan dan bisa diedit** | **Belum ada** |
| **Unsubscribe untuk pengguna** | **Belum ada** — tabel suppression ada, tapi belum ada jalur pengguna |
| Pop-up di aplikasi 20FIT | Belum ada |

**Separuh sistem yang sudah dibangun adalah separuh "mengenali". Separuh "menghubungi" belum
dimulai.**

---

## 9. Sumber pemicu — terukur 24 Agustus 2026

Ini menentukan pemicu mana yang bisa dibangun sekarang. Ukur ulang sebelum membangun.

| Pemicu | Sumber | Keadaan |
|---|---|---|
| Login | `my20fit_user_activity` | **Ada dan hidup** — 193 baris, `last_active_at` sampai hari ini. Hanya mencakup pengguna my20fit |
| Booking pertama | `arena_class_bookings`, `gym_*`, `clinic_bookings` | Tabelnya ada; perlu dipastikan ada tanda waktu yang benar-benar bergerak |
| Setelah booking | sama | sama |
| **Tidak kembali** | — | **Tidak bisa dibangun untuk sebagian besar pool.** Kolom waktu di `master_customer` dan `customer_engagement` adalah cap waktu muat, bukan aktivitas. Satu-satunya recency nyata ada di `my20fit_user_activity`, dan itu hanya mencakup 44 profil |
| Scan makanan | `my20fit_scan_ledger` | **Ada** — 156 baris, terakhir 18 Agustus |
| **Fitpoint kedaluwarsa** | — | **Tidak ditemukan.** Tidak ada tabel poin dengan saldo dan tanggal kedaluwarsa. `my20fit_reward_claims` kosong |
| Promosi berjalan | `my20fit_promo_banners` | Ada 1 baris; pemicunya manual, jadi tidak butuh sumber kejadian |

**Dua pemicu belum punya sumber:** "tidak kembali" dan "fitpoint kedaluwarsa". Keduanya butuh
data yang belum ada, bukan kode yang belum ditulis.

---

## 10. Yang perlu diputuskan pemilik produk

1. **Kanal chat mana** — WhatsApp Business API, atau lainnya? Menentukan seluruh bentuk
   pengiriman chat.
2. **Pop-up di aplikasi 20FIT** — apakah aplikasinya punya cara menerima pesan dari luar,
   atau perlu dibangun?
3. **Fitpoint** — di mana saldo dan kedaluwarsanya tersimpan? Tanpa itu pemicu nomor 6 tidak
   bisa dibuat.
4. **"Tidak kembali"** — mengingat recency nyata hanya untuk pengguna my20fit, apakah pemicu
   ini dibatasi ke mereka, atau ditunda sampai ada sumber aktivitas yang lebih luas?
5. **Batas kirim Mailtrap** — berapa email per hari? Menentukan apakah kampanye besar perlu
   antrean.

---

## Lampiran — Verifikasi angka oleh agen (24 Agustus 2026)

> Ditambahkan oleh Claude Code, bukan bagian dari pernyataan pemilik produk. Berkas kebutuhan
> "menang" untuk **lingkup**; angka database **selalu diukur ulang** (bagian 6 di atas). Ini
> hasil pengukuran langsung ke DB produksi (`cpvzwqptzcxnwzfzgrmt`) pada 24 Agu 2026.

**Bagian 8 — semua cocok.** `crm_consent` = **408.119** · `crm_suppression` = **0** ·
`master_customer` = **82.253** · `crm_contactable_counts()` = **82.253 / 82.253** (marketing /
transactional).

**Bagian 9 — satu selisih, sisanya cocok:**

| Pemicu / sumber | Dokumen | Terukur 24 Agu | Catatan |
|---|---|---|---|
| `my20fit_user_activity` baris | 193 | **193** | cocok |
| `my20fit_user_activity` profil tercocok | 44 | **47** | **+3.** Join `lower(trim(email))` = `email_normalized`. Tabel ini **hidup**, jadi angka menggeser; intinya tetap: hanya ~47 dari 82.253 profil punya recency nyata |
| `last_active_at` maksimum | "sampai hari ini" | **2026-08-24 09:27 UTC** | cocok (hari ini) |
| `my20fit_scan_ledger` baris | 156 | **156** | cocok. Kolom waktunya `created_at` (bukan `scanned_at`) |
| scan terakhir | 18 Agu | **2026-08-18 12:07 UTC** | cocok |
| `my20fit_promo_banners` baris | 1 | **1** | cocok |
| `my20fit_reward_claims` | kosong | **0 baris** | cocok — pemicu Fitpoint tanpa sumber |
| Booking: `arena_class_bookings` | "perlu dipastikan tanda waktu bergerak" | **2.947 baris, 188 hari berbeda, 2026-02-12 → 24 Agu, `paid_at` hari ini** | **Terkonfirmasi bergerak** — sumber kejadian nyata untuk pemicu booking |
| Booking: `clinic_bookings` | sama | **317 baris, 27 hari, 29 Jul → 24 Agu, `check_in_at` hari ini** | **Terkonfirmasi bergerak** |
| Booking: `gym_memberships` | sama | **0 baris** | Kosong — tak ada sumber booking gym |

**Konsekuensi untuk peta jalan:** pemicu **Login** (my20fit), **Scan makanan**, dan **Booking
pertama/Setelah booking (arena + clinic)** punya sumber kejadian hidup dan terukur. **Gym**,
**"Tidak kembali"** (di luar ~47 pengguna my20fit), dan **Fitpoint** tetap tanpa sumber.
