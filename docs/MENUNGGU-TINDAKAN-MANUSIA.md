# Menunggu tindakan manusia

Hal-hal yang **tidak bisa diselesaikan dari kode**. Tiap baris menaut ke dokumen sumbernya —
**jangan salin isinya ke sini** (dua salinan akan menyimpang). Perbarui/hapus baris saat tuntas.

Diperbarui: 24 Agustus 2026 (model deploy dikoreksi — lihat "BACA DULU" + T-27).

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
