# RANGKUMAN PEKERJAAN — 20FIT CRM (per 31 Agustus 2026)

> **Untuk sesi Claude Chat berikutnya (pihak #2 — penulis prompt + verifikator SQL).**
> Baca ini lebih dulu, lalu `docs/riwayat/PANDUAN-LANJUTAN.md`. **Ukur ulang angka ke produksi
> sebelum dipakai mengambil keputusan** — beberapa tabel hidup dan bertumbuh tiap hari.

---

## 0. PERINGATAN PROSES — register di `docs/riwayat/` TERTINGGAL dari kode

`RANGKUMAN.md`, `LINIMASA.md`, `TEMUAN.md`, `KEPUTUSAN.md` berhenti di **25 Agustus** (T-35).
Kode di `main` sudah **26–28 Agustus** (lapisan aktivitas, ingestion, workflow, editor template,
scheduled send, dll — lihat §3). **Fitur-fitur baru itu BELUM tercatat di register.** Tugas
kebersihan pertama sesi berikut: **perbarui LINIMASA/TEMUAN/KEPUTUSAN** agar cocok dengan kode,
lalu jaga konvensi "sumber kebenaran ada di repo, diperbarui tiap sprint".

**Cara ukur ulang yang benar:** `count(*)`, BUKAN `pg_stat_user_tables.n_live_tup` — estimasi itu
basi parah (31 Agu menunjukkan master_customer 577, padahal sebenarnya 82.830). Selalu `count(*)`.

---

## 1. Keadaan besar — separuh "menghubungi" kini nyata terpakai

Sebelumnya: separuh **mengenali** selesai; separuh **menghubungi** terbangun & terbukti sekali.
Sekarang (26–28 Agu), separuh menghubungi **matang** dan tiga penghalang terbesar mulai dibongkar:

| Kemampuan | Keadaan 31 Agu |
|---|---|
| **Ingestion — pool tak lagi beku** | ✅ **Mulai.** +577 orang aktif masuk `master_customer` (`source='activity_ingest'`, Opsi A, disetujui pemilik 27 Agu; consent di-skip — unsubscribe gerbangnya, K-36). Kolom AMAN saja (nama/email/telepon/unit); TANPA NIK/kesehatan/DOB. |
| **Lapisan aktivitas + kriteria waktu JUJUR** | ✅ **Dibangun (migrasi 27).** `crm_activity_event`+`crm_customer_activity` dari sumber HIDUP (arena/klinik/hyrox/my20fit) dengan timestamp ASLI → membuka kriteria "kapan bergabung / tidak aktif" — **membalik larangan waktu K-19 KHUSUS di sumber yang datanya nyata** (master tetap load-stamp). Cacat tanggal masa depan (T-14) dibuang di rebuild. |
| **Workflow** | ✅ **Dibangun (Fase 3):** welcome & re-engagement di atas lapisan aktivitas. Tabel `crm_workflow`/`crm_workflow_enrollment` ada, **0 baris** (belum diaktifkan). |
| **Template email** | ✅ Editor **drag-and-drop blok + HTML**, galeri starter, pustaka logo (`crm_brand_asset`), hapus + pratinjau inline/tab. **11 template.** |
| **Campaigns** | ✅ Step channel + Review (3) + **scheduled send WIB** (`crm_scheduled_send`), uji-kirim di step Pesan + kirim preview ke alamat apa pun, pilih run otomatis. |
| **Segmen** | ✅ Satu builder terpadu + segmen daftar email manual + **preset chips** (gaya Mailchimp) + filter AND-only sederhana + **asisten AI (OpenRouter/deepseek)** + kriteria waktu (bergabung/tidak aktif). |
| **Bahasa awam** | ✅ Sapuan jargon (PR #16): nama tabel/kolom/aksi-audit keluar dari layar harian; hanya di `/quality` diagnostik & `<Why>`. RFM → "Tingkat pelanggan". |
| **Redesign 20FIT Shop** | ⏳ Kerangka + Dashboard + Audience selesai; Kualitas/Templates/Settings tertunda. |

## 2. Angka kunci — DIUKUR ULANG 31 Agu 2026 (`count(*)` langsung ke produksi)

| Tabel | Baris | Catatan |
|---|---|---|
| `master_customer` | **82.830** | naik dari 82.253 (**+577** ingestion aktif) — pool **tak lagi beku** |
| `crm_customer_mirror` | 82.830 | cermin disegarkan; cocok master |
| `crm_customer_activity` | **732** | lapisan aktivitas (baru) |
| `crm_activity_event` | **1.460** | event aktivitas (baru) |
| `crm_consent` | 408.119 | arsip dasar hukum, bukan gerbang (K-36) |
| `crm_suppression` | **0** | belum ada permintaan berhenti |
| `crm_audit_log` | 289 | hidup (236 → 289) |
| `crm_message_log` | 1 | `delivered`, uji internal — belum ke pelanggan |
| `crm_campaign_run` | 10 | uji internal |
| `crm_message_template` | **11** | editor template dipakai |
| `crm_brand_asset` | 1 | pustaka logo |
| `crm_segment` | 3 | |
| `crm_workflow` / `_enrollment` | 0 / 0 | dibangun, belum diaktifkan |
| `crm_scheduled_send` | 0 | belum ada jadwal |
| `crm_test_recipient` | 1 | panel uji-kirim |
| `crm_user_role` | **4** | naik dari 3 (semula "3 semua super_admin") — **periksa apakah peran non-super_admin sudah ada** (RBAC diuji peran nyata) |
| `crm_profile_demographic` | **250** | 248 batch eksternal (T-35) + 2 isian staf |

## 3. Yang berubah di `main` sejak PR #16 (commit, bukan register)

Migrasi baru **26–28 Agu** (proacl/ledger belum tentu tercatat di README — **verifikasi**):
`…_seed_default_email_template`, `…_crm_email_unsubscribe`, `…_crm_test_recipient`,
`…_crm_activity_layer` (27), `…_ingest_activity_people` (28), `…_crm_workflow`,
`…_crm_brand_asset`, `…_crm_scheduled_send`. Fitur: lihat tabel §1.

## 4. Temuan/keputusan yang MASIH berlaku (dari register 25 Agu)

- **T-35 / K-47 (SELESAI):** 248 baris `crm_profile_demographic` ditulis pihak lain lewat
  `service_role` bersama. Grant longgar 7 tabel `crm_*` **dicabut** — kini ke-13 `{postgres,
  service_role}`, RLS ON, 0 memberi anon/authenticated. Pagar `scanCrmTableGrantsToAnonAuth`.
- **K-48 (DITERAPKAN):** rantai DOB `[nik, staging, clinic, hyrox, progressive, staff]`;
  `crm_profile_demographic` dibaca menurut `*_source`, tak lagi dianggap semua `staff`.
- **T-17 (BELUM diremediasi):** `master_customer` punya `authenticated_full_access` — 887 akun
  bisa tulis. Keputusan pemilik data.
- **K-36:** consent BUKAN gerbang; **unsubscribe (`crm_suppression`) satu-satunya gerbang**.
- **K-11:** nol hex / kelas warna bernomor. **K-19 (diperhalus):** kriteria waktu HANYA di
  lapisan aktivitas yang datanya nyata, bukan kolom load-stamp master.
- **Deploy:** produksi dari `main` (auto-deploy Railway). **Merge ke main = deploy.**

## 5. Yang menunggu tindakan manusia (cek `docs/MENUNGGU-TINDAKAN-MANUSIA.md`)

DNS `crm.20fit.id` (tautan unsubscribe mati) · ~~rotasi `MAILTRAP_API_TOKEN`~~ **(SELESAI 31 Agu —
token bocor `****8e0c` Expired, aktif `****2a44`)** + SPF/DKIM/DMARC (**masih memblokir kirim kampanye
pertama ke pelanggan**) · konfirmasi penulis 248 baris (T-35/B10a) ·
terapkan migrasi pencabutan grant bila belum di produksi (cek: ke-13 tabel sudah `{postgres,
service_role}` — **sudah** per ukur ulang) · remediasi T-17 · persetujuan Jeff (K-32/43/44) ·
sumber fitpoint.

## 6. Yang belum & pertanyaan terbuka untuk sesi berikut

1. **Perbarui register** (LINIMASA/TEMUAN/KEPUTUSAN) untuk fitur 26–28 Agu — **prioritas**.
2. **Verifikasi fitur baru vs klaim commit** lewat SQL + baca kode: apakah lapisan aktivitas,
   ingestion, workflow benar-benar jalan seperti pesan commit? (Pola pihak #2: jangan percaya
   laporan, ukur.) Cek khusus: `crm_user_role`=4 (peran apa?), tanggal-masa-depan T-14 (arena/
   hyrox/clinic s/d Des 2026 — sudah diangkat ke pemilik?).
3. **Workflow belum aktif** (0 baris) — apa yang menghalangi mengaktifkan welcome/re-engagement?
4. **Kirim ke pelanggan masih 0** (`crm_message_log`=1 internal) — penghalangnya rotasi token +
   DNS (§5), bukan kode.
5. **Redesign per-layar** sisa (Kualitas, Templates, Settings).
6. **Bahasa sisa:** footer Consent + Audit-log masih "service role / list.viewed".

## 7. Cara kerja (tetap)

Tiga pihak: pemilik produk memutuskan + pegang infra (Railway/Supabase/Mailtrap/DNS); **sesi chat
(pihak #2) menulis prompt DAN memverifikasi laporan lewat SQL langsung ke produksi**; Claude Code
menjalankan + melapor. **Rujukan lingkup teratas:** `docs/KEBUTUHAN-SISTEM.md` (bila dokumen lain
bertentangan, ia menang — kecuali angka database, selalu diukur ulang). Format prompt: tiru
`sprint-*/01-prompt.md` (aturan proses `git fetch` dulu, tugas bernomor, tabel LARANGAN, laporan
penutup bernomor, penutup "Jangan klaim apa pun yang belum kamu jalankan dan lihat hasilnya").

---

*Disusun 31 Agu 2026 dari `origin/main` (`7242a81`) + ukur ulang produksi. Angka `count(*)`, bukan
estimasi. PR #16 (sapuan bahasa + redesign + T-35) sudah merge ke `main`.*
