# Menunggu tindakan manusia

Hal-hal yang **tidak bisa diselesaikan dari kode**. Tiap baris menaut ke dokumen sumbernya —
**jangan salin isinya ke sini** (dua salinan akan menyimpang). Perbarui/hapus baris saat tuntas.

Diperbarui: 31 Agustus 2026 (disisir: B1 token dirotasi & A2/PR #11 sudah merge — keduanya diturunkan;
lihat "Ringkasan status" di bawah).

> ## Ringkasan status (31 Agu 2026)
> **Tak ada lagi penghalang KONFIGURASI untuk kampanye ke pelanggan.** B1 (token), B2 (verifikasi
> domain), B3 (SPF/DKIM/DMARC) **semuanya SELESAI** — SPF/DKIM/DMARC PASS diverifikasi dari header
> email nyata di Gmail. Uji kirim internal (T-36) juga sudah tayang (PR #17/#18 merged).
>
> **Yang tersisa = KEHATI-HATIAN OPERASIONAL** (bukan penghalang teknis, tapi wajib sebelum kampanye
> besar pertama): ramp bertahap, auto-stop bounce 5% aktif lebih dulu, segmen pertama = paling mungkin
> merespons. Lihat kotak "KEHATI-HATIAN OPERASIONAL" di bawah + `docs/PETA-WORKFLOW.md` §Jalur A.
>
> **Sudah selesai, bukan lagi penghalang:** B1/B2/B3 (deliverability), A2/PR #11, B4, B5, B10b, B10c.
> Sisanya opsional atau operasional.

---

> ## BACA DULU — apa yang sebenarnya berisiko (dikoreksi 24 Agu 2026)
>
> **KOREKSI:** kotak lama di sini bilang "produksi dari branch, merge tidak mengubah apa-apa" —
> **itu salah dan sudah ditarik** (K-27 dibatalkan; T-22/K-25 dikoreksi; lihat T-27). Yang benar:
>
> - **Produksi men-deploy dari `main`, auto-deploy saat push** (dashboard Railway, Settings →
>   Source, dikonfirmasi 24 Agu 2026). **Merge ke `main` = deploy ke produksi seketika.**
> - Maka **merge JUSTRU momen berisiko** — bukan sekadar "menyelaraskan". Gate hijau + izin
>   eksplisit sebelum merge (bagian A) makin penting, bukan makin longgar.
> - Butir lama "arahkan Railway ke `main`" (B4/B5) **tak relevan** — Railway sudah menunjuk `main`
>   sejak awal; tak ada yang perlu di-repoint.

---

## A. MEMBLOKIR MERGE — harus benar sebelum kode mendarat di `main`

**Merge KE `main` = deploy ke produksi** (model dikoreksi 24 Agu 2026). Jadi merge itu sendiri
**operasi berisiko**: HEAD yang di-merge langsung tayang. Prasyarat di bawah wajib benar sebelum
merge, bukan sesudah.

### A1. Gate hijau di HEAD yang akan di-merge
- **Siapa:** siapa pun yang menjalankan gate (agen/CI).
- **Langkah:** `tsc --noEmit` bersih · `next lint` bersih · `npx vitest run` seluruhnya hijau ·
  kelima pagar hijau · `NODE_ENV=production npm run build` lulus. Lihat laporan sprint terakhir.
- **Kalau dilewati:** `main` bisa berisi kode yang tak kompilasi/tak lulus test — cermin yang rusak.

### A2. ~~Tinjauan PR #11 + izin merge~~ — ✅ SELESAI (PR #11 sudah merge; PR #16 juga)
PR #11 dan #13/#16 sudah lama merge ke `main`; butir ini usang. **Aturan yang tetap berlaku** (bukan
penghalang khusus, tapi kebijakan): **agen tidak merge sendiri — pemilik memberi izin merge eksplisit
per-PR.** Target tinjauan berjalan sekarang: **PR #17** (perbaikan uuid jalur kirim, T-36) — siap
ditinjau, bukan draft.

### A3. Ledger ↔ repo terekonsiliasi
- **Siapa:** agen (sudah dikerjakan 19 Agu) + pemilik untuk verifikasi.
- **Status:** **selesai untuk migrasi 15/16/17** — berkas 16/17 ditarik verbatim dari PR #13; ledger
  README = 18 berkas → 19 entri (selisih +1 = migrasi 9 dua-apply, terdokumentasi). Utang tersisa:
  rekonsiliasi penuh agar `supabase db push` aman lagi — **bukan** penghalang merge, dicatat di README.
- **Kalau dilewati:** tak memblokir merge; hanya menahan `db push` (yang memang dilarang sampai beres).

