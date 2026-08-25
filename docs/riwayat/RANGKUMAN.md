# RANGKUMAN PEKERJAAN — 20FIT CRM

Keadaan per **25 Agustus 2026**. Angka **diukur ulang ke produksi 25 Agu 2026** (hari yang sama) —
**nol selisih** dari yang tercatat di §2 (lihat verifikasi di bawah). **Ukur ulang sebelum dipakai
mengambil keputusan** — beberapa tabel hidup dan bertumbuh tiap hari (`crm_audit_log` sudah naik
233→236 dalam sesi ini saja).

---

## 1. Apa yang sistem ini lakukan sekarang

Separuh **mengenali** selesai dan dipakai. Separuh **menghubungi** terbangun dan terbukti sekali,
tetapi belum dipakai untuk pelanggan.

| Kemampuan | Keadaan |
|---|---|
| Pool audiens 82.253 profil | Jalan |
| Pencarian satu orang — nama, telepon, email dikenali otomatis | Jalan |
| Detail profil bertab: Demografi dan Perilaku | Jalan |
| Demografi turunan NIK, gender, tanggal lahir, provinsi KTP | Jalan |
| Perilaku dari sumber ekosistem dan nama kelas | Jalan |
| Kualitas data | Jalan, jadi tab di Audience |
| Daftar unsubscribe | Jalan, jadi tab di Audience |
| Penyusun kriteria dan asisten AI | Jalan, di Campaigns |
| Template email dan WhatsApp berversi | Jalan |
| Jalur kirim, batas harian, idempotensi | **Terbukti sekali ke alamat internal** |
| Webhook Mailtrap — delivered, bounce, unsubscribe | **Terbukti sekali** |
| Halaman unsubscribe bertanda tangan | Belum pernah diklik |
| Workflow dan pemicu | **Belum dibangun** |
| Ingestion pengguna baru | **Belum dibangun** |

## 2. Angka kunci — 25 Agustus 2026 (diukur ulang 25 Agu, nol selisih)

| | |
|---|---|
| `master_customer` | **82.253** · muatan terakhir **31 Juli** · nol profil baru sejak itu |
| `crm_consent` | 408.119 — arsip dasar hukum, bukan gerbang (K-36) |
| `crm_suppression` | **0** — belum ada permintaan berhenti |
| `crm_audit_log` | **236** baris (hidup — 233 di awal sesi ini) |
| `crm_message_log` | **1** — `delivered`, uji internal 25 Agustus |
| `crm_campaign_run` | 3 — satu `sent`, dua `stopped` dengan sebab tercatat |
| `crm_message_template` | 1 |
| `crm_segment` | 1 |
| `crm_user_role` | **3, semuanya `super_admin`** |
| `crm_profile_demographic` | **248** — lihat §4 + T-35 |
| Cermin disegarkan | Tiap 03:00 WIB lewat `pg_cron` jobid 9 |

## 3. Temuan yang membentuk sistem ini

- **Kolom waktu berbohong.** `created_at` / `first_seen_at` / `last_activity_at` /
  `customer_engagement.last_seen_at` = cap waktu muat untuk 98–99% pool. Nol kriteria segmentasi
  berbasis waktu (K-19).
- **Pool beku, sumber hidup.** `master_customer` berhenti 31 Juli; sumber terus tumbuh. >**1.400 orang**
  ada di 20FIT tapi tak di pool, naik tiap hari. Tak ada ingestion.
- **`staging_20fit_data` sumber terbaik yang lama tak dipakai.** Cocok **98,6%**, ekosistem gabungan
  cuma **1,12%**. Memuat tanggal lahir untuk 5.467 baris yang dijatuhkan impor awal.
- **RFM praktis tak bisa menyegmentasi.** `New User` 74.021/82.253 — satu keranjang 90% pool.
- **`master_customer` bisa ditulis 887 akun** lewat policy `authenticated_full_access` (T-17). Belum
  diremediasi; keputusan pemilik data.
