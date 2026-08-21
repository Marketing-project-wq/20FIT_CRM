# Menunggu tindakan manusia

Hal-hal yang **tidak bisa diselesaikan dari kode**. Tiap baris menaut ke dokumen sumbernya —
**jangan salin isinya ke sini** (dua salinan akan menyimpang). Perbarui/hapus baris saat tuntas.

Diperbarui: 19 Agustus 2026.

---

> ## BACA DULU — apa yang sebenarnya berisiko (K-27)
>
> Produksi men-deploy dari **branch**, bukan dari `main`. Maka:
>
> - **Merge ke `main` TIDAK mengubah apa yang berjalan.** Fitur sudah live lewat branch. Merge
>   hanya **menyelaraskan** `main` dengan produksi. Orang akan mengira merge adalah momen berisiko —
>   padahal bukan.
> - **Yang berisiko justru mengarahkan Railway ke `main` SEBELUM merge.** Itu memundurkan produksi
>   ke jalur baca lama + angka contactability salah **tanpa error**. Urutan wajib: **merge dulu, baru
>   repoint** (`docs/KOREKSI-DEPLOY.md` §"Kalau dibalik").
>
> Karena itu daftar di bawah dipisah tegas: apa yang harus benar **sebelum kode mendarat di `main`**,
> versus apa yang penting tetapi **jalan paralel** dan tak menahan merge.

---

## A. MEMBLOKIR MERGE — harus benar sebelum kode mendarat di `main`

Per K-27 tak ada **operasi** yang memblokir (fitur sudah live); yang memblokir adalah prasyarat
kualitas & izin agar `main` layak jadi cermin resmi produksi.

### A1. Gate hijau di HEAD yang akan di-merge
- **Siapa:** siapa pun yang menjalankan gate (agen/CI).
- **Langkah:** `tsc --noEmit` bersih · `next lint` bersih · `npx vitest run` seluruhnya hijau ·
  kelima pagar hijau · `NODE_ENV=production npm run build` lulus. Lihat laporan sprint terakhir.
- **Kalau dilewati:** `main` bisa berisi kode yang tak kompilasi/tak lulus test — cermin yang rusak.

### A2. Tinjauan PR #11 + izin merge eksplisit
- **Siapa:** pemilik repo (agen **tidak** merge sendiri).
- **Langkah:** tinjau per kelompok lewat `docs/PR-11-PANDUAN-TINJAU.md` (kelompok 1–2 = risiko tinggi,
  wajib mata; 3–6 punya bukti terlampir). Beri izin merge eksplisit.
- **Kalau dilewati:** perubahan skema + jalur tulis mendarat tanpa mata manusia di bagian berisiko.

### A3. Ledger ↔ repo terekonsiliasi
- **Siapa:** agen (sudah dikerjakan 19 Agu) + pemilik untuk verifikasi.
- **Status:** **selesai untuk migrasi 15/16/17** — berkas 16/17 ditarik verbatim dari PR #13; ledger
  README = 18 berkas → 19 entri (selisih +1 = migrasi 9 dua-apply, terdokumentasi). Utang tersisa:
  rekonsiliasi penuh agar `supabase db push` aman lagi — **bukan** penghalang merge, dicatat di README.
- **Kalau dilewati:** tak memblokir merge; hanya menahan `db push` (yang memang dilarang sampai beres).

---

## B. TIDAK MEMBLOKIR MERGE — penting, jalan paralel

Tak satu pun menahan merge (K-27). Diurut dari paling mendesak (keamanan) ke opsional.

### B1. Rotasi `MAILTRAP_API_TOKEN` (BOCOR) — paling mendesak (KEAMANAN, bukan merge)
- **Siapa:** pemegang akun Mailtrap + pemegang Variables Railway.
- **Langkah:** cabut token bocor → terbitkan baru → perbarui `MAILTRAP_API_TOKEN` di Railway (redeploy
  otomatis) → uji token lama ditolak. Rincian: `docs/SETUP-reset-password.md` §0.
- **Kalau dilewati:** siapa pun yang melihat screenshot bisa mengirim email atas nama `20fit.id` — dan
  email reset kata sandi paling dipercaya. **Paparan aktif** — kejar terpisah dari, dan lebih cepat dari, merge.

### B2. Verifikasi domain `20fit.id` di Mailtrap
- **Siapa:** pemegang akun Mailtrap + pemegang DNS `20fit.id`.
- **Langkah:** Mailtrap → Sending Domains → `20fit.id` → salin record verifikasi ke DNS → tunggu Verified.
  Rincian: `docs/SETUP-reset-password.md` §2–§3.
- **Kalau dilewati:** pengiriman dari `crm@20fit.id` ditolak — pengguna dapat halaman kode tapi email tak datang.

### B3. SPF, DKIM, DMARC di DNS `20fit.id`
- **Siapa:** pemegang DNS `20fit.id`.
- **Langkah:** tambah record dari Mailtrap; mulai DMARC `p=none`; verifikasi via `dig` + Gmail "Show
  original" (PASS). Rincian: `docs/SETUP-reset-password.md` §3.
- **Kalau dilewati:** email masuk Spam + spanduk "dangerous" betapapun rapi isinya. Propagasi DNS lambat — mulai awal.

### B4. Konfirmasi sumber deploy Railway — KEBERSIHAN (K-27)
- **Siapa:** pemegang akses dashboard Railway.
- **Langkah:** Railway → service produksi → Settings → Source → Branch. Catat branch. Lihat `docs/KOREKSI-DEPLOY.md`.
- **Kalau dilewati:** hanya merapikan catatan; T-18 sudah ditutup, tidak membuka apa pun.

### B5. Alih deploy ke `main` — KEBERSIHAN, dengan urutan wajib
- **Siapa:** pemilik repo + pemegang Railway.
- **Langkah:** **merge (branch→`main`) lebih dulu**, **baru** arahkan Railway ke `main`. Jangan dibalik
  (lihat "BACA DULU" + `docs/KOREKSI-DEPLOY.md`).
- **Kalau dilewati:** fitur tetap live lewat branch. Jadi perlu **hanya** begitu staf di luar tim dev
  memakai sistem rutin — saat itu urutan merge-dulu-baru-repoint jadi wajib.

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