---

## B. TIDAK MEMBLOKIR MERGE — penting, jalan paralel

Tak satu pun menahan merge. Diurut dari paling mendesak (keamanan) ke opsional.

> ### ✅ DELIVERABILITY KAMPANYE PERTAMA — TAK ADA LAGI PENGHALANG KONFIGURASI (31 Agu 2026)
> **B1 (token), B2 (verifikasi domain), B3 (SPF/DKIM/DMARC) semuanya SELESAI.** SPF/DKIM/DMARC
> **PASS** diverifikasi dari **header email nyata yang sampai di Gmail** (bukan alat pemeriksa DNS):
> SPF PASS (IP 45.158.83.27), DKIM PASS (domain 20fit.id), DMARC PASS. **Yang tersisa bukan konfigurasi,
> melainkan KEHATI-HATIAN OPERASIONAL** (tetap berlaku penuh — lihat kotak berikut).

> ### ⚠️ KEHATI-HATIAN OPERASIONAL sebelum kampanye besar pertama (bukan penghalang teknis, tapi wajib)
> Domain ini **belum pernah mengirim volume besar**; reputasi dibangun bertahap. Tiga hal:
> 1. **Ramp bertahap** (`docs/RENCANA-batas-kirim.md`) — mulai kecil, naikkan **setelah** melihat
>    tingkat bounce, **bukan** langsung 700/hari.
> 2. **Auto-stop bounce 5% aktif SEBELUM kampanye besar pertama** (bukan sesudah). Sudah di engine
>    (`send-run.ts` rule 6, `shouldStopForBounces`); webhook kini mengisi `bounced_at` → data nyata.
> 3. **Segmen pertama = yang paling mungkin merespons, bukan yang terbesar** — bounce/keluhan di
>    kirim pertama merusak reputasi paling dalam. Kandidat terukur: `docs/PETA-WORKFLOW.md` §Jalur A.

### B1. ~~Rotasi `MAILTRAP_API_TOKEN` (BOCOR)~~ — ✅ SELESAI (31 Agu 2026, dikonfirmasi dari dashboard Mailtrap)
Token bocor **`****8e0c`** kini **Expired**; token aktif **`****2a44`** berlaku sampai **2027-08-28**.
Paparan ditutup — bukan lagi penghalang.

### B2. ~~Verifikasi domain `20fit.id` di Mailtrap~~ — ✅ SELESAI (31 Agu 2026)
Terverifikasi lewat DKIM PASS pada header email nyata yang sampai di Gmail (domain 20fit.id). Bukan lagi penghalang.

### B3. ~~SPF, DKIM, DMARC di DNS `20fit.id`~~ — ✅ SELESAI (31 Agu 2026, PASS dari header email nyata)
SPF PASS (IP 45.158.83.27) · DKIM PASS (20fit.id) · DMARC PASS — dibaca dari **header email nyata yang
sampai di Gmail**, bukan alat pemeriksa DNS. Deliverability siap; sisanya kehati-hatian operasional (kotak di atas).

### B4. ~~Konfirmasi sumber deploy Railway~~ — **SELESAI (24 Agu 2026)**
- Dikonfirmasi: Railway → service produksi → Settings → Source → **`main`**, auto-deploy saat
  push. Ini menutup pertanyaan "branch atau main" secara otoritatif dan membalik T-22 (lihat T-27).

