# PANDUAN LANJUTAN — untuk sesi Claude berikutnya

Berkas ini adalah titik masuk. Baca ini lebih dulu sebelum apa pun, lalu ikuti tautannya.

Terakhir diperbarui: **13 Agustus 2026.**

---

## 1. Apa yang sedang dikerjakan

20FIT CRM — alat internal untuk staf mengelola data pelanggan dari banyak sistem 20FIT
(arena, gym, clinic, event, my20fit, shop). Next.js 14 + Supabase, deploy di Railway.

Basis data: **82.253 profil** di `master_customer`, dibaca saja. Seluruh tulis CRM berada di
tabel `crm_*` yang RLS ON tanpa policy (hanya `service_role`).

---

## 2. Cara kerja yang berjalan selama ini

Tiga pihak, tiga peran berbeda. Kalau kamu sesi chat, kamu pihak nomor 2.

| Pihak | Perannya |
|---|---|
| Pemilik produk | Memutuskan arah, dan satu-satunya yang bisa menyentuh dashboard Railway, Supabase, Mailtrap, dan DNS |
| **Sesi chat (kamu)** | Menulis prompt untuk Claude Code, lalu **memverifikasi laporannya secara independen** lewat connector Supabase |
| Claude Code | Menjalankan prompt di repo, melapor dengan format tetap |

**Verifikasi independen adalah inti perannya, bukan formalitas.** Sesi chat punya akses
Supabase MCP dan bisa menjalankan SQL langsung ke produksi. Beberapa temuan terpenting proyek
ini muncul justru dari memeriksa ulang angka yang dilaporkan — lihat `TINJAUAN-EKSTERNAL.md`.

Format prompt yang sudah mapan ada di seluruh berkas `sprint-*/01-prompt.md`. Tirulah:
aturan proses (`git fetch` dulu), tugas bernomor, tabel LARANGAN dengan alasan per baris,
laporan penutup bernomor, dan penutup **"Jangan klaim apa pun yang belum kamu jalankan dan
lihat hasilnya."**

---

## 3. Sumber kebenaran — jangan ditulis ulang

Berkas berikut **dipelihara Claude Code di repo** dan selalu lebih mutakhir daripada ingatan
sesi chat mana pun. Baca, jangan salin isinya ke tempat lain:

| Berkas | Isi |
|---|---|
| `docs/riwayat/KEPUTUSAN.md` | Keputusan K-01 … K-28, masing-masing dengan syarat pembalikannya |
| `docs/riwayat/TEMUAN.md` | Temuan T-01 … T-19 plus kesalahan sendiri (`S-`) |
| `docs/riwayat/FAKTA-DATA.md` | Angka database, bertanggal |
| `docs/riwayat/LINIMASA.md` | Sprint, commit, ledger migrasi |
| `docs/MENUNGGU-TINDAKAN-MANUSIA.md` | Yang hanya bisa diselesaikan manusia |
| `README.md` | Ledger migrasi, peringatan deploy, sistem desain |

**Kalau berkas ini bertentangan dengan panduan yang kamu baca sekarang, berkas di repo yang
menang.** Panduan ini bisa basi; register di repo diperbarui tiap sprint.

Yang **hanya** ada di folder ini dan tidak di tempat lain: arsip prompt (`sprint-*/`) dan
catatan tinjauan eksternal (`TINJAUAN-EKSTERNAL.md`).

---

## 4. Keadaan per 13 Agustus 2026

**Sudah jalan di produksi:** login dan reset kata sandi, audience pool, pencarian profil,
detail profil, layar audit, consent register, quality, segment builder dengan filter AND/OR
dan asisten AI, ekspor CSV streaming, diagnostik.

**Data:** `crm_consent` 408.119 baris (backfill `legacy_import_unverified`, marketing +
transactional). `crm_suppression` **0 baris** — belum ada permintaan berhenti pertama.
`crm_audit_log` ~130 baris dan bertumbuh.

**Migrasi 1–14 diterapkan.** Migrasi 15 (matview cermin) **sedang di gerbang** — SQL sudah
disetujui berikut nama tabel sumbernya di `sprint-5a/02-balasan-migrasi15.md`, tinggal
dijalankan.

**Sedang berjalan (Sprint 5A):** menyederhanakan tampilan (K-28), tabel cermin, muat
bertahap 10 baris. TUGAS 1 dan 4 selesai; TUGAS 2 dan 3 menunggu migrasi 15.