- **Ledger migrasi bersama.** Tim lain menulis skema di proyek Supabase yang sama. Rekonsiliasi per
  nama, bukan rentang versi (T-20).
- **Model deploy tercatat salah dua kali** (koreksi: produksi deploy dari `main`, T-27). Diskriminator
  di dashboard Railway, bukan di repo.

## 4. Temuan baru — 25 Agustus (lihat T-35)

`crm_profile_demographic` = **248 baris**, ditulis **21 Agu 2026 15:44:15 UTC** dalam SATU batch (cap
waktu identik), seluruhnya `gender_source='progressive_profiling'` (246 juga DOB progressive). CRM tak
pernah menulis ke sana — form isian adminnya baru dibangun setelah itu, dan `crm_upsert_profile_demographic`
hanya menulis `staff_entry`. **Berarti pihak lain menulis ke tabel `crm_*`.** Detail + audit grant di
**T-35**.

## 5. Kegagalan senyap — pola yang berulang (6×, tiap kali berhari-hari)

Reset kata sandi (satu pesan, empat keadaan) · ekspor berkas kosong (stream putus tanpa penanda) ·
ekspor `phone` vs `phone_normalized` (hitung vs baris tak diuji bersama) · ekspor "telepon saja"
menampilkan email · kirim berhenti tanpa jejak (lempar sebelum baris pertama) · konstanta dari modul
`"use server"` (tipe benar, nilai kosong di klien). **Penangkal terpasang**: galat dibedakan per
keadaan, penanda akhir/gagal di berkas, pra-cek semua-variabel-sekaligus, pagar pemindai sumber
(terjemahan + `"use server"` + frasa usang). **Pelajaran:** kegagalan tanpa jejak sebab bertahan
sampai dilaporkan secara kebetulan.

## 6. Yang menunggu tindakan manusia

DNS `crm.20fit.id` (tautan unsubscribe mati) · `NEXT_PUBLIC_APP_URL` (gerbang host) · merge PR terbuka ·
beri peran ke tim (RBAC belum diuji dengan peran nyata) · kredensial WhatsApp · sumber fitpoint ·
persetujuan Jeff (K-32/K-43/K-44 tiga-peran) · remediasi T-17 (887 akun bisa tulis `master_customer`).

## 7. Yang belum dikerjakan

- **Workflow & pemicu.** 5/7 punya sumber (login, booking pertama, setelah booking, scan makanan,
  promosi); 2 tidak ("tidak kembali" recency nyata hanya 47 profil; "fitpoint kedaluwarsa" tak ada
  tabelnya). Arsitektur pemicu belum diputuskan.
- **Ingestion.** Terbesar. Tanpa itu pool beku, selisih naik.
- **Terjemahan** detail profil & `/settings/diagnostik`.
- **Redesign** mengikuti 20FIT Shop (token & primitif sudah dimulai; kerangka + layar tertunda).

## 8. Cara kerja yang berlaku

Tiga pihak: pemilik produk memutuskan + memegang akses infra; sesi chat menulis prompt **dan
memverifikasi laporan independen lewat SQL ke produksi**; Claude Code menjalankan + melapor.
Verifikasi independen itu inti (lihat `TINJAUAN-EKSTERNAL.md`). **Rujukan lingkup teratas:**
`docs/KEBUTUHAN-SISTEM.md` — bila dokumen lain bertentangan, ia yang mengalah, kecuali angka database
(selalu diukur ulang).

---

## Verifikasi angka §2 — 25 Agu 2026 (SQL langsung ke produksi)

`master_customer` 82.253 · `crm_consent` 408.119 · `crm_suppression` 0 · `crm_audit_log` 236 ·
`crm_message_log` 1 · `crm_campaign_run` 3 · `crm_message_template` 1 · `crm_segment` 1 ·
`crm_user_role` 3 · `crm_profile_demographic` 248. **Sepuluh dari sepuluh cocok.** Satu-satunya yang
bergerak dalam sesi: `crm_audit_log` (233→236, tabel hidup — pembacaan halaman sendiri teraudit).
