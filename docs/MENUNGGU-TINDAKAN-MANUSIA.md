# Menunggu tindakan manusia

Hal-hal yang **tidak bisa diselesaikan dari kode** dan sedang memblokir. Diurut dari yang
memblokir paling banyak. Tiap baris menaut ke dokumen sumbernya — **jangan salin isinya ke
sini** (dua salinan akan menyimpang). Perbarui/hapus baris saat tuntas.

Diperbarui: 12 Agustus 2026.

---

## 1. Rotasi `MAILTRAP_API_TOKEN` (BOCOR) — paling mendesak
- **Siapa:** pemegang akun Mailtrap + pemegang Variables Railway.
- **Langkah:** cabut token bocor di Mailtrap → terbitkan baru → perbarui `MAILTRAP_API_TOKEN`
  di Railway (redeploy otomatis) → uji token lama ditolak. Rincian: `docs/SETUP-reset-password.md` §0.
- **Kalau dibiarkan:** siapa pun yang melihat screenshot itu bisa mengirim email atas nama
  `20fit.id` — dan email reset kata sandi adalah jenis yang paling dipercaya. Ini paparan aktif,
  bukan risiko teoretis.

## 2. Verifikasi domain `20fit.id` di Mailtrap
- **Siapa:** pemegang akun Mailtrap + pemegang DNS `20fit.id`.
- **Langkah:** Mailtrap → Sending Domains → `20fit.id` → salin record verifikasi ke DNS →
  tunggu Verified. Rincian: `docs/SETUP-reset-password.md` §2–§3.
- **Kalau dibiarkan:** **pengiriman dari `crm@20fit.id` ditolak sepenuhnya** — pengguna dapat
  halaman kode tapi email tak pernah datang, mudah disalahartikan sebagai "kode salah". Kode
  alur reset baru tak berguna tanpa ini.

## 3. Merge PR #11
- **Siapa:** pemilik repo (butuh izin eksplisit; agen tidak merge sendiri).
- **Langkah:** tinjau PR #11 → merge ke `main` → Railway deploy.
- **Kalau dibiarkan:** produksi masih pakai `resetPasswordForEmail()` → email dari "UOB
  Heartbeat Run", berisi tautan bukan kode → **staf yang lupa kata sandi tidak bisa masuk**.
  Migrasi 11 + 12 sudah berlaku di DB terlepas dari merge; yang menunggu hanya kodenya.

## 4. SPF, DKIM, DMARC di DNS `20fit.id`
- **Siapa:** pemegang DNS `20fit.id`.
- **Langkah:** tambahkan record dari Mailtrap; mulai DMARC `p=none`; verifikasi via `dig` +
  Gmail "Show original" (SPF/DKIM/DMARC = PASS). Rincian: `docs/SETUP-reset-password.md` §3.
- **Kalau dibiarkan:** email tetap masuk Spam + spanduk "dangerous" **betapapun rapi isinya**;
  staf tak menemukan emailnya. Propagasi DNS butuh waktu — kerjakan lebih awal.

## 5. Baris suppression pertama
- **Siapa:** staf CS/operator saat ada permintaan berhenti dihubungi **nyata**.
- **Langkah:** `/consent` → "Catat permintaan berhenti" (jalur tulis atomik sudah siap sejak
  Sprint 3H). Rincian: `docs/PERTAMA-suppression.md`.
- **Kalau dibiarkan:** tidak memblokir apa pun — aturan sudah benar (suppression menang). **Jangan
  buat baris uji**: suppression tak bisa dihapus (append-only), baris uji jadi permanen.

## 6. Jawaban legal: `basis` → `explicit_opt_in`
- **Siapa:** legal + pemilik produk.
- **Langkah:** petakan sumber impor ke bentuk consent-nya; bila ada catatan opt-in per orang,
  putuskan sumber mana naik ke `explicit_opt_in`. Rincian: `docs/SIGNOFF-legal-consent.md`.
- **Kalau dibiarkan:** tidak memblokir — backfill memakai `legacy_import_unverified` yang jujur,
  dan marketing sudah diizinkan (flag dibalik on-the-record). Ini peningkatan kualitas dasar
  hukum, bukan penghalang.