### B5. ~~Alih deploy ke `main`~~ — **TAK RELEVAN**
- Tak ada yang perlu dialihkan: produksi **sudah** dari `main`. Butir lama ("merge dulu, baru
  repoint") lahir dari model yang keliru dan dihapus. `docs/KOREKSI-DEPLOY.md` seluruhnya ditarik.

### B6. Baris suppression pertama
- **Siapa:** staf CS/operator saat ada permintaan berhenti dihubungi **nyata**.
- **Langkah:** `/consent` → "Catat permintaan berhenti" (jalur tulis atomik siap sejak 3H). `docs/PERTAMA-suppression.md`.
- **Kalau dilewati:** tak memblokir apa pun. **Jangan buat baris uji** — suppression append-only, baris uji jadi permanen.

### B7. Jawaban legal: `basis` → `explicit_opt_in`
- **Siapa:** legal + pemilik produk.
- **Langkah:** petakan sumber impor ke bentuk consent; bila ada catatan opt-in per orang, putuskan mana
  naik ke `explicit_opt_in`. `docs/SIGNOFF-legal-consent.md`.
- **Kalau dilewati:** tak memblokir — backfill memakai `legacy_import_unverified` yang jujur; marketing sudah diizinkan.

### B8. (OPSIONAL) Indeks fungsional email di `staging_20fit_data`
- **Siapa:** pemilik `staging_20fit_data` (tim lain). **Agen tidak membuatnya** — di luar `crm_*`/`master_customer`.
- **SQL usulan:**
  ```sql
  create index if not exists staging_20fit_data_email_norm_idx
    on public.staging_20fit_data (lower(btrim("Email")));
  ```
- **Kalau dilewati:** bukan penghalang. RPC resolver sudah ~0,33 dtk hangat (13 Agu). Kejar hanya bila ekspor besar lambat.

### B9. (OPSIONAL) `ANTHROPIC_API_KEY` untuk asisten segmen AI
- **Siapa:** pemegang Variables Railway.
- **Langkah:** set `ANTHROPIC_API_KEY` (server-only, jangan prefix `NEXT_PUBLIC_`); opsional `SEGMENT_AI_MODEL`.
  Nama di `.env.example`.
- **Kalau dilewati:** bukan penghalang. Tanpa kunci, "Usulkan (AI)" menjawab 503; filter manual tetap lengkap.

### B10. (T-35) 248 baris `crm_profile_demographic` ditulis pihak lain — konfirmasi + putuskan
Ditemukan 25 Agu 2026. 248 baris ditulis satu batch (`2026-08-21 15:44:15 UTC`), seluruhnya
`gender_source='progressive_profiling'`, tanpa kolom provenance. Ditulis lewat `service_role`
bersama di proyek Supabase yang sama — **bukti pihak di luar CRM menulis ke `crm_*`**. Rincian
lengkap + audit grant 13 tabel `crm_*` di **`docs/riwayat/TEMUAN.md` T-35**. Tiga tindakan manusia:

- **B10a. Konfirmasi siapa/apa yang menulis 248 baris itu.** — **Siapa:** pemilik produk +
  pemegang akses lintas-tim (siapa memegang `service_role`/pipeline "progressive profiling").
  **Langkah:** telusuri sistem 20FIT mana yang menulis batch 21 Agu; pastikan 248 baris itu sah,
  bukan tumpahan tak sengaja. **Kalau dilewati:** DOB/gender dari sumber tak-terverifikasi terbaca
  seolah data internal. **Agen tidak menghapus/mengubah baris itu** — laporan lebih dulu.
- **B10b. ~~Terapkan migrasi pencabutan grant `crm_*` (K-47)~~ — ✅ SELESAI (25 Agu 2026, ledger
  `20260825164301`).** Pemilik produk meminta pencabutan eksplisit; diterapkan lewat `apply_migration`.
  Verifikasi pasca-apply: ke-13 tabel `crm_*` kini `{postgres, service_role}`, RLS tetap ON di ke-13,
  0 tabel memberi anon/authenticated. Pagar `scanCrmTableGrantsToAnonAuth` mencegah pembukaan ulang.
  Tak ada tindakan manusia tersisa di butir ini.
- **B10c. ~~Setujui posisi `progressive_profiling` di rantai DOB~~ — ✅ SELESAI (25 Agu 2026, K-48).**
  Pemilik produk menyetujui `[nik, staging, clinic, hyrox, progressive, staff]`; DITERAPKAN. Lapisan
  baca kini memeriksa `*_source` (`demographicProvenance`), tak lagi menganggap semua `staff` — 246 DOB
  yang salah label kini "isian mandiri". Tak ada tindakan manusia tersisa di butir ini.

### B11. (T-36) Kirim uji kampanye NYATA lewat `crm_test_recipient` — penghalang tinggal MERGE PR #17
Bug id-penerima-bukan-uuid sudah **diperbaiki di kode** (T-36): kampanye kini menolak lebih awal
alamat di luar pool, dan jalur uji internal (`crm_test_recipient` → harness) memakai uuid valid. Env
kirim **ada di produksi** (reset kata sandi + uji internal 25 Agu jalan) dan **token sudah dirotasi**
(B1). Jadi **satu-satunya penghalang tersisa = merge PR #17** supaya perbaikan tayang.
- **Siapa:** pemilik produk / operator dengan akses UI produksi.
- **Langkah:** merge PR #17 → tunggu deploy Railway → Campaigns → Kirim uji (memakai `crm_test_recipient`,
  kini `tifany@20fit.id`) → jalankan sekali → laporkan artefaknya (`crm_message_log` bertambah,
  `provider_message_id` terisi, satu audit `campaign.sent`, email sampai).
- **Tak bisa dari sesi agen:** env kirim kosong di kontainer & uji berjalan di produksi (deploy dari `main`).
- **Kalau dilewati:** rantai kirim tetap belum terbukti ujung-ke-ujung di produksi (walau kode benar).