**Tertunda dengan sadar:** terjemahan Inggris untuk `/quality` dan detail profil (menunggu
layarnya disederhanakan), penyederhanaan detail profil, alur persetujuan ekspor untuk
`crm_operator` dan `unit_manager`.

---

## 5. Jebakan yang sudah menggigit proyek ini

Baca bagian ini sebelum menulis prompt pertama. Semuanya sudah terjadi setidaknya sekali.

**Aksi audit baru jatuh di antara dua daftar.** Migrasi 8 memangkas berdasarkan allowlist
eksak dan melindungi denylist kepatuhan. Aksi yang tidak masuk keduanya tidak pernah
dipangkas dan tidak pernah dilindungi. Sudah nyaris terjadi tiga kali (`quality.viewed`,
`suppression.*`, `segment.*`). Selalu pakai prefiks yang sudah ada, dan konfirmasi lewat test
paritas dengan nama aksi yang persis dipakai.

**Aturan yang ditulis dua kali akan menyimpang.** Kanon telepon (3B) dan daftar retensi (3E)
keduanya pernah hidup di lebih dari satu tempat. Satu sumber, dan test yang membandingkannya.

**"RLS ON" bukan berarti terlindungi.** `master_customer` punya policy
`authenticated_full_access` yang memberi 887 akun akses baca-tulis penuh. Klaim keamanan
tabel hanya sah bila menyebut RLS **dan** policy **dan** grant (K-23).

**Materialized view tidak punya RLS sama sekali.** Grant satu-satunya perlindungan.

**Fungsi Postgres baru otomatis dapat `EXECUTE` untuk `anon`.** `revoke … from public` tidak
mencabutnya. Wajib `revoke … from public, anon, authenticated` **plus**
`grant execute … to service_role` di migrasi yang sama (K-15).

**Kolom waktu berbohong.** `created_at`, `first_seen_at`, `last_activity_at`, dan
`customer_engagement.last_seen_at` semuanya cap waktu muat untuk 98–99% pool. Nol kriteria
segmentasi berbasis waktu (K-19).

**Jangan pakai `pg_class.reltuples`.** Estimasi perencana bergeser sendiri; selalu `count(*)`.

**Produksi men-deploy dari `main`, auto-deploy saat push** (dashboard Railway, dikonfirmasi
24 Agu 2026). **Merge ke `main` = deploy ke produksi seketika** — jadi jangan merge tanpa izin.
_(Koreksi: catatan lama "deploy dari branch, K-27" **salah** — ref `origin/main` basi; K-27
dibatalkan, lihat T-22/T-27/K-25 yang dikoreksi.)_

**`supabase db push` jangan pernah dijalankan.** Ledger diverge dan punya entri ganda; semua
migrasi lewat `apply_migration` satu per satu.

**Batas 60 detik klien MCP berbeda dari `statement_timeout` 2 menit server** (K-24). Klien
menyerah lebih dulu sementara backend terus jalan — jangan mengira operasinya gagal.

---

## 6. Nada yang dipakai di produk ini

Sistem ini menampilkan data yang buruk apa adanya. Itu keputusan, bukan kelalaian:

- `0` berarti terukur nol; `—` berarti tidak ada sumbernya. Jangan pernah tertukar (K-08).
- "tidak terekam" berbeda dari "belum terisi" — dua sebab, jangan disatukan.
- Angka tidak pernah ditulis tangan di komponen; dihitung per request (K-10).
- Peringatan tidak diperhalus. **Tapi sejak K-28**, ia satu baris di titik pakai dengan
  sebabnya di balik pengungkapan — bukan paragraf di puncak halaman. Penumpukan peringatan
  sempat mengubur produknya.

---

## 7. Langkah berikutnya

1. Jalankan migrasi 15 (SQL dan nama tabel sudah disetujui di
   `sprint-5a/02-balasan-migrasi15.md`), lalu sambungkan tiga layar dan verifikasi sebelas
   angka acuan
2. Sederhanakan detail profil — delapan blok kosong jadi satu baris ringkasan
3. Terjemahkan `/quality` dan detail profil setelah disederhanakan
4. Alur persetujuan ekspor

**Yang menunggu pemilik produk, dan tidak akan selesai sendiri:** rotasi
`MAILTRAP_API_TOKEN` yang bocor lewat screenshot, verifikasi domain `20fit.id` di Mailtrap,
SPF/DKIM/DMARC, dan `ANTHROPIC_API_KEY` yang belum diisi sehingga asisten AI belum pernah
menyala.

Daftar lengkapnya di `docs/MENUNGGU-TINDAKAN-MANUSIA.md`.
