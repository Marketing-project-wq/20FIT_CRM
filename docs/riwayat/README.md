# Riwayat Pekerjaan — 20FIT CRM

Rekaman lengkap bagaimana sistem ini dibangun: prompt yang diberikan, laporan yang
dikembalikan, keputusan yang diambil, dan temuan yang muncul di sepanjang jalan.

**Kenapa folder ini ada.** Proyek ini dibangun lewat sesi-sesi agen yang tidak saling
mengingat. Konteksnya selama ini bertahan di tiga tempat yang rapuh: komentar kode,
pesan commit, dan riwayat percakapan yang bisa hilang. Beberapa kesalahan yang sudah
terjadi berakar langsung dari situ — prefix `NODE_ENV=production` dua kali nyaris
dihapus karena alasannya cuma ada di satu komentar, dan status `origin/main` sempat
salah dilaporkan karena tak ada catatan bersama. Folder ini memindahkan konteks itu ke
dalam repo, tempat ia ikut ter-review dan ikut ter-revert.

---

## ⚠️ Peringatan keamanan aktif (per 11 Agustus 2026)

Temuan keamanan tidak boleh terkubur di poin 5 sebuah laporan sprint. Yang terbuka **sekarang**,
semuanya di **tabel milik tim lain** (bukan kontrol CRM — `master_customer`/`crm_*`/`customer_engagement`
semua RLS ON):

- **T-17 — `master_customer` + `customer_engagement` terbuka BACA+TULIS untuk 887 akun login.**
  RLS ON **tapi** policy `authenticated_full_access` (`ALL`/`USING true`) → 82.253 profil bisa
  dibaca/diubah/dihapus tanpa masking/audit. **"RLS ON" ≠ terlindungi** (K-23). Dokumen eskalasi
  yang semula menyebutnya "aman" sudah dikoreksi (S-08). → `docs/ESKALASI-paparan-data-sensitif.md`
- **T-15 — NIK + data kesehatan ±1.100 orang terpapar `anon`.** `cf_hyrox_participants` (RLS OFF):
  NIK 1.030, tgl lahir, golongan darah, kontak darurat. Plus diagnosa/riwayat medis di
  `clinic_assessments`/`clinic_screenings` (RLS OFF), dan `cf_user.password` bernama polos.
- **T-03 — 102 fungsi `SECURITY DEFINER` anon-executable** di luar `crm_*` (naik dari 101).
- **T-02 — `staging_20fit_data` 88.536 baris RLS OFF** (nama/telepon/email).

Klasifikasi 383 tabel (RLS × policy × grant): **199 anon-open · 43 login-open · 141 terkunci**.
`crm_*` semua terkunci (pola benar). Kueri di `docs/PASCA-MERGE-monitoring-revert.md`.

Perbaikannya milik **pemilik data + owner Supabase**: menyalakan RLS tanpa policy memutus
aplikasi tim lain. Tim CRM mengukur dan mengangkat, tidak menyentuh.

---

## Struktur

```
docs/riwayat/
  README.md              Berkas ini — konvensi dan cara menambah sprint
  LINIMASA.md            Satu tabel: sprint, commit, tanggal, apa yang berubah
  KEPUTUSAN.md           Register keputusan — apa, kenapa, dan apa yang membalikkannya
  TEMUAN.md              Register temuan — apa ditemukan, kapan, statusnya sekarang
  FAKTA-DATA.md          Angka-angka yang terverifikasi ke database, beserta tanggalnya
  sprint-<id>/
    01-prompt.md         Prompt persis yang diberikan ke Claude Code
    02-laporan.md        Laporan penutup yang dikembalikan
    03-tinjauan.md       Verifikasi independen: apa yang cocok, apa yang tidak
  transkrip/
    <id>-<tanggal>.md    Transkrip mentah sesi, bila ada
```

## Konvensi

**Satu folder per sprint, tiga berkas.** Prompt, laporan, tinjauan. Kalau salah satu
tidak ada, tetap buat berkasnya dan tulis kenapa kosong — berkas yang hilang tanpa
penjelasan nanti terbaca sebagai "tidak pernah terjadi".

**Angka selalu bertanggal.** Setiap angka yang berasal dari database ditulis dengan
tanggal pengukurannya. Sistem ini dipakai orang; `crm_audit_log` bertambah sendiri.
Angka tanpa tanggal akan salah dalam hitungan hari, dan yang membacanya tidak akan tahu.

**Tulis yang gagal, bukan hanya yang berhasil.** Nilai terbesar folder ini justru ada
di kolom "salah" — koreksi `live_txn_ingest` yang saya tulis keliru, status
`origin/main` yang salah dilaporkan, dan `crm_purge_audit_log` yang sempat dinilai
"mungkin" bermasalah padahal sudah pasti. Semuanya tercatat di `TEMUAN.md`.

**Jangan pernah menaruh PII di sini.** Folder ini ikut ter-commit dan ikut ter-push.
Tidak ada nomor telepon pelanggan, tidak ada email pelanggan, tidak ada `identity_key`,
tidak ada isi `reason_detail`. Email staf internal boleh bila memang relevan pada
keputusan (mis. penerima peran `super_admin`).

## Menambah sprint baru

1. `mkdir docs/riwayat/sprint-<id>`
2. Simpan prompt sebagai `01-prompt.md` **sebelum** sesi dijalankan
3. Tempel laporan penutup ke `02-laporan.md` setelah selesai
4. Tulis `03-tinjauan.md`: verifikasi mandiri, apa yang cocok dan apa yang tidak
5. Perbarui `LINIMASA.md`, dan tambahkan baris ke `KEPUTUSAN.md` / `TEMUAN.md` bila ada
6. Commit bersama kerja sprintnya, bukan terpisah

## Yang TIDAK ada di sini, dan sebaiknya jujur disebut

`transkrip/` kosong untuk Sprint 1 sampai 3I. Yang tersimpan untuk periode itu hanya
**laporan penutup** — bukan transkrip penuh sesi. Langkah-langkah antara, percobaan yang
dibuang, dan pertimbangan yang tidak masuk laporan sudah tidak bisa dipulihkan.

Mulai Sprint 3J, simpan transkrip penuhnya ke `transkrip/`. Cara termurah: salin seluruh
percakapan sesi ke `transkrip/<sprint>-<tanggal>.md` sebelum menutupnya. Sekali sesi
ditutup tanpa disalin, isinya hilang permanen — itu sudah terjadi sembilan kali.
